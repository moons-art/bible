import React, { useState, useEffect } from 'react';
import { Download, Share, X, Monitor, Smartphone, Laptop } from 'lucide-react';

// NATIONS BIBLE 공식 앱 아이콘 (5개 대칭 테라코타 기둥 심볼)
export const NationsAppIcon: React.FC<{ className?: string; color?: string }> = ({ 
  className = "w-4 h-4",
  color = "#C46A40" 
}) => (
  <svg 
    viewBox="0 0 512 512" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <g fill={color}>
      {/* 1번 기둥 (좌측 외곽) */}
      <rect x="138" y="225" width="32" height="172" rx="6" />
      {/* 2번 기둥 (좌측 중간) */}
      <rect x="189" y="140" width="32" height="257" rx="6" />
      {/* 3번 기둥 (중앙 최고점) */}
      <rect x="240" y="115" width="32" height="282" rx="6" />
      {/* 4번 기둥 (우측 중간) */}
      <rect x="291" y="140" width="32" height="257" rx="6" />
      {/* 5번 기둥 (우측 외곽) */}
      <rect x="342" y="225" width="32" height="172" rx="6" />
    </g>
  </svg>
);




interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const STORAGE_KEY = 'pwa_install_prompt_dismissed';
const INSTALLED_KEY = 'pwa_installed_permanently';
const HIDE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7일

type BrowserType = 'chromium-edge' | 'chromium-chrome' | 'safari-mac' | 'safari-ios' | 'other';

