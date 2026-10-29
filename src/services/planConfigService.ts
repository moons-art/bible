import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../api/firebaseConfig';
import { trackFirestoreRead, trackFirestoreWrite } from './systemMetricsService';

// ── 신규 이용권 & 멤버십 플랜 설정 인터페이스 ─────────────────────────────────

// 1. 클라우드 멤버십 요금제 (라이트 / 프로 / 마스터)
export interface CloudMembershipPlanConfig {
  id: 'lite' | 'pro' | 'master';
  name: string;
  badge?: string;
  targetUser: string;
  monthlyPrice: number;       // 월 구독 금액 (예: 3900, 5900, 8900)
  monthlyCredits: number;     // 매월 지급 AI 크레딧 (20, 40, 80)
  yearlyPrice: number;        // 연간 결제 금액 (33000, 55000, 88000)
  yearlyEquivalentMonthly: number; // 월 환산 상당액 (2750, 4590, 7340)
  yearlyCredits: number;      // 연 결제 시 즉시 지급 크레딧 (250, 500, 1000)
  yearlyValidityYears: number;// 유효기간 (기본 1년)
  creditValidityYears?: number;// 지급 크레딧 사용 유효기간 (기본 1년, 마스터는 2년)
  serverExtensionFee: number; // 2년차부터 서버유지 연장비 (11000)
  cloudVerseLimit: number;    // 주석 클라우드 보관 구절 수 (200, 500, 31102)
  cloudVerseLimitText: string;// 안내 텍스트 ('최대 200구절', '최대 500구절', '성경 66권 전체')
  isPopular?: boolean;
}

// 2. 클라우드 멤버십 전용 갱신권
export interface RenewalPlanConfig {
  name: string;
  price: number;              // 11000
  equivalentMonthly: number;  // 900
  bonusCredits: number;       // 200
  validityYears: number;      // 1
  description: string;
}

// 3. AI 크레딧 단독 충전 상품 (AI 200 / AI 500)
export interface AiCreditPackageConfig {
  id: 'ai200' | 'ai500';
  name: string;
  credits: number;            // 200, 500
  price: number;              // 5500, 11000
  validityDays: number;       // 365
}

// 레거시 호환용 인터페이스
export interface CreditPlanConfig {
  name: string;
  credits: number;
  price: number;
  periodText?: string;
  note?: string;
}

export interface CloudPlanConfig {
  name: string;
  limit: number;
  bonusCredits: number;
  price: number;
  isPopular?: boolean;
}

export interface CloudNotesPolicy {
  free: boolean;          // 무료 회원 기본 (기본값: false - 기기 저장 전용)
  lite: boolean;          // 라이트 플랜 (기본값: true - 클라우드 멤버십 실시간 동기화)
  standard: boolean;      // 스탠다드 플랜 (기본값: true - 레거시 호환)
  pro: boolean;           // 프로 플랜 (기본값: true - 클라우드 멤버십 실시간 동기화)
  master: boolean;        // 마스터 플랜 (기본값: true - 클라우드 멤버십 성경 66권 전체)
  cloudPurchased: boolean;// 주석 클라우드 이용권 구매자 (기본값: true)
}

// 전체 플랜 설정 통합 인터페이스
export interface SubscriptionPlansSettings {
  // ── [신규 체계] ──
  membershipPlans: {
    lite: CloudMembershipPlanConfig;
    pro: CloudMembershipPlanConfig;
    master: CloudMembershipPlanConfig;
  };
  renewalPlan: RenewalPlanConfig;
  creditPackages: {
    ai200: AiCreditPackageConfig;
    ai500: AiCreditPackageConfig;
  };

  // ── [무료 & 정책] ──
  freeMonthlyCredits: number;
  freeDeviceRetentionDays: number;
  cloudNotesPolicy: CloudNotesPolicy;

  // ── [하위 호환성 유지용 레거시 필드] ──
  creditPlans: {
    lite: CreditPlanConfig;
    standard: CreditPlanConfig;
    pro: CreditPlanConfig;
  };
  cloudPlans: {
    cloud300: CloudPlanConfig;
    cloud1000: CloudPlanConfig;
    cloudUnlimited: CloudPlanConfig;
  };
  updatedAt?: number;
}

