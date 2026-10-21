import { signInWithCustomToken, updateProfile, type Auth, type User } from 'firebase/auth';
import { doc, setDoc, getDoc, arrayUnion } from 'firebase/firestore';
import { authDb } from '../api/firebaseConfig';

export const KAKAO_JS_KEY = 'f2d55d3457db1b6b08e774ebf5a2ddb9';
export const KAKAO_REST_API_KEY = '5b1557d770b83e5e5518fcb9e94f8825';
export const NAVER_CLIENT_ID = 'GlNO2q5VXEQcEYktPIoP';

declare global {
  interface Window {
    Kakao?: any;
  }
}

export function getAuthHubApiBase(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://127.0.0.1:8000';
    }
  }
  return 'https://sermon.thenations.kr';
}

export function initKakaoSdk(): boolean {
  if (typeof window === 'undefined' || !window.Kakao) return false;
  if (!window.Kakao.isInitialized()) {
    try {
      window.Kakao.init(KAKAO_JS_KEY);
    } catch (e) {
      console.warn('[SocialAuth] Kakao init error:', e);
    }
  }
  return window.Kakao.isInitialized();
}

export function startKakaoLogin(targetApp: string = 'bible'): void {
  const redirectUri = `${window.location.origin}/auth/kakao/callback`;
  const state = `kakao_${targetApp}_${Date.now()}`;
  sessionStorage.setItem('oauth_provider', 'kakao');
  sessionStorage.setItem('oauth_target_app', targetApp);
  sessionStorage.setItem('oauth_redirect_uri', redirectUri);
  if (window.location.search) sessionStorage.setItem('oauth_return_search', window.location.search);
  const sp = new URLSearchParams(window.location.search);
  const inv = sp.get('invite') || sp.get('ref');
  if (inv) localStorage.setItem('pending_invite_code', inv.trim());

  const authUrl =
    `https://kauth.kakao.com/oauth/authorize` +
    `?client_id=${encodeURIComponent(KAKAO_REST_API_KEY)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&state=${encodeURIComponent(state)}`;

  window.location.href = authUrl;
}

export function startNaverLogin(targetApp: string = 'bible'): void {
  const redirectUri = `${window.location.origin}/auth/naver/callback`;
  const state = `naver_${targetApp}_${Date.now()}`;
  sessionStorage.setItem('oauth_provider', 'naver');
  sessionStorage.setItem('oauth_target_app', targetApp);
  sessionStorage.setItem('oauth_redirect_uri', redirectUri);
  if (window.location.search) sessionStorage.setItem('oauth_return_search', window.location.search);
  const sp = new URLSearchParams(window.location.search);
  const inv = sp.get('invite') || sp.get('ref');
  if (inv) localStorage.setItem('pending_invite_code', inv.trim());

  const authUrl =
    `https://nid.naver.com/oauth2.0/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(NAVER_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  window.location.href = authUrl;
}

export interface SocialUserMeta {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  provider: string;
}

export function getSocialUserMeta(user: User | null): SocialUserMeta | null {
  if (!user) return null;
  try {
    const raw = localStorage.getItem(`nations_social_user_${user.uid}`);
    if (raw) {
      return JSON.parse(raw) as SocialUserMeta;
    }
  } catch (e) {}
  return null;
}

export async function processOAuthCallback(auth: Auth): Promise<{
  success: boolean;
  user?: User;
  profile?: SocialUserMeta;
  error?: string;
} | null> {
  if (typeof window === 'undefined') return null;

  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') || '';
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    url.searchParams.delete('state');
    window.history.replaceState({}, document.title, url.pathname + url.search);
    return { success: false, error: '소셜 로그인이 취소되었거나 실패했습니다.' };
  }

  if (!code) return null;

  let provider = sessionStorage.getItem('oauth_provider') || '';
  if (url.pathname.startsWith('/auth/kakao/callback') || state.startsWith('kakao_')) provider = 'kakao';
  else if (url.pathname.startsWith('/auth/naver/callback') || state.startsWith('naver_')) provider = 'naver';

  if (provider !== 'kakao' && provider !== 'naver') {
    return null;
  }

  const targetApp = sessionStorage.getItem('oauth_target_app') || 'bible';
  const redirectUri = sessionStorage.getItem('oauth_redirect_uri') || `${window.location.origin}/auth/${provider}/callback`;

  // URL에서 OAuth 콜백 경로 및 일회성 파라미터 즉시 정리
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  const savedSearch = sessionStorage.getItem('oauth_return_search') || '';
  sessionStorage.removeItem('oauth_return_search');
  const cleanPath = url.pathname.startsWith('/auth/') ? '/' : url.pathname;
  const finalSearch = url.search ? url.search : savedSearch;
  window.history.replaceState({}, document.title, cleanPath + finalSearch);
  sessionStorage.removeItem('oauth_provider');

  try {
    const apiBase = getAuthHubApiBase();
    const res = await fetch(`${apiBase}/api/auth/${provider}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        redirectUri,
        state,
        targetApp,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `${provider.toUpperCase()} 로그인 토큰 발급 실패`);
    }

    const data = await res.json();
    if (!data.customToken) {
      throw new Error('Custom Token이 반환되지 않았습니다.');
    }

    const cred = await signInWithCustomToken(auth, data.customToken);
    const accountData = data.account || data.user || {};
    const profileMeta: SocialUserMeta = {
      uid: cred.user.uid,
      email: accountData.email || cred.user.email || '',
      displayName: accountData.displayName || cred.user.displayName || '성도님',
      photoURL: accountData.photoURL || cred.user.photoURL || '',
      provider,
    };

    try {
      localStorage.setItem(`nations_social_user_${cred.user.uid}`, JSON.stringify(profileMeta));
    } catch (e) {}

    if (profileMeta.displayName && !cred.user.displayName) {
      try {
        await updateProfile(cred.user, {
          displayName: profileMeta.displayName,
          photoURL: profileMeta.photoURL || undefined,
        });
      } catch (e) {}
    }

    return {
      success: true,
      user: cred.user,
      profile: profileMeta,
    };
  } catch (err: any) {
    console.error('[SocialAuth] Callback error:', err);
    return {
      success: false,
      error: err?.message || '소셜 로그인 처리 중 오류가 발생했습니다.',
    };
  }
}