export const InstallPromptBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [browserType, setBrowserType] = useState<BrowserType>('other');
  const [isVisible, setIsVisible] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  useEffect(() => {
    // URL 파라미터로 강제 프리뷰 확인 (테스트 및 모달 확인용)
    const urlParams = new URLSearchParams(window.location.search);
    const forceShow = urlParams.get('pwa_preview') === 'true' || urlParams.get('install') === 'true';

    // 1. 이미 PWA Standalone 모드로 실행 중인지 감지
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    if (!forceShow) {
      if (isStandalone) {
        localStorage.setItem(INSTALLED_KEY, 'true');
        return;
      }

      // 2. 영구 설치 완료 여부 확인
      if (localStorage.getItem(INSTALLED_KEY) === 'true') {
        return;
      }

      // 3. 7일 이내에 사용자가 닫았는지 확인
      const dismissedAt = localStorage.getItem(STORAGE_KEY);
      if (dismissedAt) {
        const timePassed = Date.now() - parseInt(dismissedAt, 10);
        if (timePassed < HIDE_DURATION_MS) {
          return;
        }
      }
    }

    // 4. 기기 및 브라우저 환경 판별 (Edge 최우선 판별)
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isMac = /macintosh|mac os x/.test(ua) && !isIOS;
    
    // Microsoft Edge 감지 (Windows/Mac/Mobile Edge 모두 포함)
    const isEdge = /edg|edge|edga|edgios/i.test(ua);
    // Safari 감지 (Edge나 Chrome이 아닌 순수 Safari)
    const isSafari = !isEdge && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    // Chrome 감지 (Edge가 아닌 Chromium Chrome)
    const isChrome = !isEdge && /chrome|crios/i.test(ua);

    let detected: BrowserType = 'other';
    if (isEdge) {
      detected = 'chromium-edge';
    } else if (isSafari) {
      if (isIOS) detected = 'safari-ios';
      else if (isMac) detected = 'safari-mac';
    } else if (isChrome) {
      detected = 'chromium-chrome';
    }
    setBrowserType(detected);

    // 5. Chromium(Chrome, Edge) 계열: beforeinstallprompt 이벤트 캡처
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    // 6. 설치 완료 이벤트 감지
    const handleAppInstalled = () => {
      localStorage.setItem(INSTALLED_KEY, 'true');
      setIsVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // 배너 노출 활성화
    setIsVisible(true);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // 닫기 (7일간 숨김)
  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    setIsVisible(false);
  };

  // 설치 버튼 클릭 처리
  const handleInstallClick = async () => {
    // 1. beforeinstallprompt 이벤트가 이미 잡혀있는 경우 (Edge, Chrome)
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          localStorage.setItem(INSTALLED_KEY, 'true');
          setIsVisible(false);
          setDeferredPrompt(null);
          return;
        }
        // 사용자가 닫았거나 취소한 경우에도 안내 모달로 가이드 제공
        setDeferredPrompt(null);
        setShowGuideModal(true);
        return;
      } catch (err) {
        console.error('Install prompt error:', err);
      }
    }

    // 2. 이벤트가 없거나 Safari, Edge 등 수동 가이드가 필요한 경우 모달 오픈
    setShowGuideModal(true);
  };

  if (!isVisible) return null;

  return (
    <>
      {/* 1. 상단 플로팅 배너 (Claude Aesthetic: 웜 샌드 & 테라코타) */}
      <aside 
        aria-label="앱 설치 안내" 
        className="fixed top-0 left-0 w-full z-[90] bg-[#FBF9F7]/95 text-[#2C2B29] border-b border-[#E8E3DA] shadow-xs backdrop-blur-md transition-all duration-300"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-3 text-xs sm:text-sm">
          
          {/* 좌측: NATIONS BIBLE 공식 앱 아이콘 & 안내 텍스트 */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-[#F7F3EE] text-[#C46A40] border border-[#EAE2D8] shrink-0 shadow-2xs">
              <NationsAppIcon className="w-4.5 h-4.5" />
            </div>
            <div className="truncate flex items-baseline gap-2">
              <span className="font-serif font-bold text-[#2C2B29]">데스크톱 앱으로 더 쾌적하게 연구하세요!</span>
              <span className="hidden md:inline text-[#7A756D] text-xs font-sans">
                인터넷 주소창 없이 전체화면 및 초고속 실행이 지원됩니다.
              </span>
            </div>
          </div>

          {/* 우측: 시그니처 테라코타 설치 버튼 & 닫기 */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              id="pwa-install-btn"
              onClick={handleInstallClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#C96442] hover:bg-[#B55434] active:bg-[#A3472A] text-white font-medium text-xs shadow-2xs transition-colors cursor-pointer"
            >
              {browserType === 'safari-ios' ? (
                <>
                  <Share className="w-3.5 h-3.5 stroke-[2]" />
                  <span>홈 화면에 추가</span>
                </>
              ) : browserType === 'safari-mac' ? (
                <>
                  <Monitor className="w-3.5 h-3.5 stroke-[2]" />
                  <span>Mac 앱으로 설치</span>
                </>
              ) : browserType === 'chromium-edge' ? (
                <>
                  <Laptop className="w-3.5 h-3.5 stroke-[2]" />
                  <span>Edge 앱으로 설치</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 stroke-[2]" />
                  <span>1초 만에 앱 설치</span>
                </>
              )}
            </button>

            <button
              onClick={handleDismiss}
              className="p-1 rounded-lg text-[#8C877D] hover:text-[#2C2B29] hover:bg-[#EFEAE2] transition-colors cursor-pointer"
              title="7일 동안 보지 않기"
            >
              <X className="w-4 h-4 stroke-[1.8]" />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. 브라우저별 전용 설치 안내 모달 */}
      {showGuideModal && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setShowGuideModal(false)}
        >
          <div 
            className="relative w-full max-w-md bg-[#FAF9F5] text-[#2C2B29] rounded-2xl shadow-2xl border border-[#E7E5DF] overflow-hidden p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 닫기 버튼 */}
            <button 
              onClick={() => setShowGuideModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-[#8C877D] hover:text-[#2C2B29] hover:bg-[#EFEAE2] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4 stroke-[1.8]" />
            </button>

            {/* A. macOS Safari 안내 (상단 툴바 공유 아이콘 -> Dock에 추가) */}
            {browserType === 'safari-mac' && (
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#F7F3EE] border border-[#EAE2D8] flex items-center justify-center text-[#C46A40] mb-3.5 shadow-2xs">
                  <NationsAppIcon className="w-8 h-8" />
                </div>
                <h3 className="text-base font-serif font-bold text-[#2C2B29] mb-1">Mac 앱(Dock)으로 추가하기</h3>
                <p className="text-xs text-[#7A756D] mb-5">Safari 상단 툴바에서 바로 독립 앱으로 등록할 수 있습니다.</p>

                <div className="w-full text-left space-y-3 bg-white p-4 rounded-xl border border-[#E8E3DA] text-xs sm:text-sm">
                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#FAF0EB] text-[#C96442] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <span className="flex items-center gap-1 flex-wrap leading-relaxed">
                      Safari 상단 툴바 우측의 <strong>[공유 아이콘]</strong>
                      <Share className="inline w-3.5 h-3.5 text-[#C96442] stroke-[2]" /> 을 클릭합니다.
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#FAF0EB] text-[#C96442] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <span className="leading-relaxed">목록에서 <strong>[Dock에 추가...]</strong>를 선택합니다.</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#FAF0EB] text-[#C96442] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <span className="leading-relaxed">팝업에서 <strong>[추가]</strong>를 누르면 Mac 앱으로 설치 완료!</span>
                  </div>
                </div>

                <button
                  onClick={() => setShowGuideModal(false)}
                  className="mt-5 w-full py-2.5 rounded-xl bg-[#C96442] hover:bg-[#B55434] text-white font-medium text-xs transition-colors cursor-pointer shadow-2xs"
                >
                  확인했습니다
                </button>
              </div>
            )}

            {/* B. Microsoft Edge 안내 */}
            {browserType === 'chromium-edge' && (
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#F7F3EE] border border-[#EAE2D8] flex items-center justify-center text-[#C46A40] mb-3.5 shadow-2xs">
                  <NationsAppIcon className="w-8 h-8" />
                </div>
                <h3 className="text-base font-serif font-bold text-[#2C2B29] mb-1">Microsoft Edge에서 앱 설치하기</h3>
                <p className="text-xs text-[#7A756D] mb-5">Edge 주소창을 통해 데스크톱 앱으로 손쉽게 설치할 수 있습니다.</p>

                <div className="w-full text-left space-y-3 bg-white p-4 rounded-xl border border-[#E8E3DA] text-xs sm:text-sm">
                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#FAF0EB] text-[#C96442] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <span className="leading-relaxed">
                      Edge 상단 <strong>주소창 오른쪽</strong>의 <strong>[앱 사용 가능]</strong> 아이콘을 클릭합니다.
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#FAF0EB] text-[#C96442] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <span className="leading-relaxed">
                      (또는 우측 상단 <strong>[...]</strong> 메뉴 → <strong>[앱]</strong> → <strong>[이 사이트를 앱으로 설치]</strong> 선택)
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#FAF0EB] text-[#C96442] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <span className="leading-relaxed">
                      팝업에서 <strong>[설치]</strong>를 누르면 바탕화면/작업표시줄에 등록 완료!
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setShowGuideModal(false)}
                  className="mt-5 w-full py-2.5 rounded-xl bg-[#C96442] hover:bg-[#B55434] text-white font-medium text-xs transition-colors cursor-pointer shadow-2xs"
                >
                  확인했습니다
                </button>
              </div>
            )}

            {/* C. Google Chrome 안내 */}
            {(browserType === 'chromium-chrome' || browserType === 'other') && (
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#F7F3EE] border border-[#EAE2D8] flex items-center justify-center text-[#C46A40] mb-3.5 shadow-2xs">
                  <NationsAppIcon className="w-8 h-8" />
                </div>
                <h3 className="text-base font-serif font-bold text-[#2C2B29] mb-1">Chrome에서 앱 설치하기</h3>
                <p className="text-xs text-[#7A756D] mb-5">크롬 주소창을 통해 1초 만에 데스크톱 앱으로 등록할 수 있습니다.</p>

                <div className="w-full text-left space-y-3 bg-white p-4 rounded-xl border border-[#E8E3DA] text-xs sm:text-sm">
                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#FAF0EB] text-[#C96442] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <span className="leading-relaxed">
                      크롬 브라우저 상단 <strong>주소창 오른쪽 끝</strong>의 <strong>[설치]</strong> 아이콘을 클릭합니다.
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#FAF0EB] text-[#C96442] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <span className="leading-relaxed">
                      (또는 우측 상단 <strong>[⋮]</strong> 메뉴 → <strong>[저장 및 공유]</strong> → <strong>[앱 설치]</strong> 선택)
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#FAF0EB] text-[#C96442] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <span className="leading-relaxed">
                      <strong>[설치]</strong> 버튼을 누르면 독립 앱으로 설치 완료!
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setShowGuideModal(false)}
                  className="mt-5 w-full py-2.5 rounded-xl bg-[#C96442] hover:bg-[#B55434] text-white font-medium text-xs transition-colors cursor-pointer shadow-2xs"
                >
                  확인했습니다
                </button>
              </div>
            )}

            {/* D. iOS / iPadOS Safari 안내 */}
            {browserType === 'safari-ios' && (
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#F7F3EE] border border-[#EAE2D8] flex items-center justify-center text-[#C46A40] mb-3.5 shadow-2xs">
                  <NationsAppIcon className="w-8 h-8" />
                </div>
                <h3 className="text-base font-serif font-bold text-[#2C2B29] mb-1">홈 화면에 바로가기 앱 추가</h3>
                <p className="text-xs text-[#7A756D] mb-5">전체화면 앱 형태로 편리하게 사용할 수 있습니다.</p>

                <div className="w-full text-left space-y-3 bg-white p-4 rounded-xl border border-[#E8E3DA] text-xs sm:text-sm">
                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#FAF0EB] text-[#C96442] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <span className="flex items-center gap-1 flex-wrap leading-relaxed">
                      Safari 하단 툴바의 <strong>[공유 아이콘]</strong>
                      <Share className="inline w-3.5 h-3.5 text-[#C96442] stroke-[2]" /> 을 탭합니다.
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#FAF0EB] text-[#C96442] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <span className="leading-relaxed">메뉴를 아래로 내려 <strong>[홈 화면에 추가]</strong>를 선택합니다.</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#FAF0EB] text-[#C96442] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <span className="leading-relaxed">우측 상단의 <strong>[추가]</strong>를 누르면 완료됩니다.</span>
                  </div>
                </div>

                <button
                  onClick={() => setShowGuideModal(false)}
                  className="mt-5 w-full py-2.5 rounded-xl bg-[#C96442] hover:bg-[#B55434] text-white font-medium text-xs transition-colors cursor-pointer shadow-2xs"
                >
                  확인했습니다
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default InstallPromptBanner;
