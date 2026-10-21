// NATIONS BIBLE 사용자 프로필, 크레딧 및 관리자 제어 서비스
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  collection, 
  getDocs, 
  getCountFromServer,
  onSnapshot, 
  serverTimestamp,
  increment,
  arrayUnion,
  query,
  where,
  orderBy,
  limit,
  deleteField
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../api/firebaseConfig';
import { trackFirestoreRead, trackFirestoreWrite } from './systemMetricsService';
import { getMonthlyCreditsQuota } from './planConfigService';

export const ADMIN_EMAILS = ['ymoonsik@gmail.com', 'global0103@naver.com'];
export const ADMIN_EMAIL = 'ymoonsik@gmail.com';

export function isAdminUser(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return ADMIN_EMAILS.some(admin => admin.toLowerCase() === normalized);
}

export interface RechargeHistoryItem {
  id: string;
  amount: number;
  planName: string;
  date: number;
  expiresAt?: number; // 충전별 유효기간 만료일시 (만료일 우선 차감용)
  remaining?: number; // 해당 충전건의 남은 잔여 크레딧
}

export interface DeviceSession {
  device: string;        // 예: 'macOS (Chrome)', 'iOS (Safari)', 'Windows (Edge)'
  lastLoginAt: number;   // 마지막 접속 일시
  loginCount?: number;   // 해당 기기 접속 횟수
}

export interface UserPreferences {
  selectedVersionIds?: string[];
  versionOrder?: string[];
  copyMode?: string;
  showVersionInCopy?: boolean;
  copyMultiOption?: 'kr' | 'en' | 'kr+en' | 'all';
  mainKrVersionId?: string;
  mainEnVersionId?: string;
  lineHeight?: number;
  updatedAt?: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  preferences?: UserPreferences;
  createdAt: number;
  lastLoginAt: number;
  loginCount: number;
  deviceInfo: string;
  devices?: DeviceSession[]; // 로그인/접속했던 모든 기기 목록 및 세션 정보
  aiCredits: {
    freeRemaining: number;        // 무료 기본 한도 (월 10회)
    monthlyRemaining?: number;    // 월간 구독 한도 크레딧 잔여 (라이트 20, 프로 40, 마스터 80 등, 이월 불가 한도형)
    bonusRemaining?: number;      // 선물/프로모션/추천 보너스 크레딧 잔여 (유효기간 1년)
    paidRemaining: number;        // 유료 충전/연간 결제 크레딧 잔여 (유효기간 1년/2년)
    totalUsed: number;
    lastResetMonth: string;       // 'YYYY-MM'
    paidExpiresAt?: number;
  };
  cloudCommentaryLimit?: number;
  usedCloudCommentaryCount?: number;
  cloudNotesAllowed?: boolean; // 관리자 개별 지정 노트/설교 클라우드 저장 허용 여부 (true: 강제 허용, false: 강제 차단, undefined: 플랜 정책 따름)
  allowedVersions: string[]; // 관리자가 원격 허용한 번역본 ID 목록 (예: ['built-in-krv'])
  noteCount?: number;
  sermonCount?: number;
  crossRefCount?: number;
  commentaryCount?: number;
  activityCount?: number;
  lastAction?: string;
  lastBonusReason?: string;
  lastBonusGrantedAt?: number;
  subscribedPlan?: string;
  subscribedAt?: number;
  rechargeHistory?: RechargeHistoryItem[];
  cloudSubscribedAt?: number;
  isNewSignUp?: boolean;
  hasSeenWelcome?: boolean;
  inviteCode?: string;
  referredByUid?: string;
  referralBonusAwarded?: boolean;
  invitedFriends?: Array<{
    uid: string;
    email: string;
    name: string;
    joinedAt: number;
    hasGeneratedCommentary?: boolean;
    bonusAwarded?: boolean;
  }>;
}

export interface ActivityLogEntry {
  id: string;
  userEmail: string;
  userName: string;
  action: string;
  details: string;
  timestamp: string;
}

// 현재 연월 키 ('YYYY-MM')
function getCurrentMonthKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// 접속 기기 환경 간단 감지
export function getDeviceInfo(): string {
  if (typeof window === 'undefined' || !window.navigator) return 'Unknown';
  const ua = window.navigator.userAgent;
  let os = '기타';
  if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/Chrome|CriOS/i.test(ua) && !/Edge|Edg/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';
  else if (/Edg/i.test(ua)) browser = 'Edge';

  return `${os} (${browser})`;
}

export type SyncUserInput = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
};

function cleanUndefined<T extends Record<string, any>>(obj: T): T {
  const result: any = Array.isArray(obj) ? [] : {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined) {
      if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
        result[key] = cleanUndefined(val);
      } else {
        result[key] = val;
      }
    }
  }
  return result;
}

/**
 * 로그인 시 사용자 프로필 동기화 및 생성 (Firebase User 또는 GoogleProfile 공용 지원)
 */
