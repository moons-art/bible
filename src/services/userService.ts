// NATIONS BIBLE 사용자 프로필, 크레딧 및 관리자 제어 서비스
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  getDocs, 
  onSnapshot, 
  serverTimestamp,
  increment 
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../api/firebaseConfig';

export const ADMIN_EMAIL = 'ymoonsik@gmail.com';

export function isAdminUser(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
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
  aiCredits: {
    freeRemaining: number;
    paidRemaining: number;
    totalUsed: number;
    lastResetMonth: string; // 'YYYY-MM'
    paidExpiresAt?: number;
  };
  allowedVersions: string[]; // 관리자가 원격 허용한 번역본 ID 목록 (예: ['built-in-krv'])
  noteCount?: number;
  sermonCount?: number;
  activityCount?: number;
  lastAction?: string;
  lastBonusReason?: string;
  lastBonusGrantedAt?: number;
  isNewSignUp?: boolean;
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
          console.log(`[userService] 🎉 신규 가입 프로모션 적용: +${promo.bonusCredits}회 (${user.email})`);
        }
      } catch (promoErr) {
        console.warn('[userService] Failed to check promotion on signup:', promoErr);
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
        aiCredits: {
          freeRemaining: 10,
          paidRemaining: initialPaidCredits,
          totalUsed: 0,
          lastResetMonth: currentMonth,
          paidExpiresAt: initialPaidCredits > 0 ? oneYearLater : inheritedPaidExpiresAt,
        },
        allowedVersions: inheritedAllowedVersions,
        noteCount: extraStats?.noteCount || 0,
        sermonCount: extraStats?.sermonCount || 0,
        lastBonusReason: bonusReason || undefined,
        lastBonusGrantedAt: bonusReason ? now : undefined,
        isNewSignUp: true,
      };

      await setDoc(userRef, cleanUndefined(newProfile));
      
      // 클라이언트 UI 및 로컬 스토리지 즉각 동기화 (0초 반영)
      try {
        const usagePayload = {
          monthKey: newProfile.aiCredits.lastResetMonth,
          monthlyFreeRemaining: newProfile.aiCredits.freeRemaining,
          paidRemaining: newProfile.aiCredits.paidRemaining,
          paidExpiresAt: newProfile.aiCredits.paidExpiresAt,
          totalUsed: newProfile.aiCredits.totalUsed || 0,
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

      // 월이 바뀌었으면 무료 10회 리셋
      if (aiCredits.lastResetMonth !== currentMonth) {
        aiCredits = {
          ...aiCredits,
          freeRemaining: 10,
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

      const updated: Partial<UserProfile> = {
        email: user.email || existing.email,
        displayName: user.displayName || existing.displayName,
        photoURL: user.photoURL || existing.photoURL,
        lastLoginAt: now,
        loginCount: (existing.loginCount || 0) + 1,
        deviceInfo: devInfo,
        aiCredits,
        allowedVersions: mergedAllowed,
      };

      if (extraStats?.noteCount !== undefined) updated.noteCount = extraStats.noteCount;
      if (extraStats?.sermonCount !== undefined) updated.sermonCount = extraStats.sermonCount;

      await updateDoc(userRef, cleanUndefined(updated));
      const finalProfile = { ...existing, ...updated } as UserProfile;

      // 클라이언트 UI 및 로컬 스토리지 즉각 동기화 (0초 반영)
      try {
        const usagePayload = {
          monthKey: finalProfile.aiCredits.lastResetMonth,
          monthlyFreeRemaining: finalProfile.aiCredits.freeRemaining,
          paidRemaining: finalProfile.aiCredits.paidRemaining,
          paidExpiresAt: finalProfile.aiCredits.paidExpiresAt,
          totalUsed: finalProfile.aiCredits.totalUsed || 0,
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
      onUpdate({
        ...base,
        allowedVersions: mergedAllowed,
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

    if (free > 0) {
      free -= 1;
    } else if (paid > 0) {
      paid -= 1;
    } else {
      return false; // 잔여 횟수 없음
    }

    await updateDoc(userRef, {
      'aiCredits.freeRemaining': free,
      'aiCredits.paidRemaining': paid,
      'aiCredits.totalUsed': used,
      'lastActiveAt': Date.now(),
      'lastStudiedReference': reference
    });

    return true;
  } catch (err) {
    console.error('[userService] consumeCreditInFirestore failed:', err);
    return false;
  }
}

/**
 * [관리자 전용] 전체 사용자 목록 조회 (users 컬렉션 + activity_logs + 서브컬렉션 스마트 병합 복원)
 */
export async function fetchAllUsers(): Promise<UserProfile[]> {
  try {
    const usersRef = collection(db, 'users');
    const userDocsSnap = await getDocs(usersRef);
    const userMap = new Map<string, UserProfile>();

    // 1. users 컬렉션에 실존하는 문서 파싱
    userDocsSnap.forEach(docSnap => {
      const data = docSnap.data();
      userMap.set(docSnap.id, {
        uid: docSnap.id,
        email: data.email || '',
        displayName: data.displayName || '이용자',
        photoURL: data.photoURL || '',
        createdAt: data.createdAt || Date.now(),
        lastLoginAt: data.lastLoginAt || Date.now(),
        loginCount: data.loginCount || 1,
        deviceInfo: data.deviceInfo || '알 수 없음',
        aiCredits: data.aiCredits || {
          freeRemaining: 10,
          paidRemaining: 0,
          totalUsed: 0,
          lastResetMonth: getCurrentMonthKey(),
        },
        allowedVersions: data.allowedVersions || [],
        noteCount: data.noteCount || 0,
        sermonCount: data.sermonCount || 0,
        ...data,
      } as UserProfile);
    });

    // 2. activity_logs 컬렉션 조회하여 사용자 정보 보강 및 누락된 사용자 복원
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

      // logUsers를 기반으로 userMap 보강 및 누락 회원 자동 생성
      for (const [lowerEmail, logUser] of logUsers.entries()) {
        const matchedUser = Array.from(userMap.values()).find(u => (u.email || '').toLowerCase() === lowerEmail);

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
          // users 컬렉션에 없는 유저 (Google Drive 로그인만 했거나 Phantom Document인 경우)
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

          // Firestore users 컬렉션에 영구 복원 저장
          setDoc(doc(db, 'users', fallbackUid), newProfile).catch(err => {
            console.warn('[userService] Failed to auto-persist recovered user profile:', err);
          });

          userMap.set(fallbackUid, newProfile);
        }
      }
    } catch (logErr) {
      console.warn('[userService] activity_logs aggregation non-fatal:', logErr);
    }

    // 3. 각 유저별 서브컬렉션(verseData, sermons) 문서 수 실시간 카운트
    const userList = Array.from(userMap.values());
    await Promise.allSettled(
      userList.map(async (u) => {
        try {
          const [verseSnap, sermonSnap] = await Promise.all([
            getDocs(collection(db, 'users', u.uid, 'verseData')),
            getDocs(collection(db, 'users', u.uid, 'sermons'))
          ]);
          u.noteCount = verseSnap.size;
          u.sermonCount = sermonSnap.size;
        } catch (e) {
          // 서브컬렉션 오류 무시
        }
      })
    );

    console.log(`[userService] fetchAllUsers 완료: 총 ${userList.length}명`);
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

    const updates = {
      'aiCredits.paidRemaining': increment(count),
      'aiCredits.paidExpiresAt': oneYearLater,
      'lastBonusGrantedAt': Date.now(),
      'lastBonusReason': reason,
    };

    await updateDoc(userRef, updates);

    // 동일 이메일의 다른 문서(fallback 또는 실제 UID)에도 동시 반영
    if (targetEmail) {
      const lower = targetEmail.trim().toLowerCase();
      const usersRef = collection(db, 'users');
      const allDocs = await getDocs(usersRef);
      allDocs.forEach(d => {
        if (d.id !== uid && (d.data().email || '').trim().toLowerCase() === lower) {
          updateDoc(d.ref, updates).catch(() => {});
        }
      });
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

    // 2. 이메일이 일치하는 모든 사용자 문서(fallback 문서 및 실제 Auth UID 문서)에 동시 전파
    if (targetEmail) {
      const usersRef = collection(db, 'users');
      const allDocs = await getDocs(usersRef);
      allDocs.forEach(d => {
        if (d.id !== uid && (d.data().email || '').trim().toLowerCase() === targetEmail) {
          setDoc(d.ref, { allowedVersions: allowed }, { merge: true }).catch(() => {});
        }
      });
    }
  } catch (err) {
    console.error('[userService] toggleUserAllowedVersion failed:', err);
    throw err;
  }
}
