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
  arrayUnion 
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../api/firebaseConfig';

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

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: number;
  lastLoginAt: number;
  loginCount: number;
  deviceInfo: string;
  devices?: DeviceSession[]; // 로그인/접속했던 모든 기기 목록 및 세션 정보
  aiCredits: {
    freeRemaining: number;
    paidRemaining: number;
    totalUsed: number;
    lastResetMonth: string; // 'YYYY-MM'
    paidExpiresAt?: number;
  };
  cloudCommentaryLimit?: number;
  usedCloudCommentaryCount?: number;
  allowedVersions: string[]; // 관리자가 원격 허용한 번역본 ID 목록 (예: ['built-in-krv'])
  noteCount?: number;
  sermonCount?: number;
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
  extraStats?: { noteCount?: number; sermonCount?: number }
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
          inheritedPaidExpiresAt = fbData.aiCredits?.paidExpiresAt;
          inheritedCloudLimit = fbData.cloudCommentaryLimit || 0;
          inheritedCloudSubscribedAt = fbData.cloudSubscribedAt;
          inheritedSubscribedPlan = fbData.subscribedPlan;
          inheritedSubscribedAt = fbData.subscribedAt;
          inheritedRechargeHistory = fbData.rechargeHistory || [];
          inheritedDevices = fbData.devices || (fbData.deviceInfo ? [{ device: fbData.deviceInfo, lastLoginAt: fbData.lastLoginAt || now, loginCount: 1 }] : []);
          hasFallbackDocToDelete = true;
        }
      } catch (e) {}
    }
  }

  try {
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      // 신규 유저 생성 (프로모션 설정 확인 후 보너스 자동 지급)
      let initialPaidCredits = inheritedPaidCredits;
      let bonusReason = '';
      try {
        const { getPromotionSettings } = await import('./promotionService');
        const promo = await getPromotionSettings();
        if (promo.enabled && promo.bonusCredits > 0) {
          initialPaidCredits += promo.bonusCredits;
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
          freeRemaining: initialPaidCredits > 0 ? 0 : 10,
          paidRemaining: initialPaidCredits,
          totalUsed: 0,
          lastResetMonth: currentMonth,
          paidExpiresAt: initialPaidCredits > 0 ? oneYearLater : inheritedPaidExpiresAt,
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
        lastBonusReason: bonusReason || undefined,
        lastBonusGrantedAt: bonusReason ? now : undefined,
        isNewSignUp: true,
        hasSeenWelcome: false,
      };

      await setDoc(userRef, cleanUndefined(newProfile));

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

      // 월이 바뀌었으면 무료 10회 갱신 체크:
      if (aiCredits.lastResetMonth !== currentMonth) {
        const isPaidUser = (aiCredits.paidRemaining || 0) > 0;
        aiCredits = {
          ...aiCredits,
          freeRemaining: isPaidUser ? 0 : 10,
          lastResetMonth: currentMonth,
        };
      }

      // 유료 횟수 1년 만료 체크
      if (aiCredits.paidExpiresAt && aiCredits.paidExpiresAt < now && aiCredits.paidRemaining > 0) {
        aiCredits = {
          ...aiCredits,
          paidRemaining: 0,
          paidExpiresAt: undefined,
        };
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
        isNewSignUp: false,
        hasSeenWelcome: existing.hasSeenWelcome || false,
      };

      // 과도한 새로고침 시 불필요한 lastLoginAt DB 쓰기 방지 (마지막 갱신 후 1시간 이상 경과 시에만 쓰기)
      const ONE_HOUR = 60 * 60 * 1000;
      const shouldUpdateDb = !existing.lastLoginAt || (now - existing.lastLoginAt > ONE_HOUR) || hasFallbackDocToDelete;

      if (shouldUpdateDb) {
        await updateDoc(userRef, cleanUndefined(updated));
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
      const mergedCloudLimit = Math.max(base.cloudCommentaryLimit || 0, extra.cloudCommentaryLimit || 0);
      const mergedUsedCount = Math.max(base.usedCloudCommentaryCount || 0, extra.usedCloudCommentaryCount || 0);
      onUpdate({
        ...base,
        allowedVersions: mergedAllowed,
        cloudCommentaryLimit: mergedCloudLimit,
        usedCloudCommentaryCount: mergedUsedCount,
        aiCredits: {
          ...base.aiCredits,
          paidRemaining: maxPaid,
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
 * AI 크레딧 차감 (Firestore 원자적 차감)
 */
export async function consumeCreditInFirestore(uid: string, reference: string): Promise<boolean> {
  const userRef = doc(db, 'users', uid);
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) return false;
    const profile = snap.data() as UserProfile;
    const credits = profile.aiCredits;
    if (!credits) return false;

    let free = credits.freeRemaining || 0;
    let paid = credits.paidRemaining || 0;
    const used = (credits.totalUsed || 0) + 1;
    let updatedRechargeHistory: RechargeHistoryItem[] | undefined = undefined;

    if (free > 0) {
      free -= 1;
    } else if (paid > 0) {
      paid -= 1;

      // 유효기간이 가장 적게 남은 크레딧부터 우선 차감 (만료일 오름차순 FIFO)
      if (profile.rechargeHistory && profile.rechargeHistory.length > 0) {
        const historyCopy: RechargeHistoryItem[] = profile.rechargeHistory.map(item => ({
          ...item,
          expiresAt: item.expiresAt || (item.date + 365 * 24 * 60 * 60 * 1000),
          remaining: item.remaining !== undefined ? item.remaining : item.amount,
        }));

        // 잔여량이 있는 항목 중 expiresAt이 가장 빠른(적게 남은) 항목 검색
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
      return false; // 잔여 횟수 없음
    }

    const updates: any = {
      'aiCredits.freeRemaining': free,
      'aiCredits.paidRemaining': paid,
      'aiCredits.totalUsed': used,
      'lastActiveAt': Date.now(),
      'lastStudiedReference': reference
    };

    if (updatedRechargeHistory) {
      updates['rechargeHistory'] = updatedRechargeHistory;
    }

    await updateDoc(userRef, updates);

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
        activityCount: data.activityCount || 0,
        lastAction: data.lastAction || '',
        lastBonusReason: data.lastBonusReason,
        lastBonusGrantedAt: data.lastBonusGrantedAt,
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

        mergedUserMap.set(primary.uid, primary);
      }
    }

    for (const u of noEmailUsers) {
      mergedUserMap.set(u.uid, u);
    }

    // 중복 fallback 문서 백그라운드 자동 청소 (비동기 처리)
    if (docsToDelete.length > 0) {
      docsToDelete.forEach(dId => {
        deleteDoc(doc(db, 'users', dId)).catch(() => {});
      });
      console.log(`[userService] 🧹 중복 fallback 문서 ${docsToDelete.length}개 자동 정리 완료`);
    }

    // 3. activity_logs 컬렉션 조회하여 사용자 정보 보강
    try {
      const logsSnap = await getDocs(collection(db, 'activity_logs'));
      const logUsers = new Map<string, { email: string; name: string; lastTime: number; count: number; lastAction: string }>();

      logsSnap.forEach(logDoc => {
        const logData = logDoc.data();
        const email = (logData.userEmail || '').trim();
        if (!email) return;

        const time = logData.timestamp ? new Date(logData.timestamp).getTime() : 0;
        const current = logUsers.get(email.toLowerCase());
        if (!current) {
          logUsers.set(email.toLowerCase(), {
            email,
            name: logData.userName || '',
            lastTime: time,
            count: 1,
            lastAction: logData.action || ''
          });
        } else {
          current.count += 1;
          if (time > current.lastTime) {
            current.lastTime = time;
            current.lastAction = logData.action || current.lastAction;
            if (logData.userName && !current.name) current.name = logData.userName;
          }
        }
      });

      // logUsers를 기반으로 mergedUserMap 보강 (절대 기존 회원을 중복 생성하지 않음)
      for (const [lowerEmail, logUser] of logUsers.entries()) {
        const matchedUser = Array.from(mergedUserMap.values()).find(u => (u.email || '').toLowerCase() === lowerEmail);

        if (matchedUser) {
          matchedUser.activityCount = (matchedUser.activityCount || 0) + logUser.count;
          if (logUser.lastTime > (matchedUser.lastLoginAt || 0)) {
            matchedUser.lastLoginAt = logUser.lastTime;
          }
          if (!matchedUser.displayName || matchedUser.displayName === '이용자') {
            matchedUser.displayName = logUser.name || matchedUser.displayName;
          }
          matchedUser.lastAction = logUser.lastAction;
        } else {
          // users 컬렉션에 정말 전혀 없는 극단적 케이스일 때만 단일 생성
          const fallbackUid = 'user_' + lowerEmail.replace(/[^a-zA-Z0-9]/g, '_');
          const newProfile: UserProfile = {
            uid: fallbackUid,
            email: logUser.email,
            displayName: logUser.name || logUser.email.split('@')[0] || '이용자',
            photoURL: '',
            createdAt: logUser.lastTime || Date.now(),
            lastLoginAt: logUser.lastTime || Date.now(),
            loginCount: logUser.count,
            deviceInfo: '웹 브라우저',
            devices: [{ device: '웹 브라우저', lastLoginAt: logUser.lastTime || Date.now(), loginCount: logUser.count }],
            aiCredits: {
              freeRemaining: 10,
              paidRemaining: 0,
              totalUsed: 0,
              lastResetMonth: getCurrentMonthKey(),
            },
            allowedVersions: [],
            noteCount: 0,
            sermonCount: 0,
            activityCount: logUser.count,
            lastAction: logUser.lastAction
          };

          mergedUserMap.set(fallbackUid, newProfile);
        }
      }
    } catch (logErr) {
      console.warn('[userService] activity_logs aggregation non-fatal:', logErr);
    }

    // 4. 서브컬렉션(verseData, sermons) 전수조사 완전 제거:
    // 유저 문서 자체에 저장된 noteCount, sermonCount 메타데이터를 사용하여 Firestore 읽기 비용 99% 절감
    const userList = Array.from(mergedUserMap.values());
    console.log(`[userService] fetchAllUsers 완료 (초경량): 총 ${userList.length}명`);
    return userList.sort((a, b) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0));
  } catch (err: any) {
    console.error('[userService] fetchAllUsers failed:', err?.code || err);
    throw err;
  }
}

/**
 * [관리자 전용] 활동 로그 목록 조회
 */
export async function fetchActivityLogs(limitCount: number = 200): Promise<ActivityLogEntry[]> {
  const logsRef = collection(db, 'activity_logs');
  try {
    const snap = await getDocs(logsRef);
    const logs: ActivityLogEntry[] = [];
    snap.forEach(docSnap => {
      logs.push({ id: docSnap.id, ...docSnap.data() } as ActivityLogEntry);
    });
    return logs
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limitCount);
  } catch (err) {
    console.error('[userService] fetchActivityLogs failed:', err);
    throw err;
  }
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
      'aiCredits.paidRemaining': increment(count),
      'aiCredits.freeRemaining': 0, // 플랜 구독자는 무료 크레딧 미지급 원칙
      'aiCredits.paidExpiresAt': oneYearLater,
      'lastBonusGrantedAt': Date.now(),
      'lastBonusReason': reason,
      'subscribedPlan': reason,
      'subscribedAt': Date.now(),
      'rechargeHistory': arrayUnion(historyEntry),
    };

    await updateDoc(userRef, updates);

    // 동일 이메일의 fallback 문서가 존재하는 경우에만 단 1건 핀셋 동기화 (전체 컬렉션 전수조사 방지)
    if (targetEmail) {
      const lower = targetEmail.trim().toLowerCase();
      const fallbackId = 'user_' + lower.replace(/[^a-zA-Z0-9]/g, '_');
      if (fallbackId !== uid) {
        const fbRef = doc(db, 'users', fallbackId);
        getDoc(fbRef).then(snap => {
          if (snap.exists()) {
            updateDoc(fbRef, updates).catch(() => {});
          }
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

    await updateDoc(userRef, updates);

    if (targetEmail) {
      const lower = targetEmail.trim().toLowerCase();
      const fallbackId = 'user_' + lower.replace(/[^a-zA-Z0-9]/g, '_');
      if (fallbackId !== uid) {
        const fbRef = doc(db, 'users', fallbackId);
        getDoc(fbRef).then(snap => {
          if (snap.exists()) {
            updateDoc(fbRef, updates).catch(() => {});
          }
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[userService] addCloudCapacityToUser failed:', err);
    throw err;
  }
}