// ── 기본값 (신규 정책 100% 반영) ──────────────────────────────────────────
export const DEFAULT_PLANS_SETTINGS: SubscriptionPlansSettings = {
  freeMonthlyCredits: 10,
  freeDeviceRetentionDays: 30,
  cloudNotesPolicy: {
    free: false,
    lite: true,          // 클라우드 멤버십 라이트: 서버 동기화 ON
    standard: true,      // 레거시 호환
    pro: true,           // 클라우드 멤버십 프로: 서버 동기화 ON
    master: true,        // 클라우드 멤버십 마스터: 서버 동기화 ON
    cloudPurchased: true,
  },

  // 1. 신규 클라우드 멤버십 플랜 (라이트 / 프로 / 마스터)
  membershipPlans: {
    lite: {
      id: 'lite',
      name: '클라우드 라이트',
      targetUser: 'AI 주석보다 클라우드 서버 통해 나만의 설교노트와 구절별 메모 등 데이터베이스를 구축하려는 전도사님, 강도사님',
      monthlyPrice: 3900,
      monthlyCredits: 20,
      yearlyPrice: 33000,
      yearlyEquivalentMonthly: 2750,
      yearlyCredits: 250,
      yearlyValidityYears: 1,
      serverExtensionFee: 11000,
      cloudVerseLimit: 200,
      cloudVerseLimitText: '최대 200구절 클라우드 보관',
    },
    pro: {
      id: 'pro',
      name: '클라우드 프로',
      badge: '목회자 추천',
      targetUser: '나만의 클라우드 서버와 함께 AI 주석과 설교자료도 어느 정도 필요한 강도사님, 부목사님',
      monthlyPrice: 5900,
      monthlyCredits: 40,
      yearlyPrice: 55000,
      yearlyEquivalentMonthly: 4590,
      yearlyCredits: 500,
      yearlyValidityYears: 1,
      serverExtensionFee: 11000,
      cloudVerseLimit: 500,
      cloudVerseLimitText: '최대 500구절 클라우드 보관',
      isPopular: true,
    },
    master: {
      id: 'master',
      name: '클라우드 마스터',
      badge: '최고 인기',
      targetUser: '성경 66권 AI 주석 서재를 완성하려는 목회자, 설교자료가 필요한 담임 목사님',
      monthlyPrice: 8900,
      monthlyCredits: 80,
      yearlyPrice: 88000,
      yearlyEquivalentMonthly: 7340,
      yearlyCredits: 1000,
      yearlyValidityYears: 1,      // 멤버십 연간 유효기간: 1년
      creditValidityYears: 2,      // 1,000 크레딧 사용 유효기간: 2년
      serverExtensionFee: 11000,
      cloudVerseLimit: 31102,
      cloudVerseLimitText: '성경 66권 전체 클라우드 영구 보관',
    },
  },

  // 2. 클라우드 멤버십 전용 갱신권
  renewalPlan: {
    name: '클라우드 +365',
    price: 11000,
    equivalentMonthly: 900,
    bonusCredits: 200,
    validityYears: 1,
    description: '2년 차부터 적용되는 서버 유지 및 보관 연장권 (월 900원 상당, AI 200 크레딧 즉시 지급)',
  },

  // 3. AI 크레딧 단독 충전 요금제
  creditPackages: {
    ai200: {
      id: 'ai200',
      name: 'AI 200',
      credits: 200,
      price: 5500,
      validityDays: 365,
    },
    ai500: {
      id: 'ai500',
      name: 'AI 500',
      credits: 500,
      price: 11000,
      validityDays: 365,
    },
  },

  // 레거시 하위 호환 필드
  creditPlans: {
    lite: {
      name: '라이트 플랜',
      credits: 200,
      price: 5500,
      periodText: '1년(365일)',
      note: 'AI 200 크레딧 충전',
    },
    standard: {
      name: '스탠다드 플랜',
      credits: 500,
      price: 11000,
      periodText: '1년(365일)',
      note: 'AI 500 크레딧 충전',
    },
    pro: {
      name: '프로플랜',
      credits: 1000,
      price: 55000,
      periodText: '1년(365일)',
      note: '클라우드 프로 연간 플랜',
    },
  },
  cloudPlans: {
    cloud300: {
      name: '클라우드 라이트',
      limit: 200,
      bonusCredits: 250,
      price: 33000,
    },
    cloud1000: {
      name: '클라우드 프로',
      limit: 500,
      bonusCredits: 500,
      price: 55000,
      isPopular: true,
    },
    cloudUnlimited: {
      name: '클라우드 마스터',
      limit: 31102,
      bonusCredits: 1000,
      price: 88000,
    },
  },
};

// ── 인메모리 캐시 ──────────────────────────────────────────────────────────
let inMemoryPlanConfig: SubscriptionPlansSettings | null = null;
let pendingPlanConfigPromise: Promise<SubscriptionPlansSettings> | null = null;