export async function syncUserProfile(
  user: SyncUserInput | User, 
  extraStats?: { noteCount?: number; sermonCount?: number; crossRefCount?: number; commentaryCount?: number }
): Promise<UserProfile> {
  const uid = user.uid;
  if (!uid) throw new Error('유효한 사용자 ID(uid)가 없습니다.');

  const userEmail = (user.email || '').trim().toLowerCase();
  const userRef = doc(db, 'users', uid);
  const currentMonth = getCurrentMonthKey();
  const now = Date.now();
  const devInfo = getDeviceInfo();

  // 이전 fallback 문서(user_이메일)가 있다면 데이터 계승
  let inheritedAllowedVersions: string[] = [];
  let inheritedPaidCredits: number = 0;
  let inheritedBonusCredits: number = 0;
  let inheritedPaidExpiresAt: number | undefined = undefined;
  let inheritedCloudLimit: number = 0;
  let inheritedCloudSubscribedAt: number | undefined = undefined;
  let inheritedSubscribedPlan: string | undefined = undefined;
  let inheritedSubscribedAt: number | undefined = undefined;
  let inheritedRechargeHistory: any[] = [];
  let inheritedDevices: DeviceSession[] = [];
  let hasFallbackDocToDelete = false;

  if (userEmail) {
    const fallbackId = 'user_' + userEmail.replace(/[^a-zA-Z0-9]/g, '_');
    if (fallbackId !== uid) {
      try {
        const fbSnap = await getDoc(doc(db, 'users', fallbackId));
        if (fbSnap.exists()) {
          const fbData = fbSnap.data() as UserProfile;
          inheritedAllowedVersions = fbData.allowedVersions || [];
          inheritedPaidCredits = fbData.aiCredits?.paidRemaining || 0;
          inheritedBonusCredits = fbData.aiCredits?.bonusRemaining || 0;
          inheritedPaidExpiresAt = fbData.aiCredits?.paidExpiresAt;
          inheritedCloudLimit = fbData.cloudCommentaryLimit || 0;
          inheritedCloudSubscribedAt = fbData.cloudSubscribedAt;
          inheritedSubscribedPlan = fbData.subscribedPlan;
          inheritedSubscribedAt = fbData.subscribedAt;
          inheritedRechargeHistory = fbData.rechargeHistory || [];
          inheritedDevices = fbData.devices || (fbData.deviceInfo ? [{ device: fbData.deviceInfo, lastLoginAt: fbData.lastLoginAt || now, loginCount: 1 }] : []);
          hasFallbackDocToDelete = true;
        } else {
          // 통합 인증(sermon-ym) 전환 시 기존 ym-bible의 동일 이메일 회원 데이터(크레딧/플랜/번역본 권한) 자동 계승
          const emailQ = query(collection(db, 'users'), where('email', '==', userEmail), limit(1));
          const emailSnap = await getDocs(emailQ);
          if (!emailSnap.empty && emailSnap.docs[0].id !== uid) {
            const fbData = emailSnap.docs[0].data() as UserProfile;
            inheritedAllowedVersions = fbData.allowedVersions || [];
            inheritedPaidCredits = fbData.aiCredits?.paidRemaining || 0;
            inheritedBonusCredits = fbData.aiCredits?.bonusRemaining || 0;
            inheritedPaidExpiresAt = fbData.aiCredits?.paidExpiresAt;
            inheritedCloudLimit = fbData.cloudCommentaryLimit || 0;
            inheritedCloudSubscribedAt = fbData.cloudSubscribedAt;
            inheritedSubscribedPlan = fbData.subscribedPlan;
            inheritedSubscribedAt = fbData.subscribedAt;
            inheritedRechargeHistory = fbData.rechargeHistory || [];
            inheritedDevices = fbData.devices || [];
          }
        }
      } catch (e) {}
    }
  }

  try {
    const snap = await getDoc(userRef);
    trackFirestoreRead(1);

    if (!snap.exists()) {
      // 신규 유저 생성 (프로모션 설정 확인 후 보너스 자동 지급)
      let initialPaidCredits = inheritedPaidCredits;
      let initialBonusCredits = inheritedBonusCredits;
      let bonusReason = '';
      try {
        const { getPromotionSettings } = await import('./promotionService');
        const promo = await getPromotionSettings();
        if (promo.enabled && promo.bonusCredits > 0) {
          initialBonusCredits += promo.bonusCredits;
          bonusReason = `가입 프로모션 (${promo.name}): +${promo.bonusCredits}회`;
          const signupHistoryItem: RechargeHistoryItem = {
            id: `signup_${now}`,
            amount: promo.bonusCredits,
            planName: '가입이벤트',
            date: now,
            expiresAt: now + 365 * 24 * 60 * 60 * 1000,
            remaining: promo.bonusCredits,
          };
          inheritedRechargeHistory.push(signupHistoryItem);
          console.log(`[userService] 🎉 신규 가입 프로모션 적용: +${promo.bonusCredits}회 (${user.email})`);
        }
      } catch (promoErr) {
        console.warn('[userService] Failed to check promotion on signup:', promoErr);
      }

      // 기기 목록 초기화
      const initialDevices: DeviceSession[] = [...inheritedDevices];
      const devIdx = initialDevices.findIndex(d => d.device === devInfo);
      if (devIdx >= 0) {
        initialDevices[devIdx].lastLoginAt = now;
        initialDevices[devIdx].loginCount = (initialDevices[devIdx].loginCount || 1) + 1;
      } else {
        initialDevices.push({
          device: devInfo,
          lastLoginAt: now,
          loginCount: 1,
        });
      }

      const oneYearLater = now + 365 * 24 * 60 * 60 * 1000;
      const newProfile: UserProfile = {
        uid,
        email: user.email || '',
        displayName: user.displayName || user.email?.split('@')[0] || '이용자',
        photoURL: user.photoURL || '',
        createdAt: now,
        lastLoginAt: now,
        loginCount: 1,
        deviceInfo: devInfo,
        devices: initialDevices,
        aiCredits: {
          freeRemaining: (initialPaidCredits > 0 || initialBonusCredits > 0) ? 0 : 10,
          monthlyRemaining: 0,
          bonusRemaining: initialBonusCredits,
          paidRemaining: initialPaidCredits,
          totalUsed: 0,
          lastResetMonth: currentMonth,
          paidExpiresAt: (initialPaidCredits > 0 || initialBonusCredits > 0) ? oneYearLater : inheritedPaidExpiresAt,
        },
        cloudCommentaryLimit: inheritedCloudLimit,
        cloudSubscribedAt: inheritedCloudSubscribedAt,
        subscribedPlan: inheritedSubscribedPlan,
        subscribedAt: inheritedSubscribedAt,
        rechargeHistory: inheritedRechargeHistory,
        usedCloudCommentaryCount: 0,
        allowedVersions: inheritedAllowedVersions,
        noteCount: extraStats?.noteCount || 0,
        sermonCount: extraStats?.sermonCount || 0,
        crossRefCount: extraStats?.crossRefCount || 0,
        commentaryCount: extraStats?.commentaryCount || 0,
        lastBonusReason: bonusReason || undefined,
        lastBonusGrantedAt: bonusReason ? now : undefined,
        isNewSignUp: true,
        hasSeenWelcome: false,
      };

      await setDoc(userRef, cleanUndefined(newProfile));
      trackFirestoreWrite(1);

      // 중복 fallback 문서 정리
      if (hasFallbackDocToDelete && userEmail) {
        const fallbackId = 'user_' + userEmail.replace(/[^a-zA-Z0-9]/g, '_');
        deleteDoc(doc(db, 'users', fallbackId)).catch(() => {});
      }
      
      // 클라이언트 UI 및 로컬 스토리지 즉각 동기화 (0초 반영)
      try {
        const usagePayload = {
          monthKey: newProfile.aiCredits.lastResetMonth,
          monthlyFreeRemaining: newProfile.aiCredits.freeRemaining,
          monthlyQuotaRemaining: newProfile.aiCredits.monthlyRemaining || 0,
          bonusRemaining: newProfile.aiCredits.bonusRemaining || 0,
          paidRemaining: newProfile.aiCredits.paidRemaining,
          paidExpiresAt: newProfile.aiCredits.paidExpiresAt,
          totalUsed: newProfile.aiCredits.totalUsed || 0,
          cloudCommentaryLimit: newProfile.cloudCommentaryLimit || 0,
          usedCloudCommentaryCount: newProfile.usedCloudCommentaryCount || 0,
          history: [],
        };
        localStorage.setItem('nations_ai_commentary_usage_v1', JSON.stringify(usagePayload));
        window.dispatchEvent(new CustomEvent('ai-usage-updated', { detail: usagePayload }));
      } catch (e) {}

      // 친구 초대 코드(pending_invite_code 또는 ?invite=) 자동 연결
      linkPendingReferralInBible(uid, user.email || '', newProfile.displayName).catch(() => {});
      if (userEmail) migrateLegacyBibleSubcollections(uid, userEmail).catch(() => {});

      return newProfile;
    } else {
      // 기존 유저 정보 갱신
      const existing = snap.data() as UserProfile;
      let aiCredits = existing.aiCredits || {
        freeRemaining: 10,
        paidRemaining: 0,
        totalUsed: 0,
        lastResetMonth: currentMonth
      };

      // 월이 바뀌었으면 크레딧 한도 갱신 체크:
      if (aiCredits.lastResetMonth !== currentMonth) {
        const quotaInfo = getMonthlyCreditsQuota(existing.subscribedPlan);

        if (quotaInfo.isMonthlySubscriber) {
          // 월간 구독자: 이전 달 잔여분이 얼마였든 간에 이월되지 않고 해당 플랜의 월 한도로 깔끔하게 리셋!
          // (예: 남은 크레딧이 10이어도 다음 달 한도가 40이면 40만 남음)
          // 중요: bonusRemaining(선물)과 paidRemaining(유효기간 유료 크레딧)은 절대로 사라지지 않고 안전 보존!
          aiCredits = {
            ...aiCredits,
            monthlyRemaining: quotaInfo.quota,
            freeRemaining: 0,
            lastResetMonth: currentMonth,
          };
        } else {
          // 비구독자 / 무료 사용자: 매월 10회 무료 한도로 리셋
          const isPaidUser = ((aiCredits.paidRemaining || 0) + (aiCredits.bonusRemaining || 0)) > 0;
          aiCredits = {
            ...aiCredits,
            freeRemaining: isPaidUser ? 0 : 10,
            monthlyRemaining: 0,
            lastResetMonth: currentMonth,
          };
        }
      }

      // 유료 횟수 만료 체크:
      // paidExpiresAt이 10자리(초 단위)인 경우 밀리초(13자리)로 자동 보정
      let expiresAtMs = aiCredits.paidExpiresAt;
      if (expiresAtMs && expiresAtMs < 10000000000) {
        expiresAtMs = expiresAtMs * 1000;
        aiCredits.paidExpiresAt = expiresAtMs;
      }

      if (expiresAtMs && expiresAtMs < now && (aiCredits.paidRemaining || 0) > 0) {
        // 유효한 충전/보너스 내역이 남아있는지 확인
        const activeItem = (existing.rechargeHistory || []).find(item => {
          let itemExp = item.expiresAt;
          if (itemExp && itemExp < 10000000000) itemExp = itemExp * 1000;
          return (item.remaining ?? item.amount) > 0 && (!itemExp || itemExp > now);
        });

        if (activeItem) {
          // 관리자 수동 지급 또는 유효한 내역이 있으면 유효기간을 안전하게 1년 연장하여 크레딧 보존
          aiCredits.paidExpiresAt = now + 365 * 24 * 60 * 60 * 1000;
        } else {
          aiCredits = {
            ...aiCredits,
            paidRemaining: 0,
            paidExpiresAt: undefined,
          };
        }
      } else if (!expiresAtMs && (aiCredits.paidRemaining || 0) > 0) {
        // 잔여 유료 크레딧이 있는데 만료일이 없으면 1년 뒤로 안전하게 세팅
        aiCredits.paidExpiresAt = now + 365 * 24 * 60 * 60 * 1000;
      }

      // fallback 문서에 부여된 권한이 있다면 병합
      const mergedAllowed = Array.from(new Set([
        ...(existing.allowedVersions || []),
        ...inheritedAllowedVersions
      ]));

      // fallback에 충전된 크레딧이 더 크면 승계
      if (inheritedPaidCredits > (aiCredits.paidRemaining || 0)) {
        aiCredits.paidRemaining = inheritedPaidCredits;
        if (inheritedPaidExpiresAt) aiCredits.paidExpiresAt = inheritedPaidExpiresAt;
      }
      if (inheritedBonusCredits > (aiCredits.bonusRemaining || 0)) {
        aiCredits.bonusRemaining = inheritedBonusCredits;
      }

      const mergedCloudLimit = Math.max(existing.cloudCommentaryLimit || 0, inheritedCloudLimit);
      const mergedCloudSubscribedAt = existing.cloudSubscribedAt || inheritedCloudSubscribedAt;
      const mergedSubscribedPlan = existing.subscribedPlan || inheritedSubscribedPlan;
      const mergedSubscribedAt = existing.subscribedAt || inheritedSubscribedAt;

      let mergedRechargeHistory = [
        ...(existing.rechargeHistory || []),
        ...inheritedRechargeHistory.filter(ih => !(existing.rechargeHistory || []).some(eh => eh.id === ih.id))
      ];

      // 만약 기존 유저의 충전기록이 비어있는데 잔여 유료 크레딧이 있다면 가입이벤트/보너스 기록으로 자동 보강
      if (mergedRechargeHistory.length === 0 && (aiCredits.paidRemaining || 0) > 0) {
        mergedRechargeHistory.push({
          id: `bonus_${existing.createdAt || now}`,
          amount: aiCredits.paidRemaining,
          planName: existing.lastBonusReason || existing.subscribedPlan || '가입이벤트',
          date: existing.subscribedAt || existing.createdAt || now,
          expiresAt: aiCredits.paidExpiresAt || (now + 365 * 24 * 60 * 60 * 1000),
          remaining: aiCredits.paidRemaining,
        });
      }

      // 기기 세션 추적 및 다중 기기 목록 갱신
      let currentDevices: DeviceSession[] = existing.devices ? [...existing.devices] : [];
      if (currentDevices.length === 0 && existing.deviceInfo) {
        currentDevices.push({
          device: existing.deviceInfo,
          lastLoginAt: existing.lastLoginAt || now,
          loginCount: existing.loginCount || 1,
        });
      }
      const devIdx = currentDevices.findIndex(d => d.device === devInfo);
      if (devIdx >= 0) {
        currentDevices[devIdx] = {
          ...currentDevices[devIdx],
          lastLoginAt: now,
          loginCount: (currentDevices[devIdx].loginCount || 1) + 1,
        };
      } else {
        currentDevices.push({
          device: devInfo,
          lastLoginAt: now,
          loginCount: 1,
        });
      }
      // fallback의 기기가 있다면 병합
      if (inheritedDevices.length > 0) {
        for (const inDev of inheritedDevices) {
          if (!currentDevices.some(d => d.device === inDev.device)) {
            currentDevices.push(inDev);
          }
        }
      }

      const updated: Partial<UserProfile> = {
        email: user.email || existing.email,
        displayName: user.displayName || existing.displayName,
        photoURL: user.photoURL || existing.photoURL,
        lastLoginAt: now,
        loginCount: (existing.loginCount || 0) + 1,
        deviceInfo: devInfo,
        devices: currentDevices,
        aiCredits,
        allowedVersions: mergedAllowed,
        cloudCommentaryLimit: mergedCloudLimit,
        ...(mergedCloudSubscribedAt ? { cloudSubscribedAt: mergedCloudSubscribedAt } : {}),
        ...(mergedSubscribedPlan ? { subscribedPlan: mergedSubscribedPlan } : {}),
        ...(mergedSubscribedAt ? { subscribedAt: mergedSubscribedAt } : {}),
        ...(mergedRechargeHistory.length > 0 ? { rechargeHistory: mergedRechargeHistory } : {}),
        ...(extraStats?.sermonCount !== undefined ? { sermonCount: extraStats.sermonCount } : {}),
        ...(extraStats?.noteCount !== undefined ? { noteCount: extraStats.noteCount } : {}),
        ...(extraStats?.crossRefCount !== undefined ? { crossRefCount: extraStats.crossRefCount } : {}),
        ...(extraStats?.commentaryCount !== undefined ? { commentaryCount: extraStats.commentaryCount } : {}),
        isNewSignUp: false,
        hasSeenWelcome: existing.hasSeenWelcome || false,
      };

      // 과도한 새로고침 시 불필요한 lastLoginAt DB 쓰기 방지 (마지막 갱신 후 1시간 이상 경과 시 또는 통계 갱신 시 쓰기)
      const ONE_HOUR = 60 * 60 * 1000;
      const hasStatsUpdate = extraStats !== undefined && (
        extraStats.sermonCount !== undefined ||
        extraStats.noteCount !== undefined ||
        extraStats.crossRefCount !== undefined ||
        extraStats.commentaryCount !== undefined
      );
      const shouldUpdateDb = !existing.lastLoginAt || (now - existing.lastLoginAt > ONE_HOUR) || hasFallbackDocToDelete || hasStatsUpdate;

      if (shouldUpdateDb) {
        await updateDoc(userRef, cleanUndefined(updated));
        trackFirestoreWrite(1);
      }

      // 중복 fallback 문서 정리
      if (hasFallbackDocToDelete && userEmail) {
        const fallbackId = 'user_' + userEmail.replace(/[^a-zA-Z0-9]/g, '_');
        deleteDoc(doc(db, 'users', fallbackId)).catch(() => {});
      }

      const finalProfile = { ...existing, ...updated } as UserProfile;

      // 클라이언트 UI 및 로컬 스토리지 즉각 동기화 (0초 반영)
      try {
        const usagePayload = {
          monthKey: finalProfile.aiCredits.lastResetMonth,
          monthlyFreeRemaining: finalProfile.aiCredits.freeRemaining,
          monthlyQuotaRemaining: finalProfile.aiCredits.monthlyRemaining || 0,
          bonusRemaining: finalProfile.aiCredits.bonusRemaining || 0,
          paidRemaining: finalProfile.aiCredits.paidRemaining,
          paidExpiresAt: finalProfile.aiCredits.paidExpiresAt,
          totalUsed: finalProfile.aiCredits.totalUsed || 0,
          cloudCommentaryLimit: finalProfile.cloudCommentaryLimit || 0,
          usedCloudCommentaryCount: finalProfile.usedCloudCommentaryCount || 0,
          history: [],
        };
        localStorage.setItem('nations_ai_commentary_usage_v1', JSON.stringify(usagePayload));
        window.dispatchEvent(new CustomEvent('ai-usage-updated', { detail: usagePayload }));
      } catch (e) {}

      linkPendingReferralInBible(uid, finalProfile.email || '', finalProfile.displayName).catch(() => {});
      if (userEmail) migrateLegacyBibleSubcollections(uid, userEmail).catch(() => {});
      return finalProfile;
    }
  } catch (err) {
    console.error('[userService] syncUserProfile failed:', err);
    throw err;
  }
}

