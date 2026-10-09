// NATIONS BIBLE 서버 사용량 & 예상 비용 초경량 실시간 모니터링 서비스
// 과금 0원 원칙: 단일 날짜 문서(system_metrics/{YYYY-MM-DD}) 및 단일 월 문서(system_metrics_monthly/{YYYY-MM})에
// 버퍼링된 increment 방식으로 누적 기록하여 대시보드 조회 시 단 2회의 getDoc(오늘 1회 + 이번달 1회)만으로 전체 현황을 파악합니다.

import { doc, getDoc, setDoc, increment } from 'firebase/firestore';
import { db } from '../api/firebaseConfig';
import type { UserProfile } from './userService';

export interface DailySystemMetrics {
  date: string; // 'YYYY-MM-DD'
  aiCalls: number; // AI 주석 호출 수
  firestoreReads: number; // Firestore 읽기 수
  firestoreWrites: number; // Firestore 쓰기 수
  updatedAt?: number;
}

export interface MonthlySystemMetrics {
  month: string; // 'YYYY-MM'
  aiCalls: number; // 이번달 AI 주석 호출 수
  firestoreReads: number; // 이번달 Firestore 읽기 수
  firestoreWrites: number; // 이번달 Firestore 쓰기 수
  updatedAt?: number;
}

// 비용 및 무료 쿼터 기준 상수
export const FIRESTORE_LIMITS = {
  DAILY_FREE_READS: 50000,
  DAILY_FREE_WRITES: 20000,
  DAILY_FREE_DELETES: 20000,
  // 초과 시 1회당 단가 (USD 환율 약 1,350원 기준)
  // Read: $0.06 / 100,000회 = 약 0.00081원
  // Write: $0.18 / 100,000회 = 약 0.00243원
  READ_COST_PER_UNIT: 0.00081,
  WRITE_COST_PER_UNIT: 0.00243,
  // Gemini 2.5/Flash 기준 AI 1회당 약 2원
  AI_CALL_COST: 2,
};

// 공식 콘솔 링크
export const FIREBASE_CONSOLE_USAGE_URL = 'https://console.firebase.google.com/project/ym-bible/usage';

// 현재 날짜 키 (YYYY-MM-DD)
export function getTodayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 현재 월 키 (YYYY-MM)
export function getCurrentMonthKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// 메모리 내 버퍼 (과도한 파이어스토어 쓰기 방지 및 0원 과금 보장)
let bufferReads = 0;
let bufferWrites = 0;
let bufferAiCalls = 0;
let flushTimer: any = null;
let isFlushing = false;

// 캐시된 오늘 및 이번달 메트릭
let cachedTodayMetrics: DailySystemMetrics | null = null;
let cachedMonthlyMetrics: MonthlySystemMetrics | null = null;

// 버퍼를 Firestore에 increment로 일괄 동기화 (Debounce flush)
async function flushBufferToFirestore() {
  if (isFlushing) return;
  if (bufferReads === 0 && bufferWrites === 0 && bufferAiCalls === 0) return;

  const readsToSync = bufferReads;
  const writesToSync = bufferWrites;
  const aiToSync = bufferAiCalls;

  // 버퍼 리셋
  bufferReads = 0;
  bufferWrites = 0;
  bufferAiCalls = 0;

  isFlushing = true;
  const todayKey = getTodayDateKey();
  const monthKey = getCurrentMonthKey();

  try {
    const metricDocRef = doc(db, 'system_metrics', todayKey);
    const monthlyDocRef = doc(db, 'system_metrics_monthly', monthKey);

    // 오늘 문서와 이번달 문서를 병렬 단일 setDoc으로 누적
    await Promise.all([
      setDoc(metricDocRef, {
        date: todayKey,
        firestoreReads: increment(readsToSync),
        firestoreWrites: increment(writesToSync),
        aiCalls: increment(aiToSync),
        updatedAt: Date.now()
      }, { merge: true }),
      setDoc(monthlyDocRef, {
        month: monthKey,
        firestoreReads: increment(readsToSync),
        firestoreWrites: increment(writesToSync),
        aiCalls: increment(aiToSync),
        updatedAt: Date.now()
      }, { merge: true })
    ]);

    // 로컬 캐시 즉시 업데이트
    if (cachedTodayMetrics && cachedTodayMetrics.date === todayKey) {
      cachedTodayMetrics = {
        ...cachedTodayMetrics,
        firestoreReads: (cachedTodayMetrics.firestoreReads || 0) + readsToSync,
        firestoreWrites: (cachedTodayMetrics.firestoreWrites || 0) + writesToSync,
        aiCalls: (cachedTodayMetrics.aiCalls || 0) + aiToSync,
        updatedAt: Date.now()
      };
    }

    if (cachedMonthlyMetrics && cachedMonthlyMetrics.month === monthKey) {
      cachedMonthlyMetrics = {
        ...cachedMonthlyMetrics,
        firestoreReads: (cachedMonthlyMetrics.firestoreReads || 0) + readsToSync,
        firestoreWrites: (cachedMonthlyMetrics.firestoreWrites || 0) + writesToSync,
        aiCalls: (cachedMonthlyMetrics.aiCalls || 0) + aiToSync,
        updatedAt: Date.now()
      };
    }

    // 갱신 이벤트 전송 (대시보드 실시간 반영)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('system-metrics-updated', { 
        detail: { 
          today: cachedTodayMetrics,
          monthly: cachedMonthlyMetrics
        } 
      }));
    }
  } catch (err) {
    console.warn('[systemMetricsService] flushBufferToFirestore non-fatal error:', err);
    // 실패 시 다시 버퍼로 복원
    bufferReads += readsToSync;
    bufferWrites += writesToSync;
    bufferAiCalls += aiToSync;
  } finally {
    isFlushing = false;
  }
}