/**
 * Firestore (system_settings/subscription_plans)에서 최신 플랜 설정 조회
 */
export async function fetchRemotePlanSettings(): Promise<SubscriptionPlansSettings> {
  if (pendingPlanConfigPromise) return pendingPlanConfigPromise;

  pendingPlanConfigPromise = (async () => {
    try {
      const snap = await getDoc(doc(db, 'system_settings', 'subscription_plans'));
      trackFirestoreRead(1);
      if (snap.exists()) {
        const data = snap.data();
        const merged: SubscriptionPlansSettings = {
          membershipPlans: {
            lite: { ...DEFAULT_PLANS_SETTINGS.membershipPlans.lite, ...(data.membershipPlans?.lite || {}) },
            pro: { ...DEFAULT_PLANS_SETTINGS.membershipPlans.pro, ...(data.membershipPlans?.pro || {}) },
            master: { ...DEFAULT_PLANS_SETTINGS.membershipPlans.master, ...(data.membershipPlans?.master || {}) },
          },
          renewalPlan: {
            ...DEFAULT_PLANS_SETTINGS.renewalPlan,
            ...(data.renewalPlan || {}),
          },
          creditPackages: {
            ai200: { ...DEFAULT_PLANS_SETTINGS.creditPackages.ai200, ...(data.creditPackages?.ai200 || {}) },
            ai500: { ...DEFAULT_PLANS_SETTINGS.creditPackages.ai500, ...(data.creditPackages?.ai500 || {}) },
          },
          freeMonthlyCredits: data.freeMonthlyCredits ?? DEFAULT_PLANS_SETTINGS.freeMonthlyCredits,
          freeDeviceRetentionDays: data.freeDeviceRetentionDays ?? DEFAULT_PLANS_SETTINGS.freeDeviceRetentionDays,
          creditPlans: {
            lite: { ...DEFAULT_PLANS_SETTINGS.creditPlans.lite, ...(data.creditPlans?.lite || {}) },
            standard: { ...DEFAULT_PLANS_SETTINGS.creditPlans.standard, ...(data.creditPlans?.standard || {}) },
            pro: { ...DEFAULT_PLANS_SETTINGS.creditPlans.pro, ...(data.creditPlans?.pro || {}) },
          },
          cloudPlans: {
            cloud300: { ...DEFAULT_PLANS_SETTINGS.cloudPlans.cloud300, ...(data.cloudPlans?.cloud300 || {}) },
            cloud1000: { ...DEFAULT_PLANS_SETTINGS.cloudPlans.cloud1000, ...(data.cloudPlans?.cloud1000 || {}) },
            cloudUnlimited: { ...DEFAULT_PLANS_SETTINGS.cloudPlans.cloudUnlimited, ...(data.cloudPlans?.cloudUnlimited || {}) },
          },
          cloudNotesPolicy: {
            ...DEFAULT_PLANS_SETTINGS.cloudNotesPolicy,
            ...(data.cloudNotesPolicy || {}),
          },
          updatedAt: data.updatedAt,
        };
        inMemoryPlanConfig = merged;
        return merged;
      }
    } catch (e) {
      console.warn('[planConfigService] fetchRemotePlanSettings failed, using default:', e);
    } finally {
      pendingPlanConfigPromise = null;
    }

    inMemoryPlanConfig = DEFAULT_PLANS_SETTINGS;
    return DEFAULT_PLANS_SETTINGS;
  })();

  return pendingPlanConfigPromise;
}

/**
 * 플랜 설정 조회 (인메모리 캐시 우선, forceRefresh 시 원격 동기화)
 */
export async function getPlanSettings(forceRefresh: boolean = false): Promise<SubscriptionPlansSettings> {
  if (!forceRefresh && inMemoryPlanConfig) {
    return inMemoryPlanConfig;
  }
  return await fetchRemotePlanSettings();
}

/**
 * 플랜 설정 저장 (관리자 대시보드에서 수정 후 저장)
 */
export async function savePlanSettings(settings: SubscriptionPlansSettings): Promise<void> {
  const ref = doc(db, 'system_settings', 'subscription_plans');
  const payload = {
    ...settings,
    updatedAt: Date.now(),
  };

  await setDoc(ref, payload, { merge: true });
  trackFirestoreWrite(1);

  // 인메모리 캐시 즉시 갱신
  inMemoryPlanConfig = payload;

  // 전체 앱에 설정 변경 이벤트 브로드캐스트
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('plan-config-updated', { detail: payload }));
  }
}