/**
 * 실시간 사용자 프로필 구독 (UID 및 이메일 fallback 문서 실시간 병합 구독)
 */
export function subscribeUserProfile(
  uid: string, 
  onUpdate: (profile: UserProfile | null) => void,
  userEmail?: string | null
) {
  const userRef = doc(db, 'users', uid);
  const fallbackId = userEmail ? 'user_' + userEmail.trim().toLowerCase().replace(/[^a-zA-Z0-9]/g, '_') : null;
  const fallbackRef = fallbackId && fallbackId !== uid ? doc(db, 'users', fallbackId) : null;

  let mainProfile: UserProfile | null = null;
  let fallbackProfile: UserProfile | null = null;

  const emitMerged = () => {
    if (!mainProfile && !fallbackProfile) {
      onUpdate(null);
      return;
    }
    const base = mainProfile || fallbackProfile!;
    const extra = mainProfile ? fallbackProfile : null;

    if (extra) {
      const mergedAllowed = Array.from(new Set([
        ...(base.allowedVersions || []),
        ...(extra.allowedVersions || [])
      ]));
      const maxPaid = Math.max(base.aiCredits?.paidRemaining || 0, extra.aiCredits?.paidRemaining || 0);
      const maxBonus = Math.max(base.aiCredits?.bonusRemaining || 0, extra.aiCredits?.bonusRemaining || 0);
      const maxMonthly = Math.max(base.aiCredits?.monthlyRemaining || 0, extra.aiCredits?.monthlyRemaining || 0);
      const mergedCloudLimit = Math.max(base.cloudCommentaryLimit || 0, extra.cloudCommentaryLimit || 0);
      const mergedUsedCount = Math.max(base.usedCloudCommentaryCount || 0, extra.usedCloudCommentaryCount || 0);
      const mergedPreferences = {
        ...(base.preferences || {}),
        ...(extra.preferences || {}),
      };
      onUpdate({
        ...base,
        allowedVersions: mergedAllowed,
        cloudCommentaryLimit: mergedCloudLimit,
        usedCloudCommentaryCount: mergedUsedCount,
        preferences: mergedPreferences,
        aiCredits: {
          ...base.aiCredits,
          paidRemaining: maxPaid,
          bonusRemaining: maxBonus,
          monthlyRemaining: maxMonthly,
        }
      });
    } else {
      onUpdate(base);
    }
  };

  const unsubMain = onSnapshot(userRef, (snap) => {
    mainProfile = snap.exists() ? (snap.data() as UserProfile) : null;
    emitMerged();
  }, (err) => {
    console.warn('[userService] subscribeUserProfile main error:', err);
  });

  let unsubFallback: (() => void) | null = null;
  if (fallbackRef) {
    unsubFallback = onSnapshot(fallbackRef, (snap) => {
      fallbackProfile = snap.exists() ? (snap.data() as UserProfile) : null;
      emitMerged();
    }, (err) => {
      console.warn('[userService] subscribeUserProfile fallback error:', err);
    });
  }

  return () => {
    unsubMain();
    if (unsubFallback) unsubFallback();
  };
}

