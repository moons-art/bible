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

/**
 * 로그인 시 사용자 프로필 동기화 및 생성
 */
export async function syncUserProfile(
  user: User, 
  extraStats?: { noteCount?: number; sermonCount?: number }
): Promise<UserProfile> {
  const userRef = doc(db, 'users', user.uid);
  const currentMonth = getCurrentMonthKey();
  const now = Date.now();
  const devInfo = getDeviceInfo();

  try {
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      // 신규 유저 생성
      const newProfile: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || user.email?.split('@')[0] || '이용자',
        photoURL: user.photoURL || '',
        createdAt: now,
        lastLoginAt: now,
        loginCount: 1,
        deviceInfo: devInfo,
        aiCredits: {
          freeRemaining: 10,
          paidRemaining: 0,
          totalUsed: 0,
          lastResetMonth: currentMonth,
          paidExpiresAt: undefined,
        },
        allowedVersions: [],
        noteCount: extraStats?.noteCount || 0,
        sermonCount: extraStats?.sermonCount || 0,
      };

      await setDoc(userRef, newProfile);
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

      const updated: Partial<UserProfile> = {
        email: user.email || existing.email,
        displayName: user.displayName || existing.displayName,
        photoURL: user.photoURL || existing.photoURL,
        lastLoginAt: now,
        loginCount: (existing.loginCount || 0) + 1,
        deviceInfo: devInfo,
        aiCredits,
      };

      if (extraStats?.noteCount !== undefined) updated.noteCount = extraStats.noteCount;
      if (extraStats?.sermonCount !== undefined) updated.sermonCount = extraStats.sermonCount;

      await updateDoc(userRef, updated);
      return { ...existing, ...updated } as UserProfile;
    }
  } catch (err) {
    console.error('[userService] syncUserProfile failed:', err);
    throw err;
  }
}

/**
 * 실시간 사용자 프로필 구독
 */
export function subscribeUserProfile(
  uid: string, 
  onUpdate: (profile: UserProfile | null) => void
) {
  const userRef = doc(db, 'users', uid);
  return onSnapshot(userRef, (snap) => {
    if (snap.exists()) {
      onUpdate(snap.data() as UserProfile);
    } else {
      onUpdate(null);
    }
  }, (err) => {
    console.error('[userService] subscribeUserProfile error:', err);
  });
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
 * [관리자 전용] 전체 사용자 목록 조회
 */
export async function fetchAllUsers(): Promise<UserProfile[]> {
  const usersRef = collection(db, 'users');
  try {
    const snap = await getDocs(usersRef);
    const users: UserProfile[] = [];
    snap.forEach(docSnap => {
      users.push({ ...docSnap.data(), uid: docSnap.id } as UserProfile);
    });
    console.log(`[userService] fetchAllUsers 완료: ${users.length}명`);
    return users.sort((a, b) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0));
  } catch (err: any) {
    console.error('[userService] fetchAllUsers failed:', err?.code || err);
    throw err;
  }
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
    await updateDoc(userRef, {
      'aiCredits.paidRemaining': increment(count),
      'aiCredits.paidExpiresAt': oneYearLater,
      'lastBonusGrantedAt': Date.now(),
      'lastBonusReason': reason,
    });
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
    if (!snap.exists()) return;
    const profile = snap.data() as UserProfile;
    let allowed = profile.allowedVersions || [];

    if (enable) {
      if (!allowed.includes(versionId)) allowed.push(versionId);
    } else {
      allowed = allowed.filter(id => id !== versionId);
    }

    await updateDoc(userRef, { allowedVersions: allowed });
  } catch (err) {
    console.error('[userService] toggleUserAllowedVersion failed:', err);
    throw err;
  }
}