// 스케줄러: 4.5초 후 일괄 전송
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushBufferToFirestore();
  }, 4500);
}

// 브라우저 닫기/새로고침 시 잔여 버퍼 동기화
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (bufferReads > 0 || bufferWrites > 0 || bufferAiCalls > 0) {
      flushBufferToFirestore();
    }
  });
}

/**
 * AI 주석 호출 1회 기록
 */
export function trackAiCall(count: number = 1): void {
  bufferAiCalls += count;
  scheduleFlush();
}

/**
 * Firestore 읽기 N회 기록
 */
export function trackFirestoreRead(count: number = 1): void {
  bufferReads += count;
  scheduleFlush();
}

/**
 * Firestore 쓰기 N회 기록
 */
export function trackFirestoreWrite(count: number = 1): void {
  bufferWrites += count;
  scheduleFlush();
}

/**
 * [관리자 대시보드 전용] 오늘 및 이번달 누적 시스템 메트릭 동시 조회 (오직 단 2회 읽기, 과금 0원)
 */
export async function fetchSystemMetricsOverview(forceRefresh: boolean = false): Promise<{
  today: DailySystemMetrics;
  monthly: MonthlySystemMetrics;
}> {
  const todayKey = getTodayDateKey();
  const monthKey = getCurrentMonthKey();

  // 강제 새로고침이 아니고 캐시가 유효하면 즉시 반환
  if (!forceRefresh && cachedTodayMetrics?.date === todayKey && cachedMonthlyMetrics?.month === monthKey) {
    return {
      today: {
        ...cachedTodayMetrics,
        firestoreReads: cachedTodayMetrics.firestoreReads + bufferReads,
        firestoreWrites: cachedTodayMetrics.firestoreWrites + bufferWrites,
        aiCalls: cachedTodayMetrics.aiCalls + bufferAiCalls
      },
      monthly: {
        ...cachedMonthlyMetrics,
        firestoreReads: cachedMonthlyMetrics.firestoreReads + bufferReads,
        firestoreWrites: cachedMonthlyMetrics.firestoreWrites + bufferWrites,
        aiCalls: cachedMonthlyMetrics.aiCalls + bufferAiCalls
      }
    };
  }

  // 버퍼에 대기 중인 데이터 플러시
  if (bufferReads > 0 || bufferWrites > 0 || bufferAiCalls > 0) {
    await flushBufferToFirestore();
  }

  try {
    const todayDocRef = doc(db, 'system_metrics', todayKey);
    const monthDocRef = doc(db, 'system_metrics_monthly', monthKey);

    const [todaySnap, monthSnap] = await Promise.all([
      getDoc(todayDocRef),
      getDoc(monthDocRef)
    ]);

    if (todaySnap.exists()) {
      const data = todaySnap.data() as DailySystemMetrics;
      cachedTodayMetrics = {
        date: todayKey,
        aiCalls: Number(data.aiCalls || 0),
        firestoreReads: Number(data.firestoreReads || 0),
        firestoreWrites: Number(data.firestoreWrites || 0),
        updatedAt: data.updatedAt || Date.now()
      };
    } else {
      cachedTodayMetrics = {
        date: todayKey,
        aiCalls: 0,
        firestoreReads: 0,
        firestoreWrites: 0,
        updatedAt: Date.now()
      };
    }

    if (monthSnap.exists()) {
      const data = monthSnap.data() as MonthlySystemMetrics;
      cachedMonthlyMetrics = {
        month: monthKey,
        aiCalls: Number(data.aiCalls || 0),
        firestoreReads: Number(data.firestoreReads || 0),
        firestoreWrites: Number(data.firestoreWrites || 0),
        updatedAt: data.updatedAt || Date.now()
      };
    } else {
      cachedMonthlyMetrics = {
        month: monthKey,
        aiCalls: cachedTodayMetrics.aiCalls,
        firestoreReads: cachedTodayMetrics.firestoreReads,
        firestoreWrites: cachedTodayMetrics.firestoreWrites,
        updatedAt: Date.now()
      };
    }

    return {
      today: {
        ...cachedTodayMetrics,
        firestoreReads: cachedTodayMetrics.firestoreReads + bufferReads,
        firestoreWrites: cachedTodayMetrics.firestoreWrites + bufferWrites,
        aiCalls: cachedTodayMetrics.aiCalls + bufferAiCalls
      },
      monthly: {
        ...cachedMonthlyMetrics,
        firestoreReads: cachedMonthlyMetrics.firestoreReads + bufferReads,
        firestoreWrites: cachedMonthlyMetrics.firestoreWrites + bufferWrites,
        aiCalls: cachedMonthlyMetrics.aiCalls + bufferAiCalls
      }
    };
  } catch (err) {
    console.warn('[systemMetricsService] fetchSystemMetricsOverview fallback:', err);
    return {
      today: cachedTodayMetrics || { date: todayKey, aiCalls: 0, firestoreReads: 0, firestoreWrites: 0 },
      monthly: cachedMonthlyMetrics || { month: monthKey, aiCalls: 0, firestoreReads: 0, firestoreWrites: 0 }
    };
  }
}