/**
 * 사용자 환경설정(번역본 선택 목록, 순서, 복사 옵션 등)을 Firestore에 저장하여 기기 간 동기화
 */
export async function saveUserPreferences(uid: string, preferences: Partial<UserPreferences>): Promise<void> {
  if (!uid) return;
  try {
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, {
      preferences: {
        ...preferences,
        updatedAt: Date.now()
      }
    }, { merge: true });
    trackFirestoreWrite(1);
  } catch (err) {
    console.warn('[userService] saveUserPreferences failed non-fatal:', err);
  }
}


/**
 * AI 크레딧 차감 (Firestore 원자적 차감)
 */
export async function consumeCreditInFirestore(uid: string, reference: string): Promise<boolean> {
  const userRef = doc(db, 'users', uid);
  try {
    const snap = await getDoc(userRef);
    trackFirestoreRead(1);
    if (!snap.exists()) return false;
    const profile = snap.data() as UserProfile;
    const credits = profile.aiCredits;
    if (!credits) return false;

    let free = credits.freeRemaining || 0;
    let monthly = credits.monthlyRemaining || 0;
    let bonus = credits.bonusRemaining || 0;
    let paid = credits.paidRemaining || 0;
    const used = (credits.totalUsed || 0) + 1;
    let updatedRechargeHistory: RechargeHistoryItem[] | undefined = undefined;

    // ── 3단계 차감 순서: 1) 월간한도 -> 2) 선물크레딧 -> 3) 유효기간 유료크레딧 ──
    if (monthly > 0) {
      // 1순위: 월간 구독 한도 크레딧 (이월 불가 한도형이므로 최우선 차감)
      monthly -= 1;
    } else if (free > 0) {
      // 1순위: 무료 기본 한도 크레딧 (이월 불가 한도형이므로 최우선 차감)
      free -= 1;
    } else if (bonus > 0) {
      // 2순위: 선물로 받은 크레딧 (유료 구매분 보존을 위해 선물/보너스 우선 차감)
      bonus -= 1;

      // rechargeHistory에서 보너스/선물 항목 잔여 차감
      if (profile.rechargeHistory && profile.rechargeHistory.length > 0) {
        const historyCopy = profile.rechargeHistory.map(item => ({
          ...item,
          remaining: item.remaining !== undefined ? item.remaining : item.amount,
        }));

        const bonusItems = historyCopy
          .filter(item => {
            const plan = (item.planName || '').toLowerCase();
            return (item.remaining ?? 0) > 0 &&
              (plan.includes('보너스') || plan.includes('프로모션') || plan.includes('추천') || plan.includes('선물') || item.id.startsWith('promo_') || item.id.startsWith('bonus_'));
          })
          .sort((a, b) => (a.expiresAt || 0) - (b.expiresAt || 0));

        if (bonusItems.length > 0) {
          const target = bonusItems[0];
          target.remaining = Math.max(0, (target.remaining ?? 1) - 1);
          updatedRechargeHistory = historyCopy.map(h => h.id === target.id ? target : h);
        }
      }
    } else if (paid > 0) {
      // 3순위: 유효기간이 있는 유료/연간 크레딧 차감 (만료일 가장 임박한 순 FIFO)
      paid -= 1;

      if (profile.rechargeHistory && profile.rechargeHistory.length > 0) {
        const historyCopy: RechargeHistoryItem[] = profile.rechargeHistory.map(item => ({
          ...item,
          expiresAt: item.expiresAt || (item.date + 365 * 24 * 60 * 60 * 1000),
          remaining: item.remaining !== undefined ? item.remaining : item.amount,
        }));

        const activeItems = historyCopy
          .filter(item => (item.remaining ?? 0) > 0)
          .sort((a, b) => (a.expiresAt || 0) - (b.expiresAt || 0));

        if (activeItems.length > 0) {
          const target = activeItems[0];
          target.remaining = Math.max(0, (target.remaining ?? 1) - 1);
          updatedRechargeHistory = historyCopy.map(h => h.id === target.id ? target : h);
        }
      }
    } else {
      return false; // 잔여 크레딧 없음
    }

    const updates: any = {
      'aiCredits.freeRemaining': free,
      'aiCredits.monthlyRemaining': monthly,
      'aiCredits.bonusRemaining': bonus,
      'aiCredits.paidRemaining': paid,
      'aiCredits.totalUsed': used,
      'lastActiveAt': Date.now(),
      'lastStudiedReference': reference
    };

    if (updatedRechargeHistory) {
      updates['rechargeHistory'] = updatedRechargeHistory;
    }

    await updateDoc(userRef, updates);
    trackFirestoreWrite(1);

    if (profile.referredByUid && !profile.referralBonusAwarded) {
      awardBibleReferralBonus(uid, profile.referredByUid).catch(() => {});
    }

    return true;
  } catch (err) {
    console.error('[userService] consumeCreditInFirestore failed:', err);
    return false;
  }
}

