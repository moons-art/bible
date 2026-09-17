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
        setUsageState(prev => ({
          ...prev,
          monthlyFreeRemaining: firestoreCredits.freeRemaining,
          paidRemaining: firestoreCredits.paidRemaining,
          paidExpiresAt: firestoreCredits.paidExpiresAt,
          totalUsed: firestoreCredits.totalUsed || 0,
        }));
      }
    });

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

  const totalRemaining = usageState.monthlyFreeRemaining + usageState.paidRemaining;
  const isAvailable = totalRemaining > 0;

  // 총 한도 (무료만 있으면 10회, 유료 충전 시 충전 규모 기준 한도 계산)
  const totalCapacity = useMemo(() => {
    if (usageState.paidRemaining <= 0) return 10;
    const base = usageState.paidRemaining + (usageState.totalUsed || 0);
    return Math.max(10, Math.ceil(base / 100) * 100);
  }, [usageState.paidRemaining, usageState.totalUsed]);

  // 차감 로직 (로그인 시 Firestore 원자적 차감 + 로컬 스토리지 동시 업데이트)
  const consume = useCallback((reference: string) => {
    if (currentUid) {
      consumeCreditInFirestore(currentUid, reference);
    }
    const success = consumeAiCredit(reference);
    if (success) {
      setUsageState(getAiUsageState());
    }
    return success;
  }, [currentUid]);

  // 충전 로직 (시뮬레이션 또는 로컬 충전)
  const recharge = useCallback((count: number) => {
    if (currentUid) {
      addCreditsToUser(currentUid, count, '앱 내 충전');
    }
    addPaidCredits(count);
    setUsageState(getAiUsageState());
  }, [currentUid]);

  const remainingDaysText = useMemo(() => {
    return getRemainingDaysText();
  }, [usageState]);

  return {
    usageState,
    totalRemaining,
    totalCapacity,
    remainingDaysText,
    freeRemaining: usageState.monthlyFreeRemaining,
    paidRemaining: usageState.paidRemaining,
    totalUsed: usageState.totalUsed,
    isAvailable,
    consume,
    recharge,
    canUse: canUseAi,
  };
}
