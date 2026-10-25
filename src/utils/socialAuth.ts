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

// 결제 UI 리다이렉트 전용 프론트엔드 호스팅 주소 (로컬 포트 5173 / 배포 시 sermon.thenations.kr)
export function getAuthHubFrontendBase(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:5173';
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

export const RECENT_LOGIN_KEY = 'nations_recent_login_provider';

export function getRecentLoginProvider(): string | null {
  try {
    return localStorage.getItem(RECENT_LOGIN_KEY) || null;
  } catch (e) {
    return null;
  }
}

export function setRecentLoginProvider(provider: string | null | undefined): void {
  try {
    if (provider) {
      localStorage.setItem(RECENT_LOGIN_KEY, provider);
    }
  } catch (e) {}
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
      setRecentLoginProvider(profileMeta.provider || provider);
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
  setRecentLoginProvider(provider);

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


// 통합 4개 앱 플랜 결제 및 권한 동기화를 위한 공통 클라이언트 함수
export interface UniversalPaymentOptions {
  uid: string;
  targetApp: 'sermon' | 'bible' | 'studio' | 'vote';
  planId: string;
  planName: string;
  billingCycle: 'monthly' | 'yearly' | 'once';
  amount?: number;
  options?: Record<string, any>;
}

export interface UniversalPaymentResult {
  success: boolean;
  appPlan?: {
    planId: string;
    planName: string;
    billingCycle: string;
    amount: number;
    orderId: string;
    updatedAt: string;
    options?: Record<string, any>;
  };
  error?: string;
}

export async function processUniversalPayment(
  opts: UniversalPaymentOptions
): Promise<UniversalPaymentResult> {
  try {
    const apiBase = getAuthHubApiBase();
    const res = await fetch(`${apiBase}/api/user/plan/universal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: opts.uid,
        target_app: opts.targetApp,
        plan_id: opts.planId,
        plan_name: opts.planName,
        billing_cycle: opts.billingCycle,
        amount: opts.amount || 0,
        options: opts.options || {},
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || '결제/플랜 동기화 실패 응답입니다.');
    }

    const data = await res.json();
    return {
      success: true,
      appPlan: data.appPlan,
    };
  } catch (e: any) {
    console.error('[UniversalPayment] Error:', e);
    return {
      success: false,
      error: e?.message || '플랜 변경 중 오류가 발생했습니다.',
    };
  }
}

export async function getHubAppPlan(
  uid: string,
  targetApp: 'sermon' | 'bible' | 'studio' | 'vote'
): Promise<any | null> {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(authDb, 'users', uid));
    if (snap.exists()) {
      const appPlans = snap.data()?.appPlans || {};
      return appPlans[targetApp] || null;
    }
  } catch (e) {
    console.warn('[HubAppPlan] Fetch warning:', e);
  }
  return null;
}

// 토스페이먼츠(Toss Payments) 결제창 연동 (Sandbox 기본키 탑재)
export const TOSS_CLIENT_KEY = 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq';

export function loadTossPaymentsSdk(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window not available'));
  const win = window as any;
  if (win.TossPayments) {
    return Promise.resolve(win.TossPayments(TOSS_CLIENT_KEY));
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.tosspayments.com/v1/payment';
    script.async = true;
    script.onload = () => {
      if (win.TossPayments) {
        resolve(win.TossPayments(TOSS_CLIENT_KEY));
      } else {
        reject(new Error('TossPayments SDK 로드 실패'));
      }
    };
    script.onerror = () => reject(new Error('TossPayments SDK 스크립트 로드 오류'));
    document.head.appendChild(script);
  });
}

export async function requestTossPayment(params: {
  amount: number;
  orderId: string;
  orderName: string;
  customerName?: string;
  customerEmail?: string;
  successUrl: string;
  failUrl: string;
  method?: string;
}) {
  const toss = await loadTossPaymentsSdk();
  const method = params.method || '카드';
  return toss.requestPayment(method, {
    amount: params.amount,
    orderId: params.orderId,
    orderName: params.orderName,
    customerName: params.customerName || '네이션스 바이블 회원',
    customerEmail: params.customerEmail || undefined,
    successUrl: params.successUrl,
    failUrl: params.failUrl,
  });
}