/**
 * [관리자 전용] 전체 사용자 목록 조회 (users 컬렉션 + activity_logs + 서브컬렉션 스마트 병합 복원)
 * - 동일 이메일을 가진 다중 문서(실제 Auth UID vs fallback user_xxx)를 최신 실제 Auth 계정으로 단일 병합(Merge)하여 중복 0건 보장
 * - 각 회원의 다중 기기 목록 및 충전 내역, 클라우드 상태 보존
 */
export async function fetchAllUsers(): Promise<UserProfile[]> {
  try {
    const usersRef = collection(db, 'users');
    const userDocsSnap = await getDocs(usersRef);
    trackFirestoreRead(userDocsSnap.size);
    const rawUsers: UserProfile[] = [];

    // 1. users 컬렉션에 실존하는 문서 파싱
    userDocsSnap.forEach(docSnap => {
      const data = docSnap.data();
      const devInfo = data.deviceInfo || '알 수 없음';
      const lastLogin = data.lastLoginAt || Date.now();
      const logCount = data.loginCount || 1;
      
      let devicesList: DeviceSession[] = Array.isArray(data.devices) ? data.devices : [];
      if (devicesList.length === 0 && devInfo && devInfo !== '알 수 없음') {
        devicesList = [{ device: devInfo, lastLoginAt: lastLogin, loginCount: logCount }];
      }

      rawUsers.push({
        uid: docSnap.id,
        email: data.email || '',
        displayName: data.displayName || '이용자',
        photoURL: data.photoURL || '',
        createdAt: data.createdAt || Date.now(),
        lastLoginAt: lastLogin,
        loginCount: logCount,
        deviceInfo: devInfo,
        devices: devicesList,
        aiCredits: data.aiCredits || {
          freeRemaining: 10,
          paidRemaining: 0,
          totalUsed: 0,
          lastResetMonth: getCurrentMonthKey(),
        },
        cloudCommentaryLimit: data.cloudCommentaryLimit || 0,
        usedCloudCommentaryCount: data.usedCloudCommentaryCount || 0,
        cloudSubscribedAt: data.cloudSubscribedAt,
        subscribedPlan: data.subscribedPlan,
        subscribedAt: data.subscribedAt,
        rechargeHistory: data.rechargeHistory || [],
        allowedVersions: data.allowedVersions || [],
        noteCount: data.noteCount || 0,
        sermonCount: data.sermonCount || 0,
        crossRefCount: data.crossRefCount || 0,
        commentaryCount: data.commentaryCount || 0,
        activityCount: data.activityCount || 0,
        lastAction: data.lastAction || '',
        lastBonusReason: data.lastBonusReason,
        lastBonusGrantedAt: data.lastBonusGrantedAt,
        cloudNotesAllowed: data.cloudNotesAllowed,
      } as UserProfile);
    });

    // 2. 이메일 기준 동일 회원 스마트 단일화 (Merge & Deduplicate)
    const emailGroups = new Map<string, UserProfile[]>();
    const noEmailUsers: UserProfile[] = [];

    for (const u of rawUsers) {
      const cleanEmail = (u.email || '').trim().toLowerCase();
      if (!cleanEmail) {
        noEmailUsers.push(u);
      } else {
        const group = emailGroups.get(cleanEmail) || [];
        group.push(u);
        emailGroups.set(cleanEmail, group);
      }
    }

    const mergedUserMap = new Map<string, UserProfile>();
    const docsToDelete: string[] = [];

    for (const [email, group] of emailGroups.entries()) {
      if (group.length === 1) {
        mergedUserMap.set(group[0].uid, group[0]);
      } else {
        // 동일 이메일이 여러 개 존재! 실제 Firebase Auth UID(user_로 시작하지 않는 문서) 우선 선정
        group.sort((a, b) => {
          const aIsReal = !a.uid.startsWith('user_');
          const bIsReal = !b.uid.startsWith('user_');
          if (aIsReal && !bIsReal) return -1;
          if (!aIsReal && bIsReal) return 1;
          return (b.lastLoginAt || 0) - (a.lastLoginAt || 0);
        });

        const primary = { ...group[0] };
        for (let i = 1; i < group.length; i++) {
          const sec = group[i];
          // 1) 크레딧: 유료 크레딧이 더 크면 승계
          const secPaid = sec.aiCredits?.paidRemaining || 0;
          const primPaid = primary.aiCredits?.paidRemaining || 0;
          if (secPaid > primPaid) {
            primary.aiCredits = {
              ...primary.aiCredits,
              paidRemaining: secPaid,
              paidExpiresAt: sec.aiCredits?.paidExpiresAt || primary.aiCredits?.paidExpiresAt
            };
          }
          primary.aiCredits.totalUsed = Math.max(primary.aiCredits?.totalUsed || 0, sec.aiCredits?.totalUsed || 0);

          // 2) 클라우드 구독 & 용량
          primary.cloudCommentaryLimit = Math.max(primary.cloudCommentaryLimit || 0, sec.cloudCommentaryLimit || 0);
          if (primary.cloudNotesAllowed === undefined && sec.cloudNotesAllowed !== undefined) {
            primary.cloudNotesAllowed = sec.cloudNotesAllowed;
          }
          if (!primary.cloudSubscribedAt && sec.cloudSubscribedAt) primary.cloudSubscribedAt = sec.cloudSubscribedAt;
          if (!primary.subscribedPlan && sec.subscribedPlan) primary.subscribedPlan = sec.subscribedPlan;
          if (!primary.subscribedAt && sec.subscribedAt) primary.subscribedAt = sec.subscribedAt;

          // 3) 충전 기록 병합 (ID 중복 제거)
          const secRecharge = sec.rechargeHistory || [];
          const existingIds = new Set((primary.rechargeHistory || []).map(r => r.id));
          const toAddRecharge = secRecharge.filter(r => !existingIds.has(r.id));
          primary.rechargeHistory = [...(primary.rechargeHistory || []), ...toAddRecharge];

          // 4) 허용 번역본 병합
          primary.allowedVersions = Array.from(new Set([...(primary.allowedVersions || []), ...(sec.allowedVersions || [])]));

          // 5) 기기 세션 병합
          const secDevs = sec.devices || [];
          const primDevs = primary.devices ? [...primary.devices] : [];
          for (const sd of secDevs) {
            const match = primDevs.find(pd => pd.device === sd.device);
            if (match) {
              match.lastLoginAt = Math.max(match.lastLoginAt, sd.lastLoginAt);
              match.loginCount = (match.loginCount || 1) + (sd.loginCount || 1);
            } else {
              primDevs.push(sd);
            }
          }
          primary.devices = primDevs;

          // 6) 가입일(최초 시점) & 접속일(최근 시점) & 활동/로그인 수
          if (sec.createdAt && sec.createdAt < primary.createdAt) primary.createdAt = sec.createdAt;
          if (sec.lastLoginAt && sec.lastLoginAt > primary.lastLoginAt) primary.lastLoginAt = sec.lastLoginAt;
          primary.loginCount = (primary.loginCount || 1) + (sec.loginCount || 1);
          primary.activityCount = (primary.activityCount || 0) + (sec.activityCount || 0);
          if (!primary.lastAction && sec.lastAction) primary.lastAction = sec.lastAction;

          // 중복 fallback 문서(user_xxx)는 정리 대상에 추가
          if (sec.uid.startsWith('user_')) {
            docsToDelete.push(sec.uid);
          }
        }

        // ⚠️ [치명적 버그 수정] 병합된 크레딧/권한을 Firestore 메인 문서에 즉시 영구 저장!
        const primaryRef = doc(db, 'users', primary.uid);
        const updatesToSave = cleanUndefined({
          aiCredits: primary.aiCredits,
          cloudCommentaryLimit: primary.cloudCommentaryLimit,
          cloudNotesAllowed: primary.cloudNotesAllowed,
          cloudSubscribedAt: primary.cloudSubscribedAt,
          subscribedPlan: primary.subscribedPlan,
          subscribedAt: primary.subscribedAt,
          rechargeHistory: primary.rechargeHistory,
          allowedVersions: primary.allowedVersions,
          devices: primary.devices,
          createdAt: primary.createdAt,
          lastLoginAt: primary.lastLoginAt,
          loginCount: primary.loginCount,
          activityCount: primary.activityCount,
          lastAction: primary.lastAction,
        });

        // 비동기로 메인 문서에 저장 완료 후 안전하게 정리
        updateDoc(primaryRef, updatesToSave).then(() => {
          if (docsToDelete.length > 0) {
            docsToDelete.forEach(dId => {
              deleteDoc(doc(db, 'users', dId)).catch(() => {});
            });
            console.log(`[userService] 🧹 중복 fallback 문서 ${docsToDelete.length}개 안전 정리 완료 (${email})`);
          }
        }).catch((err) => {
          console.warn('[userService] Failed to persist merged profile before deletion:', err);
        });

        mergedUserMap.set(primary.uid, primary);
      }
    }

    for (const u of noEmailUsers) {
      mergedUserMap.set(u.uid, u);
    }

    // 3. 서브컬렉션 및 외부 로그 전수조사 완전 제거:
    // 유저 문서 자체에 실시간 기록되는 noteCount, sermonCount, crossRefCount, commentaryCount 메타데이터를 사용하여
    // 대시보드 진입 시 Firestore 읽기 비용을 오직 실제 회원 수(1회당 1문서)로만 초경량 제한합니다.
    const userList = Array.from(mergedUserMap.values());
    console.log(`[userService] fetchAllUsers 완료 (초경량): 총 ${userList.length}명`);
    return userList.sort((a, b) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0));
  } catch (err: any) {
    console.error('[userService] fetchAllUsers failed:', err?.code || err);
    throw err;
  }
}

