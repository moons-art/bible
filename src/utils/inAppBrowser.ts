/**
 * 모바일 인앱 브라우저(카카오톡, 인스타그램, 라인 등) 감지 및 외부 브라우저(크롬, 사파리) 탈출 유틸
 * - 구글 OAuth의 '403: disallowed_useragent' 에러를 원천 방지
 */

export function isInAppBrowser(): boolean {
  if (typeof window === 'undefined' || !navigator.userAgent) return false;
  const ua = navigator.userAgent.toUpperCase();
  return (
    ua.includes('KAKAOTALK') ||
    ua.includes('INSTAGRAM') ||
    ua.includes('FB_IAB') ||
    ua.includes('FB4A') ||
    ua.includes('FBIOS') ||
    ua.includes('LINE') ||
    ua.includes('NAVER(INAPP')
  );
}

export function escapeInAppBrowser(targetUrl?: string): void {
  if (typeof window === 'undefined') return;
  const currentUrl = targetUrl || window.location.href;
  const ua = navigator.userAgent.toUpperCase();

  // 1. 안드로이드: 크롬 외부 브라우저 강제 인텐트 실행
  if (ua.includes('ANDROID')) {
    const rawUrl = currentUrl.replace(/^https?:\/\//, '');
    window.location.href = `intent://${rawUrl}#Intent;scheme=https;package=com.android.chrome;end;`;
    return;
  }

  // 2. iOS 카카오톡: 외부 사파리 브라우저 호출 스키마
  if (ua.includes('IPHONE') || ua.includes('IPAD') || ua.includes('IPOD')) {
    if (ua.includes('KAKAOTALK')) {
      window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(currentUrl)}`;
      return;
    }
  }
}