/**
 * 회원의 노트/설교 클라우드 서버 동기화 허용 여부 판별
 * 1) 관리자가 특정 회원에게 수동 설정한 cloudNotesAllowed가 있으면 최우선 적용
 * 2) 없으면 회원의 구독권 / 플랜 정책에 따라 판별
 */
export function canUserSyncCloudNotes(
  userProfile?: {
    cloudNotesAllowed?: boolean;
    plan?: string;
    subscribedPlan?: string;
    cloudCommentaryLimit?: number;
    email?: string | null;
  } | null,
  settings?: SubscriptionPlansSettings | null
): boolean {
  if (!userProfile) return false;

  // 0순위: 관리자 계정은 항상 무제한 클라우드 노트 동기화 100% 허용 (데이터 절대 보존)
  const userEmail = (userProfile.email || '').trim().toLowerCase();
  if (userEmail === 'ymoonsik@gmail.com' || userEmail === 'global0103@naver.com') {
    return true;
  }

  // 1순위: 관리자 수동 개별 지정 (true면 강제 허용, false면 강제 차단)
  if (typeof userProfile.cloudNotesAllowed === 'boolean') {
    return userProfile.cloudNotesAllowed;
  }

  const policy = settings?.cloudNotesPolicy || inMemoryPlanConfig?.cloudNotesPolicy || DEFAULT_PLANS_SETTINGS.cloudNotesPolicy;

  // 2순위: 주석 클라우드 이용권(200, 300, 500, 1000, 31102, 무제한) 구매자 여부
  if ((userProfile.cloudCommentaryLimit || 0) > 0) {
    return !!policy.cloudPurchased;
  }

  // 3순위: 구독 플랜에 따른 정책 (하위 호환성 100% 보장: plan 및 subscribedPlan, 영문/한글 모두 지원)
  const rawPlan = (userProfile.subscribedPlan || userProfile.plan || 'free').trim().toLowerCase();
  
  // 마스터 / 프로 / 라이트 클라우드 멤버십 플랜
  if (rawPlan.includes('master') || rawPlan.includes('마스터')) return !!(policy.master ?? true);
  if (rawPlan.includes('pro') || rawPlan.includes('프로')) return !!policy.pro;
  if (rawPlan.includes('standard') || rawPlan.includes('스탠다드') || rawPlan.includes('스탠다')) return !!policy.standard;
  if (rawPlan.includes('lite') || rawPlan.includes('라이트')) return !!policy.lite;
  if (rawPlan.includes('renewal') || rawPlan.includes('365') || rawPlan.includes('갱신')) return true;

  return !!policy.free;
}

/**
 * 회원의 구독 플랜에 따른 월간 지급 크레딧 한도 판별
 * (월간 구독일 경우: 라이트 20, 프로 40, 마스터 80 등 매월 한도로 지급되며 다음 달 리셋 시 한도로 복원)
 * (연간 결제자는 연간 크레딧이 즉시 지급되므로 월간 한도 갱신 대상이 아님)
 */
export function getMonthlyCreditsQuota(
  planName?: string,
  settings?: SubscriptionPlansSettings | null
): { isMonthlySubscriber: boolean; quota: number } {
  if (!planName) return { isMonthlySubscriber: false, quota: 10 };

  const raw = planName.toLowerCase().trim();
  const currentSettings = settings || inMemoryPlanConfig || DEFAULT_PLANS_SETTINGS;

  // 연간 결제자 또는 갱신권 이용자는 월간 구독이 아니므로 월 한도 리셋 대상이 아님
  const isYearly = raw.includes('연간') || raw.includes('yearly') || raw.includes('365') || raw.includes('갱신');
  if (isYearly) {
    return { isMonthlySubscriber: false, quota: 0 };
  }

  // 월간 구독자 판별
  if (raw.includes('master') || raw.includes('마스터')) {
    return {
      isMonthlySubscriber: true,
      quota: currentSettings.membershipPlans.master.monthlyCredits || 80
    };
  }
  if (raw.includes('pro') || raw.includes('프로')) {
    return {
      isMonthlySubscriber: true,
      quota: currentSettings.membershipPlans.pro.monthlyCredits || 40
    };
  }
  if (raw.includes('lite') || raw.includes('라이트')) {
    return {
      isMonthlySubscriber: true,
      quota: currentSettings.membershipPlans.lite.monthlyCredits || 20
    };
  }

  return { isMonthlySubscriber: false, quota: 10 };
}