/**
 * 하위 호환용 오늘 메트릭 단일 조회
 */
export async function fetchTodaySystemMetrics(forceRefresh: boolean = false): Promise<DailySystemMetrics> {
  const overview = await fetchSystemMetricsOverview(forceRefresh);
  return overview.today;
}

/**
 * 당일 예상 원가 및 무료 한도 분석 계산 헬퍼
 */
export function calculateEstimatedCost(metrics: DailySystemMetrics) {
  const aiCost = (metrics.aiCalls || 0) * FIRESTORE_LIMITS.AI_CALL_COST;
  const excessReads = Math.max(0, (metrics.firestoreReads || 0) - FIRESTORE_LIMITS.DAILY_FREE_READS);
  const excessWrites = Math.max(0, (metrics.firestoreWrites || 0) - FIRESTORE_LIMITS.DAILY_FREE_WRITES);

  const readCost = excessReads * FIRESTORE_LIMITS.READ_COST_PER_UNIT;
  const writeCost = excessWrites * FIRESTORE_LIMITS.WRITE_COST_PER_UNIT;
  const firestoreCost = Math.round(readCost + writeCost);
  const totalCost = Math.round(aiCost + firestoreCost);

  const readsUsagePercent = Math.min(100, ((metrics.firestoreReads || 0) / FIRESTORE_LIMITS.DAILY_FREE_READS) * 100);
  const writesUsagePercent = Math.min(100, ((metrics.firestoreWrites || 0) / FIRESTORE_LIMITS.DAILY_FREE_WRITES) * 100);

  const remainingReads = Math.max(0, FIRESTORE_LIMITS.DAILY_FREE_READS - (metrics.firestoreReads || 0));
  const remainingWrites = Math.max(0, FIRESTORE_LIMITS.DAILY_FREE_WRITES - (metrics.firestoreWrites || 0));

  const isFreeQuotaReads = (metrics.firestoreReads || 0) <= FIRESTORE_LIMITS.DAILY_FREE_READS;
  const isFreeQuotaWrites = (metrics.firestoreWrites || 0) <= FIRESTORE_LIMITS.DAILY_FREE_WRITES;
  const isServerCostZero = firestoreCost === 0;

  return {
    aiCost,
    firestoreCost,
    totalCost,
    isServerCostZero,
    isFreeQuotaReads,
    isFreeQuotaWrites,
    readsUsagePercent: Number(readsUsagePercent.toFixed(1)),
    writesUsagePercent: Number(writesUsagePercent.toFixed(1)),
    remainingReads,
    remainingWrites
  };
}

/**
 * 이번달 누적 예상 원가 계산 헬퍼
 */
