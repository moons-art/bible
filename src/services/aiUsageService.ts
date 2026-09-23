// NATIONS BIBLE AI 주석 사용량 및 구독/충전 관리 서비스

export interface AiUsageState {
  monthKey: string; // 'YYYY-MM' 형식 (예: '2026-09')
  monthlyFreeRemaining: number; // 월 10회 기본 제공 중 잔여 횟수
  paidRemaining: number; // 유료 충전 잔여 횟수
  paidExpiresAt?: number; // 유료 충전 만료 타임스탬프 (1년 365일 유효)
  totalUsed: number; // 누적 사용 횟수
  cloudCommentaryLimit?: number;
  usedCloudCommentaryCount?: number;
  history: Array<{
    timestamp: number;
    reference: string;
  }>;
}

const STORAGE_KEY = 'nations_ai_commentary_usage_v1';
const MONTHLY_FREE_QUOTA = 10;

// 현재 연월 키 반환 (예: '2026-09')
function getCurrentMonthKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// 스토리지에서 상태 읽기 (월 변경 시 자동 10회 갱신)
export function getAiUsageState(): AiUsageState {
  const currentMonth = getCurrentMonthKey();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial: AiUsageState = {
        monthKey: currentMonth,
        monthlyFreeRemaining: MONTHLY_FREE_QUOTA,
        paidRemaining: 0,
        totalUsed: 0,
        cloudCommentaryLimit: 0,
        usedCloudCommentaryCount: 0,
        history: [],
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }

    const state: AiUsageState = JSON.parse(raw);

    // 새로운 달이 시작된 경우:
    // 플랜 구독자(paidRemaining > 0)는 무료 10개 미지급(0)
    // 미구독자이거나 크레딧을 다 써서 paidRemaining === 0인 경우 다음 달부터 10개로 갱신 (누적 합산이 아닌 10개로 시작)
    if (state.monthKey !== currentMonth) {
      state.monthKey = currentMonth;
      state.monthlyFreeRemaining = (state.paidRemaining && state.paidRemaining > 0) ? 0 : MONTHLY_FREE_QUOTA;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    return state;
  } catch (err) {
    console.error('Failed to read AI usage state:', err);
    return {
      monthKey: currentMonth,
      monthlyFreeRemaining: MONTHLY_FREE_QUOTA,
      paidRemaining: 0,
      totalUsed: 0,
      cloudCommentaryLimit: 0,
      usedCloudCommentaryCount: 0,
      history: [],
    };
  }
}

// 상태 저장 및 이벤트 브로드캐스트
function saveAiUsageState(state: AiUsageState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('ai-usage-updated', { detail: state }));
  } catch (err) {
    console.error('Failed to save AI usage state:', err);
  }
}

// AI 사용 가능 여부 확인
export function canUseAi(): boolean {
  const state = getAiUsageState();
  return (state.monthlyFreeRemaining + state.paidRemaining) > 0;
}

// 총 잔여 횟수 반환
export function getTotalRemainingCredits(): number {
  const state = getAiUsageState();
  return state.monthlyFreeRemaining + state.paidRemaining;
}

// 총 제공/충전 한도 반환 (기본 10회, 유료 충전 시 충전된 총 수량)
export function getTotalCapacity(): number {
  const state = getAiUsageState();
  if (state.paidRemaining <= 0) {
    return MONTHLY_FREE_QUOTA;
  }
  return state.paidRemaining + (state.totalUsed || 0);
}

// 1회 크레딧 차감 (무료 크레딧 우선 차감 후 유료 크레딧 차감)
export function consumeAiCredit(reference: string): boolean {
  const state = getAiUsageState();
  if (state.monthlyFreeRemaining > 0) {
    state.monthlyFreeRemaining -= 1;
    state.totalUsed += 1;
    state.history.unshift({ timestamp: Date.now(), reference });
    saveAiUsageState(state);
    return true;
  } else if (state.paidRemaining > 0) {
    state.paidRemaining -= 1;
    state.totalUsed += 1;
    state.history.unshift({ timestamp: Date.now(), reference });
    saveAiUsageState(state);
    return true;
  }
  return false;
}

// 유료 크레딧 충전 (충전 시점부터 1년 365일 유효기간 부여, 유료 플랜 회원은 무료 10개 미지급)
export function addPaidCredits(count: number): void {
  const state = getAiUsageState();
  state.paidRemaining += count;
  state.monthlyFreeRemaining = 0; // 플랜 구독자는 무료 크레딧 미지급 원칙
  const oneYearFromNow = Date.now() + 365 * 24 * 60 * 60 * 1000;
  // 기존 유효기간이 미래에 남아있다면 더 늦은 날짜로 갱신
  state.paidExpiresAt = state.paidExpiresAt && state.paidExpiresAt > Date.now()
    ? Math.max(state.paidExpiresAt, oneYearFromNow)
    : oneYearFromNow;
  saveAiUsageState(state);
}

// 남은 일수 문자열 반환 (유료 크레딧이 있으면 365일 기준 잔여일, 없으면 이번 달 말일까지 남은 일수)
export function getRemainingDaysText(): string {
  const state = getAiUsageState();
  const now = new Date();
  
  if (state.paidRemaining > 0) {
    // 기존 데이터에 유료 잔여분이 있으나 만료일이 지정되지 않았던 경우 365일 기본 부여
    if (!state.paidExpiresAt) {
      state.paidExpiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;
      saveAiUsageState(state);
      return '365일 남음';
    }
    const diffMs = state.paidExpiresAt - Date.now();
    const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    return days > 0 ? `${days}일 남음` : '만료됨';
  }

  // 무료 크레딧인 경우: 이번 달 말일까지 남은 일수
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const diffMs = endOfMonth.getTime() - now.getTime();
  const days = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  return `이번 달 ${days}일 남음`;
}

// 무료 크레딧 리셋 (테스트 또는 관리자용)
export function resetFreeCredits(): void {
  const state = getAiUsageState();
  state.monthlyFreeRemaining = MONTHLY_FREE_QUOTA;
  saveAiUsageState(state);
}

// 로그아웃 시 로컬 AI 사용량 및 기록 완전 삭제
export function clearAiUsageState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('ai-usage-updated', {
      detail: {
        monthKey: getCurrentMonthKey(),
        monthlyFreeRemaining: 0,
        paidRemaining: 0,
        totalUsed: 0,
        cloudCommentaryLimit: 0,
        usedCloudCommentaryCount: 0,
        history: [],
      }
    }));
  } catch (e) {
    console.error('Failed to clear AI usage state:', e);
  }
}

