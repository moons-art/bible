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
import { subscribeUserProfile, consumeCreditInFirestore, addCreditsToUser } from '../services/userService';

export function useAiUsage() {
  const [usageState, setUsageState] = useState<AiUsageState>(getAiUsageState());
  const [currentUid, setCurrentUid] = useState<string | null>(auth.currentUser?.uid || null);

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
          };
          try {
            localStorage.setItem('nations_ai_commentary_usage_v1', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
      }
    }, auth.currentUser?.email);

    return () => unsubProfile();
  }, [currentUid]);

  // 3. 로컬 이벤트 리스너 (기존 호환성)
  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<AiUsageState>;
      if (customEvent.detail) {
        setUsageState(customEvent.detail);
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

  // 총 한도 (무료 10회 + 유료 충전 잔여분 + 누적 사용분)
  const totalCapacity = useMemo(() => {
    if (!isLoggedIn) return 10;
    if (paidRemaining <= 0) return 10;
    // 무료(10회) + 유료(보너스/충전분) + 누적 사용량 합산으로 분모/분자 정밀 일치
    return freeRemaining + paidRemaining + totalUsed;
  }, [isLoggedIn, freeRemaining, paidRemaining, totalUsed]);

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
    isAvailable,
    isLoggedIn,
    consume,
    recharge,
    canUse: () => isAvailable,
  };
}