export function calculateMonthlyEstimatedCost(metrics: MonthlySystemMetrics) {
  const aiCost = (metrics.aiCalls || 0) * FIRESTORE_LIMITS.AI_CALL_COST;
  // 월간 무료 한도 추정 (일 50,000 * 30 = 1,500,000회 읽기, 일 20,000 * 30 = 600,000회 쓰기)
  const monthlyFreeReads = FIRESTORE_LIMITS.DAILY_FREE_READS * 30;
  const monthlyFreeWrites = FIRESTORE_LIMITS.DAILY_FREE_WRITES * 30;

  const excessReads = Math.max(0, (metrics.firestoreReads || 0) - monthlyFreeReads);
  const excessWrites = Math.max(0, (metrics.firestoreWrites || 0) - monthlyFreeWrites);

  const readCost = excessReads * FIRESTORE_LIMITS.READ_COST_PER_UNIT;
  const writeCost = excessWrites * FIRESTORE_LIMITS.WRITE_COST_PER_UNIT;
  const firestoreCost = Math.round(readCost + writeCost);
  const totalCost = Math.round(aiCost + firestoreCost);

  const readsUsagePercent = Math.min(100, ((metrics.firestoreReads || 0) / monthlyFreeReads) * 100);
  const writesUsagePercent = Math.min(100, ((metrics.firestoreWrites || 0) / monthlyFreeWrites) * 100);

  const remainingReads = Math.max(0, monthlyFreeReads - (metrics.firestoreReads || 0));
  const remainingWrites = Math.max(0, monthlyFreeWrites - (metrics.firestoreWrites || 0));

  const isFreeQuotaReads = (metrics.firestoreReads || 0) <= monthlyFreeReads;
  const isFreeQuotaWrites = (metrics.firestoreWrites || 0) <= monthlyFreeWrites;
  const isServerCostZero = firestoreCost === 0;

  return {
    aiCost,
    firestoreCost,
    totalCost,
    isServerCostZero,
    isFreeQuotaReads,
    isFreeQuotaWrites,
    readsUsagePercent: Number(readsUsagePercent.toFixed(1)),
    writesUsagePercent: Number(writesUsagePercent.toFixed(1)),
    remainingReads,
    remainingWrites
  };
}

/**
 * 회원별 서버 점유량 및 원가 계산 헬퍼 (0원 과금: 추가 DB 조회 없이 기존 로드 객체에서 즉시 계산)
 */
export function calculateUserResourceUsage(user: UserProfile) {
  const totalAiUsed = user.aiCredits?.totalUsed || 0;
  const totalAiCost = totalAiUsed * FIRESTORE_LIMITS.AI_CALL_COST; // 1회 약 2원
  const noteCount = user.noteCount || 0;
  const sermonCount = user.sermonCount || 0;
  const crossRefCount = user.crossRefCount || 0;
  const commentaryCount = user.commentaryCount || 0;
  const cloudCommentaryCount = user.usedCloudCommentaryCount || 0;
  const totalStoredDocuments = noteCount + sermonCount + crossRefCount + commentaryCount + cloudCommentaryCount;

  // 총 결제 금액 계산
  const totalPaid = (user.rechargeHistory || []).reduce((acc, cur) => acc + (cur.amount || 0), 0);

  // 관리자 마진 계산: 결제금액 - 발생 AI원가
  const netContribution = totalPaid - totalAiCost;
  const marginPercent = totalPaid > 0 ? Math.round(((totalPaid - totalAiCost) / totalPaid) * 100) : null;

  // 서버 점유 부하 지수 계산 (Load Score)
  // 설교 1편당 가중치 3점, 구절 메모/관주/주석 1개당 1점, 클라우드 주석 1개당 1점, AI호출 1회당 0.5점, 접속 횟수당 0.1점
  const loadScore = (sermonCount * 3) + (noteCount * 1) + (crossRefCount * 1) + (commentaryCount * 1) + (cloudCommentaryCount * 1) + (totalAiUsed * 0.5) + ((user.loginCount || 1) * 0.1);

  // 서버 점유 안전 지수 판정
  let safetyStatus: 'safe' | 'normal' | 'caution' | 'warning' = 'safe';
  let safetyLabel = '매우 안전 (0.01% 미만)';
  let safetyScorePercent = Math.min(100, Math.round((loadScore / 2000) * 100));

  if (loadScore >= 3000) {
    safetyStatus = 'warning';
    safetyLabel = '경고 (비정상 헤비 점유 의심)';
  } else if (loadScore >= 1000) {
    safetyStatus = 'caution';
    safetyLabel = '주의 (헤비 이용자)';
  } else if (loadScore >= 200) {
    safetyStatus = 'normal';
    safetyLabel = '정상 이용 (일반 활동 유저)';
  }

  return {
    totalAiUsed,
    totalAiCost,
    noteCount,
    sermonCount,
    crossRefCount,
    commentaryCount,
    cloudCommentaryCount,
    totalStoredDocuments,
    totalPaid,
    netContribution,
    marginPercent,
    loadScore: Math.round(loadScore),
    safetyStatus,
    safetyLabel,
    safetyScorePercent
  };
}