export async function syncUserWithHub(user: User, targetApp: string = 'bible'): Promise<void> {
  if (!user?.uid) return;
  const socialMeta = getSocialUserMeta(user);
  const providerData = user.providerData?.[0]?.providerId || '';
  let provider = socialMeta?.provider || 'google';
  if (user.uid.startsWith('kakao:')) provider = 'kakao';
  else if (user.uid.startsWith('naver:')) provider = 'naver';
  else if (providerData === 'password') provider = 'email';

  const email = user.email || socialMeta?.email || '';
  const displayName = user.displayName || socialMeta?.displayName || (email ? email.split('@')[0] : '성도님');
  const photoURL = user.photoURL || socialMeta?.photoURL || '';
  const nowIso = new Date().toISOString();

  // 1. 허브 Firestore (sermon-ym) users/{uid} 직접 병합 (기존 크레딧/플랜 필드는 절대 덮어쓰지 않음)
  try {
    const hubUserRef = doc(authDb, 'users', user.uid);
    const snap = await getDoc(hubUserRef);
    if (snap.exists()) {
      await setDoc(
        hubUserRef,
        {
          uid: user.uid,
          email: email || snap.data().email || '',
          displayName: displayName || snap.data().displayName || '성도님',
          photoURL: photoURL || snap.data().photoURL || '',
          provider,
          lastLoginAt: nowIso,
          updatedAt: nowIso,
          connectedApps: arrayUnion(targetApp),
        },
        { merge: true }
      );
    } else {
      const cleanUid = user.uid.replace(/^(kakao|naver):/i, '');
      await setDoc(
        hubUserRef,
        {
          uid: user.uid,
          email,
          displayName,
          photoURL,
          provider,
          targetApp,
          connectedApps: [targetApp],
          paidSermons: [],
          inviteCode: cleanUid.slice(0, 8),
          createdAt: nowIso,
          lastLoginAt: nowIso,
          updatedAt: nowIso,
        },
        { merge: true }
      );
    }
  } catch (e) {
    console.warn('[SocialAuth] Hub Firestore sync non-fatal:', e);
  }

  // 2. 허브 백엔드 API (/api/auth/sync) 비동기 호출
  try {
    const apiBase = getAuthHubApiBase();
    await fetch(`${apiBase}/api/auth/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: user.uid,
        email,
        displayName,
        photoURL,
        provider,
        targetApp,
      }),
    });
  } catch (e) {}
}

export function shareInviteViaKakao(options: {
  inviteUrl: string;
  userName?: string;
  appName?: string;
  title?: string;
  description?: string;
}): boolean {
  const {
    inviteUrl,
    userName = '성도',
    appName = 'NATIONS BIBLE',
    title = `${userName}님이 ${appName}에 초대하셨습니다!`,
    description = '원어 주석·역사적 배경·설교 인사이트까지, 초대 링크로 가입 후 첫 주석 생성 시 20 크레딧 보너스를 드립니다.',
  } = options;

  if (initKakaoSdk() && window.Kakao?.Share) {
    try {
      window.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title,
          description,
          imageUrl: 'https://bible.thenations.kr/icon.png',
          link: {
            mobileWebUrl: inviteUrl,
            webUrl: inviteUrl,
          },
        },
        buttons: [
          {
            title: '초대 수락하고 시작하기',
            link: {
              mobileWebUrl: inviteUrl,
              webUrl: inviteUrl,
            },
          },
        ],
      });
      return true;
    } catch (e) {
      console.warn('[SocialAuth] Kakao.Share error:', e);
    }
  }
  return false;
}