/**
 * [관리자 전용] 활동 로그 목록 조회 (기본 50건으로 경량화)
 */
export async function fetchActivityLogs(limitCount: number = 50): Promise<ActivityLogEntry[]> {
  const logsRef = collection(db, 'activity_logs');
  try {
    let snap;
    try {
      snap = await getDocs(query(logsRef, orderBy('timestamp', 'desc'), limit(limitCount)));
    } catch (qErr) {
      snap = await getDocs(query(logsRef, limit(limitCount)));
    }
    if (snap) trackFirestoreRead(snap.size);
    const logs: ActivityLogEntry[] = [];
    snap.forEach(docSnap => {
      logs.push({ id: docSnap.id, ...docSnap.data() } as ActivityLogEntry);
    });
    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (err) {
    console.error('[userService] fetchActivityLogs failed:', err);
    throw err;
  }
}

/**
 * 사용자 리소스 개수(설교, 구절노트, 관주, 구절주석)를 Firestore 프로필에 경량 업데이트
 */
export async function updateUserResourceCounts(
  uid: string, 
  stats: { sermonCount?: number; noteCount?: number; crossRefCount?: number; commentaryCount?: number }
): Promise<void> {
  if (!uid) return;
  try {
    const userRef = doc(db, 'users', uid);
    const updatesToSave: Record<string, any> = {};
    if (stats.sermonCount !== undefined) updatesToSave.sermonCount = stats.sermonCount;
    if (stats.noteCount !== undefined) updatesToSave.noteCount = stats.noteCount;
    if (stats.crossRefCount !== undefined) updatesToSave.crossRefCount = stats.crossRefCount;
    if (stats.commentaryCount !== undefined) updatesToSave.commentaryCount = stats.commentaryCount;

    if (Object.keys(updatesToSave).length > 0) {
      await updateDoc(userRef, updatesToSave);
      trackFirestoreWrite(1);
    }
  } catch (err) {
    console.warn('[userService] updateUserResourceCounts 경고:', err);
  }
}

/**
 * 로컬 기기(localStorage)에 저장된 사용자의 설교노트, 구절노트, 관주, 구절주석 개수를 집계
 */
export function getLocalUserResourceCounts(): {
  sermonCount: number;
  noteCount: number;
  crossRefCount: number;
  commentaryCount: number;
} {
  let sermonCount = 0;
  let noteCount = 0;
  let crossRefCount = 0;
  let commentaryCount = 0;

  try {
    const rawSermons = localStorage.getItem('bible-local-sermons');
    if (rawSermons) {
      const sermons = JSON.parse(rawSermons);
      if (Array.isArray(sermons)) {
        sermonCount = sermons.length;
      }
    }
  } catch (e) {}

  try {
    const rawVerseData = localStorage.getItem('bible-local-verse-data');
    if (rawVerseData) {
      const vData = JSON.parse(rawVerseData);
      if (vData && typeof vData === 'object') {
        for (const key of Object.keys(vData)) {
          const entry = vData[key];
          if (entry) {
            if (entry.note && typeof entry.note === 'string' && entry.note.trim() !== '') {
              noteCount++;
            }
            if (entry.crossRef && typeof entry.crossRef === 'string' && entry.crossRef.trim() !== '') {
              crossRefCount++;
            }
            if (entry.sermon && typeof entry.sermon === 'string' && entry.sermon.trim() !== '') {
              commentaryCount++;
            }
          }
        }
      }
    }
  } catch (e) {}

  return { sermonCount, noteCount, crossRefCount, commentaryCount };
}

/**
 * [관리자 전용] 활동 로그 전체 삭제
 */
export async function clearAllActivityLogs(logIds: string[]): Promise<void> {
  const deletePromises = logIds.map(id => deleteDoc(doc(db, 'activity_logs', id)));
  await Promise.all(deletePromises);
}

/**
 * [관리자 전용] 사용자에게 보너스 크레딧 충전 (+50회, +100회 등)
 */
export async function addCreditsToUser(
  uid: string, 
  count: number, 
  reason: string = '관리자 보너스 지급'
): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const oneYearLater = Date.now() + 365 * 24 * 60 * 60 * 1000;

  try {
    const snap = await getDoc(userRef);
    let targetEmail = '';
    if (snap.exists()) {
      targetEmail = (snap.data() as UserProfile).email || '';
    }

    const historyEntry: RechargeHistoryItem = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      amount: count,
      planName: reason,
      date: Date.now(),
      expiresAt: oneYearLater,
      remaining: count,
    };
    const updates = {
      'aiCredits.bonusRemaining': increment(count),
      'aiCredits.paidExpiresAt': oneYearLater,
      'lastBonusGrantedAt': Date.now(),
      'lastBonusReason': reason,
      'rechargeHistory': arrayUnion(historyEntry),
    };

    await setDoc(userRef, updates, { merge: true });
    trackFirestoreWrite(1);

    // 동일 이메일의 계정이 존재하는 경우 양방향 핀셋 동기화 (크레딧 증발 방지)
    if (targetEmail) {
      const lower = targetEmail.trim().toLowerCase();
      const fallbackId = 'user_' + lower.replace(/[^a-zA-Z0-9]/g, '_');
      
      // 1) fallback 문서가 별도로 있다면 거기도 동기화
      if (fallbackId !== uid) {
        const fbRef = doc(db, 'users', fallbackId);
        getDoc(fbRef).then(fbSnap => {
          if (fbSnap.exists()) {
            setDoc(fbRef, updates, { merge: true }).catch(() => {});
          }
        }).catch(() => {});
      }

      // 2) 만약 충전한 대상 uid가 fallbackId라면, 실제 Auth UID 문서도 찾아서 함께 충전
      if (uid.startsWith('user_')) {
        const q = query(collection(db, 'users'), where('email', '==', targetEmail));
        getDocs(q).then(qSnap => {
          qSnap.forEach(d => {
            if (d.id !== uid) {
              setDoc(d.ref, updates, { merge: true }).catch(() => {});
            }
          });
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[userService] addCreditsToUser failed:', err);
    throw err;
  }
}

/**
 * [관리자 전용] 사용자의 원격 특별 번역본 권한 토글
 */
export async function toggleUserAllowedVersion(
  uid: string, 
  versionId: string, 
  enable: boolean
): Promise<void> {
  const userRef = doc(db, 'users', uid);
  try {
    const snap = await getDoc(userRef);
    let targetEmail = '';
    let allowed: string[] = [];

    if (snap.exists()) {
      const profile = snap.data() as UserProfile;
      targetEmail = (profile.email || '').trim().toLowerCase();
      allowed = profile.allowedVersions || [];
    }

    if (enable) {
      if (!allowed.includes(versionId)) allowed.push(versionId);
    } else {
      allowed = allowed.filter(id => id !== versionId);
    }

    // 1. 현재 타깃 문서 업데이트
    await setDoc(userRef, { allowedVersions: allowed }, { merge: true });
    trackFirestoreWrite(1);

    // 2. 이메일 fallback 문서가 존재하는 경우에만 단 1건 핀셋 전파 (전체 컬렉션 전수조사 방지)
    if (targetEmail) {
      const fallbackId = 'user_' + targetEmail.replace(/[^a-zA-Z0-9]/g, '_');
      if (fallbackId !== uid) {
        const fbRef = doc(db, 'users', fallbackId);
        getDoc(fbRef).then(snap => {
          if (snap.exists()) {
            setDoc(fbRef, { allowedVersions: allowed }, { merge: true }).catch(() => {});
          }
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[userService] toggleUserAllowedVersion failed:', err);
    throw err;
  }
}

/**
 * [관리자 전용 & 구매시] 주석 클라우드 용량 수동 지급 및 추가
 */
export async function addCloudCapacityToUser(
  uid: string, 
  capacityToAdd: number,
  creditsToAdd: number = 0,
  reason: string = '주석 클라우드 이용권 적용'
): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const oneYearLater = Date.now() + 365 * 24 * 60 * 60 * 1000;

  try {
    const snap = await getDoc(userRef);
    let targetEmail = '';
    let currentLimit = 0;
    
    if (snap.exists()) {
      const profile = snap.data() as UserProfile;
      targetEmail = profile.email || '';
      currentLimit = profile.cloudCommentaryLimit || 0;
    }

    const historyEntry: RechargeHistoryItem = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      amount: creditsToAdd,
      planName: reason,
      date: Date.now(),
      expiresAt: oneYearLater,
      remaining: creditsToAdd,
    };
    const updates: any = {
      'cloudCommentaryLimit': currentLimit + capacityToAdd,
      'cloudSubscribedAt': Date.now(),
      'lastBonusGrantedAt': Date.now(),
      'lastBonusReason': reason,
    };
    
    if (creditsToAdd > 0) {
      updates['aiCredits.paidRemaining'] = increment(creditsToAdd);
      updates['aiCredits.freeRemaining'] = 0;
      updates['aiCredits.paidExpiresAt'] = oneYearLater;
      updates['rechargeHistory'] = arrayUnion(historyEntry);
    }

    await setDoc(userRef, updates, { merge: true });
    trackFirestoreWrite(1);

    if (targetEmail) {
      const lower = targetEmail.trim().toLowerCase();
      const fallbackId = 'user_' + lower.replace(/[^a-zA-Z0-9]/g, '_');
      if (fallbackId !== uid) {
        const fbRef = doc(db, 'users', fallbackId);
        getDoc(fbRef).then(snap => {
          if (snap.exists()) {
            setDoc(fbRef, updates, { merge: true }).catch(() => {});
          }
        }).catch(() => {});
      }
      if (uid.startsWith('user_')) {
        const q = query(collection(db, 'users'), where('email', '==', targetEmail));
        getDocs(q).then(qSnap => {
          qSnap.forEach(d => {
            if (d.id !== uid) setDoc(d.ref, updates, { merge: true }).catch(() => {});
          });
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[userService] addCloudCapacityToUser failed:', err);
    throw err;
  }
}

/**
 * 관리자가 특정 회원의 노트/설교 클라우드 서버 동기화 권한을 개별 수동 변경
 * allowed: true(강제 허용), false(강제 차단), null(기본 정책으로 복원)
 */
export async function setUserCloudNotesAllowed(
  uid: string, 
  allowed: boolean | null,
  targetEmail?: string
): Promise<void> {
  try {
    const userRef = doc(db, 'users', uid);
    const updates: any = {
      cloudNotesAllowed: allowed === null ? deleteField() : allowed,
      lastAction: allowed === null ? '노트 클라우드 기본정책 복원' : (allowed ? '노트 클라우드 수동 허용' : '노트 클라우드 수동 차단'),
      updatedAt: serverTimestamp(),
    };

    await setDoc(userRef, updates, { merge: true });
    trackFirestoreWrite(1);

    if (targetEmail) {
      const lower = targetEmail.trim().toLowerCase();
      const fallbackId = 'user_' + lower.replace(/[^a-zA-Z0-9]/g, '_');
      if (fallbackId !== uid) {
        const fbRef = doc(db, 'users', fallbackId);
        getDoc(fbRef).then(snap => {
          if (snap.exists()) {
            setDoc(fbRef, updates, { merge: true }).catch(() => {});
          }
        }).catch(() => {});
      }
      if (uid.startsWith('user_')) {
        const q = query(collection(db, 'users'), where('email', '==', targetEmail));
        getDocs(q).then(qSnap => {
          qSnap.forEach(d => {
            if (d.id !== uid) setDoc(d.ref, updates, { merge: true }).catch(() => {});
          });
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[userService] setUserCloudNotesAllowed failed:', err);
    throw err;
  }
}



/**
 * 친구 초대 코드(?invite= 또는 localStorage pending_invite_code)를 확인하여 추천인과 연결
 */
export async function linkPendingReferralInBible(uid: string, email: string, displayName: string): Promise<void> {
  if (typeof window === 'undefined' || !uid) return;
  const sp = new URLSearchParams(window.location.search);
  const urlInvite = sp.get('invite') || sp.get('ref');
  if (urlInvite && urlInvite.trim()) {
    localStorage.setItem('pending_invite_code', urlInvite.trim());
  }
  const rawCode = localStorage.getItem('pending_invite_code');
  if (!rawCode) return;
  const code = rawCode.trim().toLowerCase();
  const myCleanCode = uid.replace(/^(kakao|naver):/i, '').slice(0, 8).toLowerCase();
  if (!code || code === myCleanCode) {
    localStorage.removeItem('pending_invite_code');
    return;
  }

  try {
    const myRef = doc(db, 'users', uid);
    const mySnap = await getDoc(myRef);
    if (!mySnap.exists()) return;
    const myData = mySnap.data() as UserProfile;
    if (myData.referredByUid) {
      localStorage.removeItem('pending_invite_code');
      return;
    }

    // 전체 유저 중 inviteCode 또는 UID 앞 8자리가 일치하는 추천인 검색
    const usersSnap = await getDocs(collection(db, 'users'));
    let referrerDocId: string | null = null;
    let referrerData: UserProfile | null = null;

    usersSnap.forEach((d) => {
      if (referrerDocId || d.id === uid) return;
      const u = d.data() as UserProfile;
      const uClean = d.id.replace(/^(kakao|naver):/i, '').slice(0, 8).toLowerCase();
      const uInvite = (u.inviteCode || uClean).toLowerCase();
      if (uInvite === code || uClean === code) {
        referrerDocId = d.id;
        referrerData = u;
      }
    });

    localStorage.removeItem('pending_invite_code');
    if (!referrerDocId || !referrerData) return;

    await updateDoc(myRef, {
      referredByUid: referrerDocId,
      referralBonusAwarded: false,
    });

    const existingFriends = Array.isArray((referrerData as UserProfile).invitedFriends)
      ? [...(referrerData as UserProfile).invitedFriends!]
      : [];
    if (!existingFriends.some(f => f.uid === uid)) {
      existingFriends.push({
        uid,
        email: email || '',
        name: displayName || '성도',
        joinedAt: Date.now(),
        hasGeneratedCommentary: false,
        bonusAwarded: false,
      });
      await updateDoc(doc(db, 'users', referrerDocId), {
        invitedFriends: existingFriends,
      });
    }
  } catch (e) {
    console.warn('[userService] linkPendingReferralInBible warning:', e);
  }
}

/**
 * 피추천인이 첫 AI 주석 생성 완료 시 추천인과 본인에게 각각 +20 선물 크레딧 지급
 */
async function awardBibleReferralBonus(friendUid: string, referrerUid: string): Promise<void> {
  const now = Date.now();
  const oneYearLater = now + 365 * 24 * 60 * 60 * 1000;

  // 1. 피추천인(본인) +20 보너스 크레딧 지급
  const friendRef = doc(db, 'users', friendUid);
  const friendSnap = await getDoc(friendRef);
  if (!friendSnap.exists()) return;
  const fData = friendSnap.data() as UserProfile;
  if (fData.referralBonusAwarded) return;

  const fBonus = (fData.aiCredits?.bonusRemaining || 0) + 20;
  const fHist: RechargeHistoryItem[] = [
    ...(fData.rechargeHistory || []),
    {
      id: `ref_welcome_${now}`,
      amount: 20,
      planName: '친구초대 1+1 보너스',
      date: now,
      expiresAt: oneYearLater,
      remaining: 20,
    },
  ];
  await updateDoc(friendRef, {
    'aiCredits.bonusRemaining': fBonus,
    referralBonusAwarded: true,
    rechargeHistory: fHist,
    lastBonusReason: '친구초대 첫 주석 생성 보너스 (+20 크레딧)',
    lastBonusGrantedAt: now,
  });

  // 로컬 스토리지 즉시 반영
  try {
    const raw = localStorage.getItem('nations_ai_commentary_usage_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      parsed.bonusRemaining = (parsed.bonusRemaining || 0) + 20;
      localStorage.setItem('nations_ai_commentary_usage_v1', JSON.stringify(parsed));
      window.dispatchEvent(new CustomEvent('ai-usage-updated', { detail: parsed }));
    }
  } catch (e) {}

  // 2. 추천인 +20 보너스 크레딧 지급 및 invitedFriends 상태 업데이트
  const refRef = doc(db, 'users', referrerUid);
  const refSnap = await getDoc(refRef);
  if (!refSnap.exists()) return;
  const rData = refSnap.data() as UserProfile;
  const friends = Array.isArray(rData.invitedFriends) ? [...rData.invitedFriends] : [];
  const fIdx = friends.findIndex(f => f.uid === friendUid);
  if (fIdx >= 0 && friends[fIdx].bonusAwarded) return;

  if (fIdx >= 0) {
    friends[fIdx] = {
      ...friends[fIdx],
      hasGeneratedCommentary: true,
      bonusAwarded: true,
    };
  } else {
    friends.push({
      uid: friendUid,
      email: fData.email || '',
      name: fData.displayName || '성도',
      joinedAt: now,
      hasGeneratedCommentary: true,
      bonusAwarded: true,
    });
  }

  const rBonus = (rData.aiCredits?.bonusRemaining || 0) + 20;
  const rHist: RechargeHistoryItem[] = [
    ...(rData.rechargeHistory || []),
    {
      id: `ref_reward_${now}`,
      amount: 20,
      planName: `친구초대 보상 (${fData.displayName || '친구'})`,
      date: now,
      expiresAt: oneYearLater,
      remaining: 20,
    },
  ];

  await updateDoc(refRef, {
    'aiCredits.bonusRemaining': rBonus,
    invitedFriends: friends,
    rechargeHistory: rHist,
    lastBonusReason: `친구(${fData.displayName || '성도'}) 첫 주석 생성 보상 (+20 크레딧)`,
    lastBonusGrantedAt: now,
  });
}


/**
 * 통합 인증(sermon-ym) 전환 시 기존 ym-bible의 동일 이메일 구 UID 하위 컬렉션(설교노트, 절노트, 클라우드주석)을
 * 신규 통합 UID 하위 컬렉션으로 100% 무손실 자동 이관
 */
async function migrateLegacyBibleSubcollections(newUid: string, userEmail: string): Promise<void> {
  if (typeof window === 'undefined' || !newUid || !userEmail) return;
  const migKey = `nations_bible_subcol_migrated_${newUid}`;
  if (localStorage.getItem(migKey) === '1') return;

  try {
    const emailQ = query(collection(db, 'users'), where('email', '==', userEmail));
    const emailSnap = await getDocs(emailQ);
    const legacyIds = emailSnap.docs
      .map(d => d.id)
      .filter(id => id !== newUid && !id.startsWith('user_'));

    if (legacyIds.length === 0) {
      localStorage.setItem(migKey, '1');
      return;
    }

    const subCols = ['sermons', 'verseData', 'cloudCommentaries'];
    for (const oldUid of legacyIds) {
      for (const subName of subCols) {
        try {
          const oldColSnap = await getDocs(collection(db, 'users', oldUid, subName));
          for (const d of oldColSnap.docs) {
            await setDoc(doc(db, 'users', newUid, subName, d.id), d.data(), { merge: true });
          }
        } catch (subErr) {
          console.warn(`[userService] Subcollection ${subName} migration warning:`, subErr);
        }
      }
    }
    localStorage.setItem(migKey, '1');
    console.log(`[userService] ✅ Legacy Bible subcollections migrated to ${newUid}`);
  } catch (e) {
    console.warn('[userService] migrateLegacyBibleSubcollections warning:', e);
  }
}
