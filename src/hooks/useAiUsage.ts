import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  getAiUsageState, 
  canUseAi, 
  getTotalRemainingCredits, 
  getTotalCapacity,
  getRemainingDaysText,
  consumeAiCredit, 
  addPaidCredits,
  type AiUsageState 
} from '../services/aiUsageService';
import { auth } from '../api/firebaseConfig';
import { subscribeUserProfile, consumeCreditInFirestore, addCreditsToUser, type UserProfile } from '../services/userService';

export function useAiUsage() {
  const [usageState, setUsageState] = useState<AiUsageState>(getAiUsageState());
  const [currentUid, setCurrentUid] = useState<string | null>(auth.currentUser?.uid || null);
  const [profileMeta, setProfileMeta] = useState<Pick<UserProfile, 'subscribedPlan' | 'subscribedAt' | 'rechargeHistory' | 'cloudSubscribedAt'>>({});

  // 1. Firebase Auth 상태 감지
  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((user) => {
      setCurrentUid(user ? user.uid : null);
    });
    return () => unsubAuth();
  }, []);

  // 2. 로그인 유저의 경우 Firestore 실시간 구독 연동
  useEffect(() => {
    if (!currentUid) return;

    const unsubProfile = subscribeUserProfile(currentUid, (profile) => {
      if (profile && profile.aiCredits) {
        const firestoreCredits = profile.aiCredits;
        setUsageState(prev => {
          const updated = {
            ...prev,
            monthlyFreeRemaining: firestoreCredits.freeRemaining,
            paidRemaining: firestoreCredits.paidRemaining,
            paidExpiresAt: firestoreCredits.paidExpiresAt,
            totalUsed: firestoreCredits.totalUsed || 0,
            cloudCommentaryLimit: profile.cloudCommentaryLimit || 0,
            usedCloudCommentaryCount: profile.usedCloudCommentaryCount || 0,
          };
          try {
            localStorage.setItem('nations_ai_commentary_usage_v1', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
        setProfileMeta({
          subscribedPlan: profile.subscribedPlan,
          subscribedAt: profile.subscribedAt,
          rechargeHistory: profile.rechargeHistory,
          cloudSubscribedAt: profile.cloudSubscribedAt,
        });

        // 주석 클라우드 구독 회원인 경우, 기존 로컬 30일 기록을 클라우드로 자동 안전 동기화
        if ((profile.cloudCommentaryLimit || 0) > 0) {
          import('../services/aiHistoryService').then(m => m.syncLocalHistoryToCloud(currentUid)).catch(() => {});
        }
      }
    }, auth.currentUser?.email);

    return () => unsubProfile();
  }, [currentUid]);

  // 3. 로컬 이벤트 리스너 (기존 호환성)
  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<AiUsageState>;
      if (customEvent.detail) {
        setUsageState(prev => ({
          ...prev,
          ...customEvent.detail,
          cloudCommentaryLimit: customEvent.detail.cloudCommentaryLimit !== undefined
            ? customEvent.detail.cloudCommentaryLimit
            : (prev.cloudCommentaryLimit || 0),
          usedCloudCommentaryCount: customEvent.detail.usedCloudCommentaryCount !== undefined
            ? customEvent.detail.usedCloudCommentaryCount
            : (prev.usedCloudCommentaryCount || 0),
        }));
      } else {
        setUsageState(getAiUsageState());
      }
    };

    window.addEventListener('ai-usage-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('ai-usage-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const isLoggedIn = !!currentUid;
  const freeRemaining = isLoggedIn ? usageState.monthlyFreeRemaining : 0;
  const paidRemaining = isLoggedIn ? usageState.paidRemaining : 0;
  const totalUsed = isLoggedIn ? (usageState.totalUsed || 0) : 0;
  const totalRemaining = freeRemaining + paidRemaining;
  const isAvailable = isLoggedIn && totalRemaining > 0;

  // 총 한도 (무료 사용자: 10회, 유료 구독자: 총 충전 크레딧 수)
  const totalCapacity = useMemo(() => {
    if (!isLoggedIn) return 10;
    if (paidRemaining <= 0) return 10;
    return paidRemaining + totalUsed;
  }, [isLoggedIn, paidRemaining, totalUsed]);

  // 차감 로직 (로그인 시 Firestore 원자적 차감 + 로컬 스토리지 동시 업데이트)
  const consume = useCallback((reference: string) => {
    if (!currentUid) return false;
    consumeCreditInFirestore(currentUid, reference);
    const success = consumeAiCredit(reference);
    if (success) {
      setUsageState(getAiUsageState());
    }
    return success;
  }, [currentUid]);

  // 충전 로직 (시뮬레이션 또는 로컬 충전)
  const recharge = useCallback((count: number) => {
    if (!currentUid) return;
    addCreditsToUser(currentUid, count, '앱 내 충전');
    addPaidCredits(count);
    setUsageState(getAiUsageState());
  }, [currentUid]);

  const remainingDaysText = useMemo(() => {
    if (!isLoggedIn) return '로그인 필요';
    return getRemainingDaysText();
  }, [isLoggedIn, usageState]);

  return {
    usageState,
    totalRemaining,
    totalCapacity,
    remainingDaysText,
    freeRemaining,
    paidRemaining,
    totalUsed,
    cloudCommentaryLimit: usageState.cloudCommentaryLimit || 0,
    usedCloudCommentaryCount: usageState.usedCloudCommentaryCount || 0,
    isAvailable,
    isLoggedIn,
    consume,
    recharge,
    canUse: () => isAvailable,
    // 구독 메타
    subscribedPlan: profileMeta.subscribedPlan,
    subscribedAt: profileMeta.subscribedAt,
    rechargeHistory: profileMeta.rechargeHistory || [],
    cloudSubscribedAt: profileMeta.cloudSubscribedAt,
  };
}

