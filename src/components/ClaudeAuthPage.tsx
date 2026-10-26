import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowDown,
  Plus,
  Minus,
  Check,
  CreditCard,
  Database,
  ChevronDown,
  Building2,
  FileText,
  RotateCcw,
  Shield,
  HelpCircle,
  type User,
} from 'lucide-react';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth, googleProvider } from '../api/firebaseConfig';
import { isInAppBrowser, escapeInAppBrowser } from '../utils/inAppBrowser';
import {
  startKakaoLogin,
  startNaverLogin,
  getSocialUserMeta,
  getRecentLoginProvider,
  requestTossPayment,
  requestTossBillingAuth,
} from '../utils/socialAuth';
import { syncUserProfile } from '../services/userService';
import LegalPolicyModal, { type LegalPolicyTab } from './LegalPolicyModal';
import { useHomeLandingData } from '../services/homeLandingService';

// 동그란 구글 아이콘 버튼용 SVG
const GoogleCircularIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

// 동그란 카카오 아이콘 버튼용 SVG
const KakaoCircularIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#191919]" aria-hidden="true">
    <path d="M12 3C6.477 3 2 6.463 2 10.735c0 2.773 1.883 5.206 4.706 6.567-.156.567-.565 2.054-.647 2.375-.103.398.146.392.307.285.126-.084 2.01-1.365 2.818-1.919.908.132 1.849.202 2.816.202 5.523 0 10-3.463 10-7.51C22 6.463 17.523 3 12 3z" />
  </svg>
);

// 동그란 네이버 아이콘 버튼용 SVG
const NaverCircularIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white" aria-hidden="true">
    <path d="M16.273 12.845 7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727v12.845z" />
  </svg>
);

// 카카오톡 공식 채널 로고 아이콘
const KakaoChannelIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3C6.477 3 2 6.463 2 10.735c0 2.773 1.883 5.206 4.706 6.567-.156.567-.565 2.054-.647 2.375-.103.398.146.392.307.285.126-.084 2.01-1.365 2.818-1.919.908.132 1.849.202 2.816.202 5.523 0 10-3.463 10-7.51C22 6.463 17.523 3 12 3z" />
  </svg>
);

export interface ClaudeAuthPageProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialSection?: 'login' | 'pricing';
  currentUser?: User | null;
  totalRemaining?: number;
  remainingDaysText?: string;
  cloudCommentaryLimit?: number;
  requiredLogin?: boolean;
  promoSettings?: {
    enabled?: boolean;
    name?: string;
    description?: string;
  };
  onLoginSuccess?: () => void;
  onPlanUpdated?: () => void;
  userProfile?: any;
}

export const ClaudeAuthPage: React.FC<ClaudeAuthPageProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialSection = 'login',
  currentUser,
  totalRemaining = 10,
  remainingDaysText = '-',
  cloudCommentaryLimit = 0,
  requiredLogin = false,
  onLoginSuccess,
}) => {
  const landingData = useHomeLandingData('bible');
  const videoRef = useRef<HTMLVideoElement>(null);

  // 최근 로그인 수단
  const [recentProvider, setRecentProvider] = useState<string | null>(() => getRecentLoginProvider());

  // 로그인 로딩 및 에러 상태
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 이메일 로그인/비번재설정 상태 (기능 보존용)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 다른 앱보기 드롭다운 상태
  const [isAppsMenuOpen, setIsAppsMenuOpen] = useState(false);
  const appsMenuRef = useRef<HTMLDivElement>(null);

  // 전자상거래 표준 법적 약관 모달 상태
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [policyModalTab, setPolicyModalTab] = useState<LegalPolicyTab>('terms');

  // FAQ 아코디언 상태
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // 사업자 정보 토글 상태
  const [showBusinessInfo, setShowBusinessInfo] = useState(false);

  // 요금제 탭 및 결제 주기
  const [pricingTab, setPricingTab] = useState<'membership' | 'credit'>('membership');
  const [billingCycle, setBillingCycle] = useState<'yearly' | 'monthly'>('yearly');
  const [cardBillingCycles, setCardBillingCycles] = useState<{
    lite: 'yearly' | 'monthly';
    pro: 'yearly' | 'monthly';
    master: 'yearly' | 'monthly';
  }>({
    lite: 'yearly',
    pro: 'yearly',
    master: 'yearly',
  });

  // 필수 약관 동의 체크박스 상태
  const [isAgreedTerms, setIsAgreedTerms] = useState(false);
  const agreementRef = useRef<HTMLDivElement>(null);

  // 섹션 참조
  const pricingSectionRef = useRef<HTMLDivElement>(null);

  const openPolicy = (tab: LegalPolicyTab = 'terms') => {
    setPolicyModalTab(tab);
    setPolicyModalOpen(true);
  };

  const handleGlobalBillingCycleChange = (cycle: 'yearly' | 'monthly') => {
    setBillingCycle(cycle);
    setCardBillingCycles({
      lite: cycle,
      pro: cycle,
      master: cycle,
    });
  };

  // 다른 앱보기 바깥 클릭 감지
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (appsMenuRef.current && !appsMenuRef.current.contains(e.target as Node)) {
        setIsAppsMenuOpen(false);
      }
    };
    if (isAppsMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isAppsMenuOpen]);

  // 히어로 섹션 참조 및 최상단 네비게이션 고정바 스크롤 감지 (히어로 영상 벗어났을 때만 배경 노출)
  const heroSectionRef = useRef<HTMLElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => {
      if (heroSectionRef.current) {
        const rect = heroSectionRef.current.getBoundingClientRect();
        // 히어로 섹션의 바닥이 헤더 높이(약 65px) 위로 올라가면 배경 활성화
        setIsScrolled(rect.bottom <= 65);
      } else {
        setIsScrolled(window.scrollY > 400);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 영상 자동 재생 보장
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
    setRecentProvider(getRecentLoginProvider());
  }, []);

  // 1. 최상단 히어로 영상 타이핑 애니메이션
  const phrases = landingData.heroPhrases || [
    '다중 역본 대조와 나만의 주석 노트',
    '교회를 돕는 모든 것 네이션스',
  ];
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [displayedSecondLine, setDisplayedSecondLine] = useState('');
  const [isHeroDeleting, setIsHeroDeleting] = useState(false);

  useEffect(() => {
    let timer: any;
    const currentPhrase = phrases[phraseIndex % phrases.length];

    if (!isHeroDeleting) {
      if (displayedSecondLine.length < currentPhrase.length) {
        timer = setTimeout(() => {
          setDisplayedSecondLine(currentPhrase.slice(0, displayedSecondLine.length + 1));
        }, 110);
      } else {
        timer = setTimeout(() => {
          setIsHeroDeleting(true);
        }, 2200);
      }
    } else {
      if (displayedSecondLine.length > 0) {
        timer = setTimeout(() => {
          setDisplayedSecondLine(currentPhrase.slice(0, displayedSecondLine.length - 1));
        }, 55);
      } else {
        timer = setTimeout(() => {
          setPhraseIndex((prev) => (prev + 1) % phrases.length);
          setIsHeroDeleting(false);
        }, 500);
      }
    }

    return () => clearTimeout(timer);
  }, [displayedSecondLine, isHeroDeleting, phraseIndex, phrases]);

  // 2. 목사님의 고민 타이핑 카드 애니메이션
  const fullQuestions =
    landingData.questionText ||
    '흩어져 있던 구절별 주해와 묵상 메모, 다중 역본 대조와 원어 사전까지 하나의 설교 데스크에서 한눈에 관리하고 실시간으로 동기화할 순 없을까요?';
  const [displayedQuestion, setDisplayedQuestion] = useState('');
  const [isQuestionDeleting, setIsQuestionDeleting] = useState(false);

  useEffect(() => {
    let timer: any;
    if (!isQuestionDeleting) {
      if (displayedQuestion.length < fullQuestions.length) {
        timer = setTimeout(() => {
          setDisplayedQuestion(fullQuestions.slice(0, displayedQuestion.length + 1));
        }, 32);
      } else {
        timer = setTimeout(() => {
          setIsQuestionDeleting(true);
        }, 2800);
      }
    } else {
      if (displayedQuestion.length > 0) {
        timer = setTimeout(() => {
          setDisplayedQuestion(fullQuestions.slice(0, displayedQuestion.length - 1));
        }, 14);
      } else {
        timer = setTimeout(() => {
          setIsQuestionDeleting(false);
        }, 450);
      }
    }

    return () => clearTimeout(timer);
  }, [displayedQuestion, isQuestionDeleting, fullQuestions]);

  // 스크롤 이동 헬퍼
  const scrollToLoginCard = () => {
    const el = document.getElementById('bottom-login-card') || document.getElementById('top-login-card');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const scrollToCoreValues = () => {
    const el = document.getElementById('core-features-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // 최상단 영상 타이핑 문구 렌더링 (홈페이지 BibleHeroSection과 100% 동일)
  const renderHeroSecondLine = () => {
    if (phraseIndex === 1) {
      if (displayedSecondLine.length <= 11) {
        return <span>{displayedSecondLine}</span>;
      }
      const normalPart = displayedSecondLine.slice(0, 11);
      const greenPart = displayedSecondLine.slice(12);
      return (
        <>
          <span>{normalPart}</span>
          <span className="inline-block w-2 sm:w-3" />
          <span className="text-[#85f8c4] font-black drop-shadow-[0_2px_16px_rgba(133,248,196,0.5)]">
            {greenPart}
          </span>
        </>
      );
    }
    return <span>{displayedSecondLine}</span>;
  };

  // 구글 로그인 핸들러 (기존 기능 100% 보존)
  const handleGoogleLogin = async () => {
    if (isInAppBrowser()) {
      escapeInAppBrowser();
      setErrorMsg('카카오톡/인앱 브라우저에서는 구글 정책상 로그인이 제한됩니다. 크롬 또는 사파리 외부 브라우저로 이동합니다.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        onSuccess?.();
        onLoginSuccess?.();
        syncUserProfile(result.user).catch((e) => console.warn('[ClaudeAuthPage] syncUserProfile:', e));
      }
    } catch (err: any) {
      console.error('[ClaudeAuthPage] Google login error:', err);
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        setErrorMsg('구글 로그인에 실패했습니다. 다시 시도해주세요.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 이메일 로그인 / 회원가입 핸들러 (기존 기능 보존)
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMsg('이메일과 비밀번호를 모두 입력해주세요.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    try {
      if (isSignUp) {
        if (password.length < 6) {
          setErrorMsg('비밀번호는 최소 6자 이상이어야 합니다.');
          setIsLoading(false);
          return;
        }
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (displayName.trim()) {
          await updateProfile(cred.user, { displayName: displayName.trim() });
        }
        onSuccess?.();
        onLoginSuccess?.();
        syncUserProfile(cred.user).catch((e) => console.warn(e));
      } else {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        onSuccess?.();
        onLoginSuccess?.();
        syncUserProfile(cred.user).catch((e) => console.warn(e));
      }
    } catch (err: any) {
      setErrorMsg(err.message || '인증 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 비밀번호 재설정 핸들러 (기존 기능 보존)
  const handlePasswordReset = async () => {
    if (!email.trim()) {
      setErrorMsg('비밀번호를 재설정할 이메일을 입력해주세요.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSuccessMsg('비밀번호 재설정 링크가 이메일로 발송되었습니다.');
    } catch (err: any) {
      setErrorMsg('비밀번호 재설정 링크 발송에 실패했습니다.');
    }
  };

  // 플랜 결제 핸들러 (기존 기능 100% 완전 보존)
  const handlePlanAction = async (
    targetPlanId: 'free' | 'lite' | 'pro' | 'master' | 'cloud_365' | 'credit_200' | 'credit_500',
    cycleOverride?: 'yearly' | 'monthly' | 'once'
  ) => {
    if (targetPlanId === 'free') {
      onClose();
      return;
    }

    if (!currentUser) {
      alert('해당 플랜을 이용하시려면 먼저 로그인이 필요합니다.\n로그인 화면으로 이동합니다.');
      scrollToLoginCard();
      return;
    }

    // 필수 구매 및 약관 동의 체크
    if (!isAgreedTerms) {
      alert('결제를 진행하시려면 [서비스 이용약관], [개인정보 처리방침], [청약철회 및 환불 규정]에 모두 동의해 주셔야 합니다.');
      agreementRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (targetPlanId === 'cloud_365') {
      const isExistingMember = Boolean(cloudCommentaryLimit && cloudCommentaryLimit > 0);
      if (!isExistingMember) {
        alert(
          '⚠️ 클라우드 365 요금제는 현재 클라우드 멤버십(라이트/프로/마스터)을 이용 중인 회원 전용 상품입니다.\n\n' +
          '※ 미리 결제하셔도 기존 1년 멤버십이 끝나는 시점부터 +1년이 자동 연장됩니다.\n' +
          '현재 유효한 멤버십 회원이 아니시면 적용되지 않으므로, 먼저 클라우드 멤버십 플랜을 구독해 주세요.'
        );
        return;
      }
    }

    const isCreditOrOnce = targetPlanId === 'cloud_365' || targetPlanId === 'credit_200' || targetPlanId === 'credit_500';
    let chosenCycle: 'yearly' | 'monthly' | 'once' = 'once';
    if (!isCreditOrOnce) {
      if (cycleOverride) {
        chosenCycle = cycleOverride;
      } else {
        const cardKey = (targetPlanId === 'lite' || targetPlanId === 'pro' || targetPlanId === 'master') ? targetPlanId : 'pro';
        chosenCycle = cardBillingCycles[cardKey] || billingCycle || 'yearly';
      }
    }

    let planDisplayName = '클라우드 멤버십';
    let amount = 0;
    if (targetPlanId === 'lite') {
      planDisplayName = '클라우드 라이트';
      amount = chosenCycle === 'yearly' ? 39000 : 3900;
    } else if (targetPlanId === 'pro') {
      planDisplayName = '클라우드 프로';
      amount = chosenCycle === 'yearly' ? 59000 : 5900;
    } else if (targetPlanId === 'master') {
      planDisplayName = '클라우드 마스터';
      amount = chosenCycle === 'yearly' ? 99000 : 9900;
    } else if (targetPlanId === 'cloud_365') {
      planDisplayName = '클라우드 365 (1년 연장)';
      amount = 11000;
    } else if (targetPlanId === 'credit_200') {
      planDisplayName = 'AI 크레딧 200';
      amount = 5500;
    } else if (targetPlanId === 'credit_500') {
      planDisplayName = 'AI 크레딧 500';
      amount = 11000;
    }

    const cycleText = isCreditOrOnce ? '단건 결제' : (chosenCycle === 'yearly' ? '연 정기결제' : '월 정기결제');
    const orderId = `ord_bible_${Date.now()}`;

    const isLocal = window.location.hostname.includes('localhost') || window.location.hostname === '127.0.0.1';
    const hubBase = isLocal ? 'http://localhost:5173' : 'https://sermon.thenations.kr';
    const currentOriginUrl = window.location.origin + window.location.pathname;

    sessionStorage.setItem('pending_pay_target_app', 'bible');
    sessionStorage.setItem('pending_pay_plan_id', targetPlanId);
    sessionStorage.setItem('pending_pay_plan_name', planDisplayName);
    sessionStorage.setItem('pending_pay_cycle', chosenCycle);
    sessionStorage.setItem('pending_pay_uid', currentUser.uid);
    sessionStorage.setItem('pending_pay_return_url', currentOriginUrl);

    try {
      if (!isCreditOrOnce) {
        const safeUid = currentUser.uid.replace(/[^a-zA-Z0-9-_]/g, '_');
        const customerKey = `cust_bible_${safeUid}`;

        await requestTossBillingAuth({
          customerKey,
          successUrl: `${hubBase}/payment/success?targetApp=bible&planId=${targetPlanId}&planName=${encodeURIComponent(planDisplayName)}&billingCycle=${chosenCycle}&uid=${encodeURIComponent(currentUser.uid)}&returnUrl=${encodeURIComponent(currentOriginUrl)}`,
          failUrl: `${hubBase}/payment/fail?returnUrl=${encodeURIComponent(currentOriginUrl)}`,
        });
      } else {
        await requestTossPayment({
          method: '카드',
          amount,
          orderId,
          orderName: `[Nations Bible] ${planDisplayName} (${cycleText})`,
          customerName: currentUser.displayName || '성경앱 회원',
          customerEmail: currentUser.email || undefined,
          successUrl: `${hubBase}/payment/success?targetApp=bible&planId=${targetPlanId}&planName=${encodeURIComponent(planDisplayName)}&billingCycle=once&amount=${amount}&uid=${encodeURIComponent(currentUser.uid)}&returnUrl=${encodeURIComponent(currentOriginUrl)}`,
          failUrl: `${hubBase}/payment/fail?returnUrl=${encodeURIComponent(currentOriginUrl)}`,
        });
      }
    } catch (err) {
      console.warn('[ClaudeAuthPage] Toss payment cancelled or error:', err);
    }
  };

  // 재사용 가능한 원형 소셜 로그인 카드 컴포넌트
  const renderLoginCard = (cardId = 'top-login-card') => (
    <div
      id={cardId}
      className="w-full max-w-md mx-auto bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm flex flex-col items-center text-center transition-all"
    >
      {/* 1) 기능없는 글자카드: '무료로 이용하기' */}
      <div className="inline-flex items-center justify-center px-5 py-2 rounded-full bg-[#0F172A] text-white text-[13px] font-bold tracking-tight shadow-xs select-none">
        {landingData.loginCardBadge || '무료로 이용하기'}
      </div>

      {/* 2) 아래로 화살표 */}
      <div className="my-2.5 text-slate-800 flex items-center justify-center animate-bounce">
        <ArrowDown className="w-4.5 h-4.5 stroke-[2.5px]" />
      </div>

      {/* 3) 심플한 검정색 글자: '지금 무료로 시작하기' */}
      <h3 className="text-[16px] sm:text-[17px] font-bold text-[#0F172A] tracking-tight mb-4">
        {landingData.loginCardSubtitle || '지금 무료로 시작하기'}
      </h3>

      {/* 에러 메시지 알림 */}
      {errorMsg && (
        <div className="w-full mb-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs text-left">
          {errorMsg}
        </div>
      )}

      {/* 4) 구글, 카카오톡, 네이버 한 줄 동그란 아이콘 + 텍스트 */}
      <div className="w-full flex items-start justify-center gap-6 sm:gap-8 my-2">
        {/* 구글 */}
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="relative w-12 h-12 rounded-full bg-white border border-slate-200/90 hover:border-slate-300 shadow-sm hover:shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            title="Google로 시작하기"
          >
            <GoogleCircularIcon />
            {recentProvider === 'google' && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-[#0F172A] text-white shadow-xs whitespace-nowrap leading-tight">
                최근로그인
              </span>
            )}
          </button>
          <span className="text-[12px] font-medium text-slate-800">구글</span>
        </div>

        {/* 카카오톡 */}
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={() => startKakaoLogin('bible')}
            disabled={isLoading}
            className="relative w-12 h-12 rounded-full bg-[#FEE500] hover:bg-[#FDD800] shadow-sm hover:shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            title="카카오톡으로 시작하기"
          >
            <KakaoCircularIcon />
            {recentProvider === 'kakao' && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-[#0F172A] text-white shadow-xs whitespace-nowrap leading-tight">
                최근로그인
              </span>
            )}
          </button>
          <span className="text-[12px] font-medium text-slate-800">카카오톡</span>
        </div>

        {/* 네이버 */}
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={() => startNaverLogin('bible')}
            disabled={isLoading}
            className="relative w-12 h-12 rounded-full bg-[#03C75A] hover:bg-[#02B351] shadow-sm hover:shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            title="네이버로 시작하기"
          >
            <NaverCircularIcon />
            {recentProvider === 'naver' && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-[#0F172A] text-white shadow-xs whitespace-nowrap leading-tight">
                최근로그인
              </span>
            )}
          </button>
          <span className="text-[12px] font-medium text-slate-800">네이버</span>
        </div>
      </div>

      {/* 하단 약관 안내 링크 */}
      <p className="mt-4 text-[11px] text-slate-400 leading-relaxed">
        계속 진행하면{' '}
        <button
          type="button"
          onClick={() => openPolicy('privacy')}
          className="text-slate-600 hover:text-black underline cursor-pointer"
        >
          개인정보처리방침
        </button>{' '}
        및{' '}
        <button
          type="button"
          onClick={() => openPolicy('terms')}
          className="text-slate-600 hover:text-black underline cursor-pointer"
        >
          이용약관
        </button>
        에 동의하는 것으로 간주됩니다.
      </p>
    </div>
  );

  const coreCards = landingData.corePoints || [];
  const faqList = landingData.faqs || [];

  if (!isOpen) return null;

  // ─── [요금제 전용 모달 / 화면: 사이드바의 플랜 업그레이드 클릭 시 요금제부터 아래까지 렌더링] ───
  const renderPricingSectionContent = (isStandalonePricing = false) => (
    <div
      ref={pricingSectionRef}
      id="pricing-section-container"
      className={`w-full ${isStandalonePricing ? 'bg-[#FAF9F7]' : 'bg-[#F5F2EB]/50'} border-t border-[#E8E5DE]`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* 요금제 헤더 타이틀 */}
        <div className="text-center max-w-2xl mx-auto mb-8">
          <span className="inline-block px-3 py-1 rounded-full bg-[#FAF0EB] text-[#DA7756] text-xs font-bold mb-2 border border-[#F1D3C6]">
            전자상거래 표준 준수 요금제
          </span>
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#1A1918] mb-3">
            NATIONS BIBLE 요금제 안내
          </h2>

          {/* 내 계정 요약 상태 */}
          {currentUser && (
            <div className="mt-4 max-w-md mx-auto p-3.5 bg-white border border-[#EAE8E1] rounded-2xl flex items-center justify-between text-xs text-left shadow-2xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#EAE8E1] flex items-center justify-center font-bold text-xs text-[#4A4741]">
                  {currentUser.displayName?.[0] || currentUser.email?.[0] || 'U'}
                </div>
                <div>
                  <span className="font-semibold text-[#1C1A18] block truncate max-w-[140px]">
                    {currentUser.displayName || currentUser.email}
                  </span>
                  <span className="text-[11px] text-[#8C877D]">
                    잔여 AI: <strong className="text-[#DA7756]">{totalRemaining}회</strong>
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-[#8C877D] block">유효기간</span>
                <span className="font-semibold text-[#1C1A18] text-[11px]">{remainingDaysText}</span>
              </div>
            </div>
          )}

          {/* 탭 토글: [클라우드 요금제] / [크레딧 충전요금제] */}
          <div className="inline-flex bg-[#EAE6DE] p-1.5 rounded-2xl mt-6">
            <button
              type="button"
              onClick={() => setPricingTab('membership')}
              className={`px-5 sm:px-7 py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer ${
                pricingTab === 'membership'
                  ? 'bg-white text-[#2C2B29] shadow-xs'
                  : 'text-[#6E6A63] hover:text-[#2C2B29]'
              }`}
            >
              클라우드 요금제
            </button>
            <button
              type="button"
              onClick={() => setPricingTab('credit')}
              className={`px-5 sm:px-7 py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer ${
                pricingTab === 'credit'
                  ? 'bg-white text-[#2C2B29] shadow-xs'
                  : 'text-[#6E6A63] hover:text-[#2C2B29]'
              }`}
            >
              크레딧 충전요금제
            </button>
          </div>
        </div>

        {pricingTab === 'membership' ? (
          /* ── 1. 클라우드 멤버십 ── */
          <div className="space-y-6">
            {/* 결제 주기 선택 바 */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-white border border-[#EAE8E1] rounded-2xl mb-4 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-[#DA7756]/15 text-[#DA7756] text-[11px] font-bold">
                  혜택
                </span>
                <span className="text-xs text-[#4A4741] font-medium">
                  연 정기결제 시 최대 약 17% 할인 (월 3,250원 상당)
                </span>
              </div>

              <div className="inline-flex items-center bg-[#EAE6DE] p-1 rounded-xl shrink-0 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => handleGlobalBillingCycleChange('yearly')}
                  className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                    billingCycle === 'yearly'
                      ? 'bg-[#C46A40] text-white shadow-xs'
                      : 'text-[#6E6A63] hover:text-[#2C2B29]'
                  }`}
                >
                  연 정기결제
                </button>
                <button
                  type="button"
                  onClick={() => handleGlobalBillingCycleChange('monthly')}
                  className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                    billingCycle === 'monthly'
                      ? 'bg-[#2C2B29] text-white shadow-xs'
                      : 'text-[#6E6A63] hover:text-[#2C2B29]'
                  }`}
                >
                  월 정기결제
                </button>
              </div>
            </div>

            {/* 4개 플랜 그리드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* 1. Free 플랜 */}
              <div className="bg-white border border-[#E8E5DE] rounded-3xl p-6 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                <div>
                  <Sparkles className="w-7 h-7 text-[#7A756D] mb-3 stroke-[1.8px]" />
                  <h3 className="text-xl font-bold text-[#1A1918]">기본 제공 (Free)</h3>

                  <div className="mb-6 mt-3">
                    <div className="text-3xl font-serif font-bold text-[#1A1918]">₩0</div>
                    <span className="text-[10px] text-[#A39E94] font-medium">(추가 과금 없음)</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePlanAction('free')}
                    className="w-full py-2.5 px-4 bg-[#F5F3ED] hover:bg-[#EAE6DE] text-[#2C2B29] rounded-xl text-xs font-bold transition-all cursor-pointer mb-6"
                  >
                    무료로 이용하기
                  </button>

                  <div className="border-t border-[#EFECE6] pt-4">
                    <span className="text-[11px] font-bold text-[#5A564F] block mb-2.5">제공 혜택:</span>
                    <ul className="text-xs text-[#6E6A63] space-y-2.5">
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                        <span>번역본 비교 검색</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                        <span>나만의 설교노트, 구절 주석 에디터</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                        <span>매월 5 크레딧+설교자료 5종 set 1개</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                        <span>AI 원어주석 무료 체험</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* 2. 클라우드 라이트 */}
              <div className="bg-white border border-[#E8E5DE] rounded-3xl p-6 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                <div>
                  <Database className="w-7 h-7 text-[#7A756D] mb-3 stroke-[1.8px]" />
                  <h3 className="text-xl font-bold text-[#1A1918]">클라우드 라이트</h3>
                  <p className="text-[11px] text-[#7A756D] mt-1 mb-3 leading-relaxed">
                    설교노트와 구절주석 DB서버를 구축하려는 목회자 추천
                  </p>

                  <div className="flex items-center bg-[#EAE6DE] p-1 rounded-xl shrink-0 text-[11px] font-bold mb-4">
                    <button
                      type="button"
                      onClick={() => setCardBillingCycles(prev => ({ ...prev, lite: 'monthly' }))}
                      className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
                        cardBillingCycles.lite === 'monthly'
                          ? 'bg-[#2C2B29] text-white shadow-xs'
                          : 'text-[#6E6A63] hover:text-[#2C2B29]'
                      }`}
                    >
                      월 정기결제
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardBillingCycles(prev => ({ ...prev, lite: 'yearly' }))}
                      className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
                        cardBillingCycles.lite === 'yearly'
                          ? 'bg-[#C46A40] text-white shadow-xs'
                          : 'text-[#6E6A63] hover:text-[#2C2B29]'
                      }`}
                    >
                      연 정기결제
                    </button>
                  </div>

                  <div className="mb-6">
                    {cardBillingCycles.lite === 'yearly' ? (
                      <>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-3xl font-serif font-bold text-[#1A1918]">₩39,000</span>
                          <span className="text-xs text-[#8C877D]">/ 년</span>
                        </div>
                        <p className="text-[10px] text-[#C46A40] font-semibold mt-1">
                          [부가세 포함] • 자동 갱신 상품
                        </p>
                      </>
                    ) : (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-serif font-bold text-[#1A1918]">₩3,900</span>
                        <span className="text-xs text-[#8C877D]">/ 월</span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePlanAction('lite', cardBillingCycles.lite)}
                    className="w-full py-2.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
                  >
                    {cardBillingCycles.lite === 'yearly' ? '라이트 연 정기결제' : '라이트 월 정기결제'}
                  </button>

                  <div className="border-t border-[#EFECE6] pt-4">
                    <span className="text-[11px] font-bold text-[#5A564F] block mb-2.5">주요 혜택:</span>
                    <ul className="text-xs text-[#6E6A63] space-y-2.5">
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>설교노트, 구절주석 모든 기기 무제한 연동</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>AI 250 크레딧 지급 (연납 기준)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>AI 원어주석 500구절 클라우드 보관</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* 3. 클라우드 프로 (추천 플랜) */}
              <div className="bg-[#FFFBF8] border-2 border-[#C46A40] rounded-3xl p-6 flex flex-col justify-between shadow-md relative">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-0.5 rounded-full bg-[#C46A40] text-white text-[11px] font-bold tracking-tight shadow-sm">
                  목회자 추천
                </span>
                <div>
                  <Database className="w-7 h-7 text-[#C46A40] mb-3 stroke-[1.8px]" />
                  <h3 className="text-xl font-bold text-[#1A1918]">클라우드 프로</h3>
                  <p className="text-[11px] text-[#7A756D] mt-1 mb-3 leading-relaxed">
                    나만의 DB와 함께 AI 심층 주석이 필요한 목회자 추천
                  </p>

                  <div className="flex items-center bg-[#EAE6DE] p-1 rounded-xl shrink-0 text-[11px] font-bold mb-4">
                    <button
                      type="button"
                      onClick={() => setCardBillingCycles(prev => ({ ...prev, pro: 'monthly' }))}
                      className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
                        cardBillingCycles.pro === 'monthly'
                          ? 'bg-[#2C2B29] text-white shadow-xs'
                          : 'text-[#6E6A63] hover:text-[#2C2B29]'
                      }`}
                    >
                      월 정기결제
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardBillingCycles(prev => ({ ...prev, pro: 'yearly' }))}
                      className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
                        cardBillingCycles.pro === 'yearly'
                          ? 'bg-[#C46A40] text-white shadow-xs'
                          : 'text-[#6E6A63] hover:text-[#2C2B29]'
                      }`}
                    >
                      연 정기결제
                    </button>
                  </div>

                  <div className="mb-6">
                    {cardBillingCycles.pro === 'yearly' ? (
                      <>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-3xl font-serif font-bold text-[#1A1918]">₩59,000</span>
                          <span className="text-xs text-[#8C877D]">/ 년</span>
                        </div>
                        <p className="text-[10px] text-[#C46A40] font-semibold mt-1">
                          [부가세 포함] • 자동 갱신 상품
                        </p>
                      </>
                    ) : (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-serif font-bold text-[#1A1918]">₩5,900</span>
                        <span className="text-xs text-[#8C877D]">/ 월</span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePlanAction('pro', cardBillingCycles.pro)}
                    className="w-full py-2.5 px-4 bg-[#C46A40] hover:bg-[#B55434] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
                  >
                    {cardBillingCycles.pro === 'yearly' ? '프로 연 정기결제' : '프로 월 정기결제'}
                  </button>

                  <div className="border-t border-[#F1D3C6] pt-4">
                    <span className="text-[11px] font-bold text-[#C46A40] block mb-2.5">주요 혜택:</span>
                    <ul className="text-xs text-[#524F4A] space-y-2.5">
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>라이트 모든 혜택 포함 +</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>AI 원어주석 1,000구절 클라우드 보관</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>AI 500 크레딧 지급 (연납 기준)</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* 4. 클라우드 마스터 */}
              <div className="bg-white border border-[#E8E5DE] rounded-3xl p-6 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                <div>
                  <Database className="w-7 h-7 text-[#2C2B29] mb-3 stroke-[1.8px]" />
                  <h3 className="text-xl font-bold text-[#1A1918]">클라우드 마스터</h3>
                  <p className="text-[11px] text-[#7A756D] mt-1 mb-3 leading-relaxed">
                    성경 66권 전체 AI 주석 서재를 완성하려는 목사님 추천
                  </p>

                  <div className="flex items-center bg-[#EAE6DE] p-1 rounded-xl shrink-0 text-[11px] font-bold mb-4">
                    <button
                      type="button"
                      onClick={() => setCardBillingCycles(prev => ({ ...prev, master: 'monthly' }))}
                      className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
                        cardBillingCycles.master === 'monthly'
                          ? 'bg-[#2C2B29] text-white shadow-xs'
                          : 'text-[#6E6A63] hover:text-[#2C2B29]'
                      }`}
                    >
                      월 정기결제
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardBillingCycles(prev => ({ ...prev, master: 'yearly' }))}
                      className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
                        cardBillingCycles.master === 'yearly'
                          ? 'bg-[#C46A40] text-white shadow-xs'
                          : 'text-[#6E6A63] hover:text-[#2C2B29]'
                      }`}
                    >
                      연 정기결제
                    </button>
                  </div>

                  <div className="mb-6">
                    {cardBillingCycles.master === 'yearly' ? (
                      <>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-3xl font-serif font-bold text-[#2C2B29]">₩99,000</span>
                          <span className="text-xs text-[#8C877D]">/ 년</span>
                        </div>
                        <p className="text-[10px] text-[#C46A40] font-semibold mt-1">
                          [부가세 포함] • 자동 갱신 상품
                        </p>
                      </>
                    ) : (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-serif font-bold text-[#2C2B29]">₩9,900</span>
                        <span className="text-xs text-[#8C877D]">/ 월</span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePlanAction('master', cardBillingCycles.master)}
                    className="w-full py-2.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
                  >
                    {cardBillingCycles.master === 'yearly' ? '마스터 연 정기결제' : '마스터 월 정기결제'}
                  </button>

                  <div className="border-t border-[#EFECE6] pt-4">
                    <span className="text-[11px] font-bold text-[#5A564F] block mb-2.5">주요 혜택:</span>
                    <ul className="text-xs text-[#6E6A63] space-y-2.5">
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#2C2B29] shrink-0 mt-0.5" />
                        <span>프로 모든 혜택 포함 +</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#2C2B29] shrink-0 mt-0.5" />
                        <span>AI 주석 성경 66권 모든 구절 무제한 보관</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#2C2B29] shrink-0 mt-0.5" />
                        <span>AI 1,000 크레딧 지급 (유효기간 2년)</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* 클라우드 365 1년 연장권 */}
            <div className="p-5 sm:p-6 bg-gradient-to-r from-[#FAF9F5] via-white to-[#FAF0EB] border-2 border-[#C46A40]/40 rounded-3xl shadow-sm max-w-4xl mx-auto mt-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5 text-left">
                  <div className="w-11 h-11 rounded-2xl bg-[#FAF0EB] text-[#C46A40] flex items-center justify-center border border-[#F1D3C6] shrink-0">
                    <CreditCard className="w-6 h-6 stroke-[2px]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm sm:text-base font-bold text-[#1A1918]">
                        클라우드 365 (1년 연장권)
                      </h4>
                      <span className="px-2 py-0.5 bg-[#2C2B29] text-white rounded-md text-[10px] font-bold">
                        단회성 결제
                      </span>
                      <span className="px-2 py-0.5 bg-[#FAF0EB] text-[#C46A40] border border-[#F1D3C6] rounded-md text-[10px] font-bold">
                        클라우드 멤버십 회원 전용
                      </span>
                    </div>
                    <p className="text-xs text-[#6E6A63] mt-1.5 leading-relaxed">
                      2년 차부터 적용되는 서버 유지 및 보관 연장권 (월 900원 상당) · 기존 데이터 1년 연장
                    </p>
                    <p className="text-[11px] font-semibold text-[#1A1918] mt-1">
                      🎁 갱신 감사 혜택: AI 200 크레딧 즉시 지급 (유효기간 1년)
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 w-full sm:w-auto shrink-0">
                  <div className="text-right">
                    <div className="text-xl sm:text-2xl font-serif font-bold text-[#C46A40]">₩11,000</div>
                    <span className="text-[10px] text-[#8C877D]">단회 결제</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePlanAction('cloud_365', 'once')}
                    className="w-full sm:w-auto px-5 py-2.5 bg-[#C46A40] hover:bg-[#B55434] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                  >
                    1년 연장하기
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ── 2. 크레딧 충전요금제 ── */
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="p-3.5 bg-white border border-[#E8E5DE] rounded-2xl text-center text-xs text-[#6E6A63]">
              (클라우드 요금제 멤버십 회원 전용 충전 상품입니다)
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* 크레딧 200 */}
              <div className="bg-white border border-[#E8E5DE] rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                <div>
                  <Sparkles className="w-7 h-7 text-[#C46A40] mb-3 stroke-[1.8px]" />
                  <h3 className="text-xl font-bold text-[#1A1918]">크레딧 200</h3>
                  <p className="text-xs text-[#7A756D] mt-1 mb-4">구절 및 단어 연구가 추가로 필요할 때</p>

                  <div className="mb-6">
                    <div className="text-3xl font-serif font-bold text-[#C46A40]">₩5,500</div>
                    <span className="text-[10px] text-[#DA7756] font-semibold">[부가세 포함] • 단건 결제</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePlanAction('credit_200', 'once')}
                    className="w-full py-2.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
                  >
                    충전하기
                  </button>

                  <div className="border-t border-[#EFECE6] pt-4">
                    <span className="text-[11px] font-bold text-[#5A564F] block mb-2.5">포함된 혜택:</span>
                    <ul className="text-xs text-[#6E6A63] space-y-2">
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>200 크레딧 즉시 충전 (유효기간 365일)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>AI 원어주석 200회 or 설교자료 10개</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* 크레딧 500 */}
              <div className="bg-[#FFFBF8] border-2 border-[#C46A40] rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-md relative">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-0.5 rounded-full bg-[#C46A40] text-white text-[11px] font-bold tracking-tight shadow-sm">
                  인기 충전
                </span>
                <div>
                  <Sparkles className="w-7 h-7 text-[#C46A40] mb-3 stroke-[1.8px]" />
                  <h3 className="text-xl font-bold text-[#1A1918]">크레딧 500</h3>
                  <p className="text-xs text-[#7A756D] mt-1 mb-4">지속적인 설교 준비와 연구를 위한 플랜</p>

                  <div className="mb-6">
                    <div className="text-3xl font-serif font-bold text-[#C46A40]">₩11,000</div>
                    <span className="text-[10px] text-[#DA7756] font-semibold">[부가세 포함] • 단건 결제</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePlanAction('credit_500', 'once')}
                    className="w-full py-2.5 px-4 bg-[#C46A40] hover:bg-[#B55434] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
                  >
                    충전하기
                  </button>

                  <div className="border-t border-[#F1D3C6] pt-4">
                    <span className="text-[11px] font-bold text-[#C46A40] block mb-2.5">포함된 혜택:</span>
                    <ul className="text-xs text-[#524F4A] space-y-2">
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>500 크레딧 즉시 충전 (유효기간 365일)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>AI 원어주석 500회 or 설교자료 25개</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 전자상거래법 및 PG사 심사용 필수 약관 동의 체크박스 */}
        <div
          ref={agreementRef}
          className="mt-8 bg-white border-2 border-[#EAE8E1] rounded-2xl p-5 shadow-xs transition-colors max-w-4xl mx-auto"
        >
          <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-3">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAgreedTerms}
                onChange={(e) => setIsAgreedTerms(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-[#DA7756] focus:ring-[#DA7756] cursor-pointer"
              />
              <span className="text-xs sm:text-sm font-bold text-[#1C1A18]">
                <strong className="text-[#DA7756]">[필수]</strong> 결제 진행을 위한 필수 이용약관 및 환불 규정에 동의합니다.
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-2 pl-8 sm:pl-0 text-xs">
              <button
                type="button"
                onClick={() => openPolicy('terms')}
                className="text-[#66625B] hover:text-[#1C1A18] underline font-medium cursor-pointer"
              >
                [이용약관]
              </button>
              <button
                type="button"
                onClick={() => openPolicy('privacy')}
                className="text-[#66625B] hover:text-[#1C1A18] underline font-medium cursor-pointer"
              >
                [개인정보처리방침]
              </button>
              <button
                type="button"
                onClick={() => openPolicy('refund')}
                className="text-[#DA7756] hover:underline font-bold cursor-pointer"
              >
                [청약철회/환불규정]
              </button>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-[#F0ECE4] text-[11px] text-[#7D786F] space-y-1">
            <p className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#DA7756] shrink-0" />
              <span><strong>청약철회 권리:</strong> 결제 후 7일 이내 서비스를 이용하지 아니한 경우 전액 환불이 보장됩니다.</span>
            </p>
            <p className="flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-[#8C877D] shrink-0" />
              <span><strong>이용 개시 시 제한:</strong> 디지털 콘텐츠 특성상 AI 주석 생성 또는 크레딧 사용 즉시 청약철회가 제한됩니다. (전자상거래법 제17조)</span>
            </p>
          </div>
        </div>

        {/* 데이터 보존 및 이용 고지 카드 */}
        <div className="mt-6 p-6 bg-white border border-[#E8E5DE] rounded-3xl shadow-2xs max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-3 text-[#2C2B29]">
            <Shield className="w-4 h-4 text-[#C46A40]" />
            <h4 className="font-bold text-xs sm:text-sm">주석 클라우드 이용권 안내 및 데이터 보존 고지</h4>
          </div>
          <ul className="text-xs text-[#6E6A63] leading-relaxed space-y-2 list-disc pl-4">
            <li>유료 멤버십이 유지되는 동안 추가 유지 비용 없이 지속적으로 이용하실 수 있습니다.</li>
            <li>유료 멤버십 회원은 동일한 로그인 계정을 사용하는 스마트폰, 태블릿, PC 어디서든 개인의 모든 자료와 보관된 주석을 크레딧 차감 없이 열람하실 수 있습니다.</li>
            <li>증정된 크레딧은 충전일로부터 365일간 유효하며, 필요시 크레딧을 추가 충전하여 계속 연구하실 수 있습니다.</li>
            <li>서비스 종료 등 불가피한 사유 발생 시 최소 60일 전 사전 공지되며, 회원님의 데이터를 파일(PDF/텍스트)로 영구 소장하실 수 있도록 일괄 백업 기능을 제공합니다.</li>
          </ul>
        </div>

        {/* ── [요금제 아래 구성 요소 일치]: 자주 묻는 질문 (FAQ) ── */}
        <div className="mt-14 pt-10 border-t border-[#EAE8E1] max-w-4xl mx-auto">
          <h3 className="text-xl sm:text-2xl font-bold text-center text-[#1C1A18] mb-6 font-serif">
            자주 묻는 질문 (FAQ)
          </h3>
          <div className="space-y-3">
            {faqList.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className="bg-white border border-[#EAE8E1] rounded-xl overflow-hidden transition-all"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 cursor-pointer hover:bg-[#FAF9F7] transition-colors"
                  >
                    <span className="text-xs sm:text-sm font-bold text-[#1C1A18]">
                      <span className="text-[#DA7756] mr-1.5 font-bold">Q.</span>
                      {faq.q}
                    </span>
                    <span className="text-[#8C877D] shrink-0">
                      {isOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-4 pt-1 text-xs text-[#5C5850] leading-relaxed border-t border-[#F5F2EB] bg-[#FAF9F7] whitespace-pre-line animate-fadeIn">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── [요금제 아래 구성 요소 일치]: 1:1 카카오톡 상담 배너 ── */}
        <div className="mt-12 bg-white rounded-2xl p-6 sm:p-8 border border-[#EAE8E1] text-center flex flex-col items-center gap-4 shadow-2xs max-w-4xl mx-auto">
          <div className="flex flex-col gap-1.5">
            <h4 className="text-[17px] sm:text-[19px] font-bold text-[#1C1A18] tracking-tight">
              어디서부터 시작해야 할지 막막하신가요?
            </h4>
            <p className="text-xs text-[#66625B]">
              목회와 말씀 연구 환경에 맞춘 솔루션을 1:1로 제안해 드립니다.
            </p>
          </div>
          <a
            href="http://pf.kakao.com/_cxjBxaX/chat"
            target="_blank"
            rel="noopener noreferrer"
            className="py-3 px-6 bg-[#FEE500] hover:bg-[#FDD800] text-[#371D1E] rounded-xl text-xs sm:text-sm font-bold shadow-xs flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <KakaoChannelIcon className="w-4.5 h-4.5" />
            <span>1:1 카카오톡 상담 바로가기</span>
          </a>
        </div>

        {/* ── [요금제 아래 구성 요소 일치]: 4열 디렉토리 ── */}
        <div className="mt-14 pt-8 border-t border-[#EAE8E1] max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-1.5 pb-4 border-b border-[#EAE8E1]">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[17px] text-[#1C1A18]">cloud</span>
              <h4 className="text-sm font-bold text-[#1C1A18]">
                간편한 스마트 목회 환경을 추구합니다.
              </h4>
            </div>
            <p className="text-[11px] text-[#7D786F]">
              복잡한 설치 없이 웹과 모바일 앱이 어디서나 유기적으로 연동됩니다.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-xs pt-5 text-[#66625B]">
            <div className="space-y-2">
              <h5 className="font-bold text-[#1C1A18]">제품 (Products)</h5>
              <ul className="space-y-1.5 text-[11px]">
                <li><a href="https://bible.thenations.kr" className="hover:text-black font-semibold text-[#1C1A18]">BIBLE AI (성경)</a></li>
                <li><a href="https://sermon.thenations.kr" target="_blank" rel="noopener noreferrer" className="hover:text-black">SERMON VIDEO</a></li>
                <li><a href="https://vote.thenations.kr" target="_blank" rel="noopener noreferrer" className="hover:text-black">NATIONS VOTE</a></li>
                <li><a href="https://studio.thenations.kr" target="_blank" rel="noopener noreferrer" className="hover:text-black">NATIONS STUDIO</a></li>
                <li><a href="https://thenations.kr" target="_blank" rel="noopener noreferrer" className="hover:text-black">CHURCH ERP</a></li>
              </ul>
            </div>

            <div className="space-y-2">
              <h5 className="font-bold text-[#1C1A18]">요금안내</h5>
              <ul className="space-y-1.5 text-[11px]">
                <li>가입 후: 평생 무료 서비스</li>
                <li>유료요금: 멤버십 & 충전</li>
                <li>연간결제: 17% 할인</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h5 className="font-bold text-[#1C1A18]">고객지원센터</h5>
              <ul className="space-y-1.5 text-[11px]">
                <li>
                  <a href="http://pf.kakao.com/_cxjBxaX/chat" target="_blank" rel="noopener noreferrer" className="hover:text-black">
                    1:1 카톡 문의하기
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setShowBusinessInfo(!showBusinessInfo)}
                    className="hover:text-black cursor-pointer text-left"
                  >
                    사업자 정보 확인 {showBusinessInfo ? '▲' : '▼'}
                  </button>
                  {showBusinessInfo && (
                    <div className="mt-1.5 p-2 bg-white border border-[#EAE8E1] rounded-lg text-[10px] text-[#4A4741] leading-relaxed">
                      <p className="font-bold text-[#1C1A18]">더네이션스 솔루션</p>
                      <p>대표자: 유문식</p>
                      <p>사업자등록번호: 712-14-02380</p>
                    </div>
                  )}
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <h5 className="font-bold text-[#1C1A18]">법률 및 정책</h5>
              <ul className="space-y-1.5 text-[11px]">
                <li>
                  <button type="button" onClick={() => openPolicy('terms')} className="hover:text-black cursor-pointer text-left">
                    서비스 이용약관
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => openPolicy('privacy')} className="hover:text-black cursor-pointer text-left">
                    개인정보 처리방침
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => openPolicy('refund')} className="hover:text-black cursor-pointer text-left">
                    청약철회 및 환불규정
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* 최하단 법적 카피라이트 */}
        <div className="mt-12 pt-6 border-t border-[#EAE8E1] text-center text-[11px] text-[#A39E94]">
          <p>© 2026 NATIONS BIBLE. All rights reserved.</p>
        </div>
      </div>
    </div>
  );

  // ─── [경우 A: 사이드바 '플랜 업그레이드' 클릭 시 모달 또는 독립 화면으로 요금제 전용 렌더링] ───
  if (initialSection === 'pricing') {
    return (
      <div
        className="fixed inset-0 z-[100] overflow-y-auto bg-black/60 backdrop-blur-xs flex items-start justify-center p-0 sm:p-4 py-0 sm:py-6"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div
          className="w-full max-w-5xl rounded-none sm:rounded-3xl overflow-hidden shadow-2xl bg-white min-h-screen sm:min-h-0 relative animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 모달 상단 닫기 X 버튼 */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-50 w-9 h-9 rounded-xl flex items-center justify-center text-[#8C877D] hover:text-[#1C1A18] hover:bg-[#F3EFE9] transition-colors cursor-pointer bg-white/80 backdrop-blur-xs shadow-xs"
            title="닫기"
          >
            <X className="w-5 h-5" />
          </button>

          {renderPricingSectionContent(true)}

          {/* 전자상거래 표준 법적 약관 모달 */}
          <LegalPolicyModal
            isOpen={policyModalOpen}
            initialTab={policyModalTab}
            onClose={() => setPolicyModalOpen(false)}
          />
        </div>
      </div>
    );
  }

  // ─── [경우 B: 최초 접속화면 (!isAuthenticated) ➔ 히어로 영상부터 아래까지 일치된 전체 랜딩 렌더링] ───
  return (
    <div className="min-h-screen bg-[#F8F9FD] text-[#0F172A] font-sans selection:bg-slate-900 selection:text-white">
      {/* ── 최상단 고정 헤더 (로고 & 다른 앱보기 고정) ── */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-black/75 backdrop-blur-md py-3 shadow-lg'
            : 'bg-transparent py-4 sm:py-6'
        }`}
      >
        <div className="w-full px-4 sm:px-10 md:px-14 flex items-center justify-between">
          {/* Top-Left Logo & English Title (네이션스 바이블) */}
          <div
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-2.5 sm:gap-3 select-none cursor-pointer group"
          >
            <img
              src="/nations-symbol-clean.png"
              alt="NATIONS Logo"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
              className="h-8 sm:h-9.5 w-auto object-contain drop-shadow-md transition-transform duration-200 group-hover:scale-105"
            />
            <div className="flex flex-col text-left leading-tight">
              <span className="font-sans font-bold text-[11px] sm:text-[12.5px] text-white/80 tracking-widest uppercase">
                NATIONS
              </span>
              <span className="font-sans font-extrabold text-[15.5px] sm:text-[18px] text-white tracking-tight drop-shadow-md">
                BIBLE
              </span>
            </div>
          </div>

          {/* Top-Right: '다른 앱보기' 글자만 있는 버튼 및 드롭다운 */}
          <div ref={appsMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsAppsMenuOpen(!isAppsMenuOpen)}
              className="text-white/85 hover:text-white text-[13px] sm:text-[14px] font-medium tracking-tight flex items-center gap-1 cursor-pointer transition-colors py-1 select-none drop-shadow-md group"
              title="다른 앱보기"
            >
              <span>다른 앱보기</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  isAppsMenuOpen ? 'rotate-180 text-white' : 'text-white/70 group-hover:text-white'
                }`}
              />
            </button>

            {/* 앱 드롭다운 목록 (뒤가 비치는 검은색 투명바탕, 테두리 선 없음, 컴팩트한 폭) */}
            {isAppsMenuOpen && (
              <div className="absolute right-0 mt-2 w-max min-w-[175px] max-w-[200px] bg-black/60 backdrop-blur-md rounded-2xl p-1.5 z-50 text-left shadow-2xl animate-fadeIn border border-white/10">
                <div className="flex flex-col gap-0.5">
                  {/* 1. NATIONS STUDIO */}
                  <a
                    href="https://studio.thenations.kr/"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setIsAppsMenuOpen(false)}
                    className="px-3 py-2 rounded-xl hover:bg-white/15 transition-colors flex flex-col cursor-pointer group"
                  >
                    <span className="text-[13px] sm:text-[13.5px] font-bold text-white group-hover:text-white leading-tight">
                      NATIONS STUDIO
                    </span>
                    <span className="text-[11px] text-white/80 mt-0.5 font-normal leading-tight">
                      찬양인도자를 위한 악보앱
                    </span>
                  </a>

                  {/* 2. NATIONS VIDEO */}
                  <a
                    href="https://sermon.thenations.kr/"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setIsAppsMenuOpen(false)}
                    className="px-3 py-2 rounded-xl hover:bg-white/15 transition-colors flex flex-col cursor-pointer group"
                  >
                    <span className="text-[13px] sm:text-[13.5px] font-bold text-white group-hover:text-white leading-tight">
                      NATIONS VIDEO
                    </span>
                    <span className="text-[11px] text-white/80 mt-0.5 font-normal leading-tight">
                      목사님의 설교를 숏폼으로 제작
                    </span>
                  </a>

                  {/* 3. NATIONS VOTE */}
                  <a
                    href="https://vote.thenations.kr/"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setIsAppsMenuOpen(false)}
                    className="px-3 py-2 rounded-xl hover:bg-white/15 transition-colors flex flex-col cursor-pointer group"
                  >
                    <span className="text-[13px] sm:text-[13.5px] font-bold text-white group-hover:text-white leading-tight">
                      NATIONS VOTE
                    </span>
                    <span className="text-[11px] text-white/80 mt-0.5 font-normal leading-tight">
                      교회선거를 위한 스마트 투표앱
                    </span>
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── 1. 최상단: 홈페이지 히어로 영상 + 문구 (상단줄 메뉴 삭제) ── */}
      <section
        ref={heroSectionRef}
        className="relative w-full h-[68vh] min-h-[490px] max-h-[700px] sm:h-auto sm:min-h-0 sm:max-h-[85vh] sm:aspect-video overflow-hidden bg-black flex items-center justify-start select-none"
      >
        {/* Background Hero Video */}
        <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <video
            ref={videoRef}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover object-center opacity-85 sm:opacity-90"
            src={landingData.heroVideoUrl || '/hero-video.mp4'}
          >
            <source src={landingData.heroVideoUrl || '/hero-video.mp4'} type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent z-10" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent z-10" />
        </div>

        {/* Overlaid Catchphrase ONLY */}
        <div className="relative z-20 w-full max-w-6xl mx-auto px-5 sm:px-12 md:px-16 flex flex-col justify-center pt-16 sm:pt-20">
          <div className="w-full max-w-4xl text-left">
            <h1 className="tracking-tight drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]">
              <span className="block text-[14px] min-[390px]:text-[15.5px] min-[430px]:text-[17px] sm:text-[19px] md:text-[23px] lg:text-[26px] font-medium text-white/90 mb-1 sm:mb-2">
                {landingData.heroTopText || '묵상과 성경연구에만 집중하세요'}
              </span>
              <span className="inline-flex flex-wrap items-center text-[22px] min-[390px]:text-[24px] min-[430px]:text-[26px] sm:text-[30px] md:text-[38px] lg:text-[44px] font-bold text-white leading-tight break-keep-all">
                {renderHeroSecondLine()}
                <span className="inline-block w-[3px] sm:w-[4px] h-[0.85em] bg-white ml-2 align-middle animate-pulse shrink-0" />
              </span>
            </h1>
          </div>
        </div>
      </section>

      {/* ── 2. 목사님의 고민 타이핑 카드 ── */}
      <section className="w-full bg-[#F8F9FD] pt-12 pb-10 sm:pt-16 sm:pb-12 px-3 sm:px-6 flex flex-col items-center text-center">
        <div className="max-w-5xl lg:max-w-6xl mx-auto w-full flex flex-col items-center gap-5 sm:gap-6">
          <h2 className="text-[#0F172A] font-bold text-[18px] min-[360px]:text-[19.5px] min-[400px]:text-[21px] sm:text-[25px] md:text-[28px] tracking-tight leading-snug break-keep-all text-center px-2">
            <span>{landingData.questionHeading || '설교준비와 말씀 연구로 분주한 설교자의 고민'}</span>
          </h2>

          <div className="w-full max-w-4xl lg:max-w-5xl p-2 min-[360px]:p-2.5 sm:p-3.5 md:p-4 rounded-[26px] min-[360px]:rounded-[30px] sm:rounded-[40px] md:rounded-[44px] bg-slate-100/80 border border-slate-200/80 shadow-[0_10px_35px_-10px_rgba(15,23,42,0.04)]">
            <div className="w-full bg-white rounded-[22px] min-[360px]:rounded-[26px] sm:rounded-[32px] md:rounded-[36px] p-2 min-[360px]:p-2.5 sm:p-3.5 md:p-4 shadow-sm border border-slate-200/60">
              <div className="relative w-full bg-[#FAFBFD] hover:bg-white rounded-[18px] min-[360px]:rounded-[20px] sm:rounded-[26px] md:rounded-[28px] border border-slate-200/90 hover:border-slate-300 transition-colors duration-200 p-3.5 min-[360px]:p-4 min-[400px]:p-5 sm:p-7 md:p-8 h-[195px] min-[360px]:h-[205px] min-[400px]:h-[215px] sm:h-[240px] md:h-[255px] flex flex-col justify-between text-left overflow-hidden">
                <div className="w-full">
                  <p className="text-[11.2px] min-[360px]:text-[12px] min-[390px]:text-[12.6px] min-[430px]:text-[13.5px] sm:text-[16px] md:text-[17px] text-slate-800 leading-[1.52] min-[360px]:leading-[1.58] sm:leading-[1.78] font-normal tracking-tight break-keep-all whitespace-pre-wrap select-text">
                    <span>{displayedQuestion}</span>
                    <span className="inline-block w-[1.75px] min-[360px]:w-[2px] sm:w-[2.25px] h-[1.22em] bg-[#7C3AED] ml-0.5 sm:ml-1 align-middle animate-pulse shrink-0" />
                  </p>
                </div>

                <div className="w-full pt-1 sm:pt-2 flex items-center justify-between gap-2 mt-auto">
                  <span className="text-slate-400 text-[20px] sm:text-[22px] font-light leading-none select-none pl-1">
                    +
                  </span>
                  <button
                    type="button"
                    onClick={scrollToCoreValues}
                    aria-label="핵심 기능으로 이동"
                    className="w-7 h-7 min-[360px]:w-7.5 min-[360px]:h-7.5 sm:w-8.5 sm:h-8.5 rounded-full bg-[#0F172A] hover:bg-[#1E293B] text-white flex items-center justify-center shadow-sm hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer shrink-0"
                  >
                    <ArrowRight className="w-4 h-4 stroke-[2.2px]" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. 상단 로그인 카드: 말씀 연구의 깊이를 더하다 + 무료로 이용하기 카드 ── */}
      <section className="w-full bg-[#F8F9FD] pb-16 sm:pb-24 px-4 sm:px-6 flex flex-col items-center text-center">
        <div className="max-w-2xl mx-auto mb-6 sm:mb-8 flex flex-col items-center">
          <h2 className="text-[20px] sm:text-[25px] md:text-[28px] font-bold text-[#0F172A] leading-snug break-keep-all">
            <span>{landingData.mainHeadingLine1 || '말씀 연구의 깊이를 더하다'}</span>
            <br />
            <span>{landingData.mainHeadingLine2 || '네이션스 Bible AI'}</span>
          </h2>
        </div>
        {renderLoginCard('top-login-card')}
      </section>

      {/* ── 4. 핵심기능 카드들 3개 배치 (Core Values - 홈페이지 BibleCoreValuesSection과 100% 일치) ── */}
      <section
        id="core-features-section"
        className="w-full bg-[#F8F9FD] py-16 sm:py-24 border-y border-slate-200/80"
      >
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-8 sm:gap-12">
          {/* Section Header */}
          <div className="flex flex-col text-center items-center gap-1.5 max-w-3xl mx-auto mb-2 sm:mb-4">
            <h2 className="text-[19px] sm:text-[23px] md:text-[27px] font-bold text-[#0F172A] tracking-tight leading-tight break-keep-all">
              {landingData.subHeadingLine1 || '설교준비 어디서든 가능합니다.'}
            </h2>
            <p className="text-[13px] sm:text-[14.5px] text-slate-500 font-normal break-keep-all">
              {landingData.subHeadingLine2 || '나만의 주석책을 만들어요'}
            </p>

            {/* 무료로 앱 이용하기 버튼 */}
            <div className="pt-3 sm:pt-4">
              <button
                type="button"
                onClick={scrollToLoginCard}
                className="inline-flex items-center gap-2 px-5 py-2.5 sm:px-6 sm:py-3 rounded-full bg-[#0F172A] hover:bg-black text-white text-[13.5px] sm:text-[14.5px] font-semibold shadow-md hover:shadow-lg transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                <span>무료로 앱 이용하기</span>
                <ArrowRight className="w-4 h-4 stroke-[2.2px]" />
              </button>
            </div>
          </div>

          {/* 3 Core Points List - Alternating 2-Column Showcase */}
          <div className="flex flex-col gap-6 sm:gap-8">
            {/* Row 1: 가볍고 쉬운 나만의 설교 데스크 */}
            <div className="w-full bg-white rounded-[28px] sm:rounded-[36px] p-6 sm:p-10 lg:p-12 border border-slate-200/80 shadow-sm grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              <div className="lg:col-span-6 flex flex-col justify-center">
                <h3 className="text-[17px] sm:text-[20px] md:text-[23px] font-bold text-[#0F172A] leading-[1.3] tracking-tight break-keep-all">
                  {coreCards[0]?.title || '가볍고 쉬운 나만의 설교 데스크'}
                </h3>
                <p className="text-[13px] sm:text-[14px] text-slate-600 leading-relaxed mt-3.5 break-keep-all max-w-lg">
                  {coreCards[0]?.desc || '복잡하고 무거운 성경 소프트웨어 대신, 말씀 묵상과 설교 원고 작성에만 온전히 집중할 수 있는 설교 워크스페이스를 제공합니다. 태블릿과 노트북, 데스크탑 어디서나 1초 만에 즉시 접속가능합니다.'}
                </p>
              </div>

              <div className="lg:col-span-6 w-full flex items-center justify-center">
                <div className="w-full rounded-[24px] sm:rounded-[30px] p-3 sm:p-5 bg-gradient-to-br from-[#EAE6F5] via-[#E4E8F7] to-[#D5DCF5] border border-slate-200/60 shadow-inner flex items-center justify-center transition-all duration-300">
                  <div className="w-full max-w-[500px] h-[250px] sm:h-[290px] lg:h-[320px] rounded-2xl flex items-center justify-center relative overflow-hidden select-none">
                    {coreCards[0]?.image ? (
                      <img
                        src={coreCards[0].image}
                        alt="설교자를 위한 맞춤 설교데스크"
                        className="w-full h-full object-contain drop-shadow-md rounded-xl transition-transform duration-300 hover:scale-102"
                      />
                    ) : (
                      <div className="w-full h-full rounded-2xl border-2 border-dashed border-slate-400/30 flex flex-col items-center justify-center text-slate-400/70 gap-2 p-4">
                        <span className="material-symbols-outlined text-3xl opacity-35">
                          add_photo_alternate
                        </span>
                        <span className="text-[12px] font-medium text-slate-500/70 tracking-tight">
                          이미지 등록 대기 중
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Row 2: 역본 동시 대조 & AI 원어 주석 (Alternating) */}
            <div className="w-full bg-white rounded-[28px] sm:rounded-[36px] p-6 sm:p-10 lg:p-12 border border-slate-200/80 shadow-sm grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              <div className="order-last lg:order-first lg:col-span-6 w-full flex items-center justify-center">
                <div className="w-full rounded-[24px] sm:rounded-[30px] p-3 sm:p-5 bg-gradient-to-br from-[#E3F5EC] via-[#E8F3EE] to-[#D6EBE0] border border-slate-200/60 shadow-inner flex items-center justify-center transition-all duration-300">
                  <div className="w-full max-w-[500px] h-[250px] sm:h-[290px] lg:h-[320px] rounded-2xl flex items-center justify-center relative overflow-hidden select-none">
                    {coreCards[1]?.image ? (
                      <img
                        src={coreCards[1].image}
                        alt="다중 역본 동시 대조 및 원어 사전"
                        className="w-full h-full object-contain drop-shadow-md rounded-xl transition-transform duration-300 hover:scale-102"
                      />
                    ) : (
                      <div className="w-full h-full rounded-2xl border-2 border-dashed border-slate-400/30 flex flex-col items-center justify-center text-slate-400/70 gap-2 p-4">
                        <span className="material-symbols-outlined text-3xl opacity-35">
                          add_photo_alternate
                        </span>
                        <span className="text-[12px] font-medium text-slate-500/70 tracking-tight">
                          이미지 등록 대기 중
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="order-first lg:order-last lg:col-span-6 flex flex-col justify-center">
                <h3 className="text-[17px] sm:text-[20px] md:text-[23px] font-bold text-[#0F172A] leading-[1.3] tracking-tight break-keep-all">
                  {coreCards[1]?.title || '역본 동시 대조 & AI 원어 주석'}
                </h3>
                <p className="text-[13px] sm:text-[14px] text-slate-600 leading-relaxed mt-3.5 break-keep-all max-w-lg">
                  {coreCards[1]?.desc || '여러 번역본을 멀티뷰로 대조하고, AI 원어 주석 으로 단어 하나하나에 담긴 원문 시제와 깊은 의미를 바로 확인하세요.'}
                </p>
              </div>
            </div>

            {/* Row 3: 흩어진 자료를 통합하여 나만의 주석책 */}
            <div className="w-full bg-white rounded-[28px] sm:rounded-[36px] p-6 sm:p-10 lg:p-12 border border-slate-200/80 shadow-sm grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              <div className="lg:col-span-6 flex flex-col justify-center">
                <h3 className="text-[17px] sm:text-[20px] md:text-[23px] font-bold text-[#0F172A] leading-[1.3] tracking-tight break-keep-all">
                  {coreCards[2]?.title || '흩어진 자료를 통합하여 나만의 주석책'}
                </h3>
                <p className="text-[13px] sm:text-[14px] text-slate-600 leading-relaxed mt-3.5 break-keep-all max-w-lg">
                  {coreCards[2]?.desc || '오랜기간 설교를 하다보면, 모든 자료가 흩어집니다. 한번 참고한 자료를 다시 참고해야하는 번거로움 없이 성경구절마다 나만의 주석, 노트, 관주, 설교를 보관할수 있습니다. 수년 전의 은혜의 메시지도 성경 구절 검색 한 번으로 즉시 되살아납니다.'}
                </p>
              </div>

              <div className="lg:col-span-6 w-full flex items-center justify-center">
                <div className="w-full rounded-[24px] sm:rounded-[30px] p-3 sm:p-5 bg-gradient-to-br from-[#FFF3E6] via-[#FCEEE2] to-[#F7DFCD] border border-slate-200/60 shadow-inner flex items-center justify-center transition-all duration-300">
                  <div className="w-full max-w-[500px] h-[250px] sm:h-[290px] lg:h-[320px] rounded-2xl flex items-center justify-center relative overflow-hidden select-none">
                    {coreCards[2]?.image ? (
                      <img
                        src={coreCards[2].image}
                        alt="성경 본문 연동 설교 아카이빙"
                        className="w-full h-full object-contain drop-shadow-md rounded-xl transition-transform duration-300 hover:scale-102"
                      />
                    ) : (
                      <div className="w-full h-full rounded-2xl border-2 border-dashed border-slate-400/30 flex flex-col items-center justify-center text-slate-400/70 gap-2 p-4">
                        <span className="material-symbols-outlined text-3xl opacity-35">
                          add_photo_alternate
                        </span>
                        <span className="text-[12px] font-medium text-slate-500/70 tracking-tight">
                          이미지 등록 대기 중
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. Differentiation & FAQ 섹션 (홈페이지 BibleDifferentiationSection과 100% 일치) ── */}
      <section
        id="bible-differentiation"
        className="w-full bg-[#F8F9FD] py-12 sm:py-16 lg:py-20 border-b border-slate-200/80"
      >
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:grid lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Callout (Left Column) */}
          <div className="flex flex-col justify-center items-start gap-3 lg:col-span-5">
            {/* 무료로 앱 이용하기 버튼 */}
            <button
              type="button"
              onClick={scrollToLoginCard}
              className="inline-flex items-center gap-2 px-5 py-2.5 sm:px-5.5 sm:py-2.5 rounded-full bg-[#0F172A] hover:bg-black text-white text-[13px] sm:text-[14px] font-semibold shadow-md hover:shadow-lg transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer mb-1"
            >
              <span>무료로 앱 이용하기</span>
              <ArrowRight className="w-4 h-4 stroke-[2.2px]" />
            </button>

            <div className="flex flex-col gap-2">
              <p className="text-[12px] sm:text-[13px] text-[#64748B] font-normal">
                {landingData.diffTag || '단순한 설교준비 앱은 많습니다.'}
              </p>

              <h2 className="text-[12.5px] sm:text-[13.5px] font-medium text-[#0F172A] leading-relaxed break-keep-all">
                {landingData.diffHeading ||
                  '매주 강단에 오르기 전 말씀을 연구하고 씨름하는 목회자의 심정으로, 다년간 설교준비의 노하우를 담아 앱을 만들었습니다.'}
              </h2>

              <p className="text-[12px] sm:text-[12.5px] text-[#64748B] font-normal leading-relaxed max-w-xl break-keep-all">
                {landingData.diffDesc || '설교 준비의 모든 번잡함을 걷어내고 말씀의 본질에 집중할 수 있도록 돕습니다.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-0.5 text-[11.5px] sm:text-[12px] text-slate-600 font-medium">
              {(landingData.diffBadges || ['주석 클라우드 실시간 연동', '다중 역본 대조', '절별 주석 설교 라이브러리']).map(
                (badge, bIdx) => (
                  <div key={bIdx} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0F172A]" />
                    <span>{badge}</span>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Q&A Section (Right Column) */}
          <div className="flex flex-col gap-4.5 lg:col-span-7 justify-center">
            {faqList.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div key={idx} className="flex flex-col gap-1.5">
                  <h3 className="text-[13.5px] sm:text-[14.5px] font-bold text-[#0F172A] leading-snug break-keep-all">
                    <span className="text-[#0F172A] font-bold mr-1">Q.</span>
                    {faq.q}
                  </h3>

                  <div className="flex flex-col gap-1 w-full pl-3.5 sm:pl-4">
                    <div
                      onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                      className="flex items-center justify-between gap-3 cursor-pointer group select-none"
                    >
                      <p className="text-[12px] sm:text-[13px] text-slate-400 font-normal leading-snug break-keep-all group-hover:text-slate-600 transition-colors">
                        {faq.preview || faq.a.split('\n')[0]}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenFaqIndex(isOpen ? null : idx);
                        }}
                        aria-label="답변 펼치기/접기"
                        className="shrink-0 p-0 text-slate-400 group-hover:text-[#0F172A] bg-transparent border-0 cursor-pointer flex items-center justify-center leading-none focus:outline-none transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px] font-normal select-none">
                          {isOpen ? 'remove' : 'add'}
                        </span>
                      </button>
                    </div>

                    {isOpen && (
                      <div className="pt-1 text-[11.5px] sm:text-[12.5px] text-[#475569] leading-relaxed break-keep-all animate-fadeIn">
                        {faq.a}
                      </div>
                    )}
                  </div>

                  {idx < faqList.length - 1 && <div className="w-full h-[1px] bg-slate-200/90 mt-2" />}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 6. 교회를 돕는 모든 것 NATIONS 스마트 생태계 (옆으로 흐르는 마퀴 카드들) ── */}
      <section className="w-full py-16 sm:py-20 flex flex-col gap-8 bg-white border-b border-slate-200/80 overflow-hidden">
        <div className="flex flex-col gap-2.5 text-center max-w-2xl mx-auto px-4 items-center">
          <h2 className="text-[19px] sm:text-[23px] md:text-[27px] font-bold text-[#0F172A] leading-tight flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[24px] sm:text-[28px] text-[#0F172A] shrink-0">hub</span>
            <span>교회를 돕는 모든 것, NATIONS 스마트 생태계</span>
          </h2>
          <p className="text-[13px] sm:text-[14px] text-[#475569] max-w-xl mx-auto">
            설교, 찬양, 미디어, 행정, 선거, 소그룹 까지 하나로 이어지는 미니스트리 솔루션
          </p>
        </div>

        {/* 옆으로 흐르는 마퀴 트랙 */}
        <div className="relative w-full overflow-hidden py-2">
          <style>{`
            @keyframes marqueeScroll {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            .ecosystem-track {
              display: flex;
              gap: 14px;
              width: max-content;
              animation: marqueeScroll 36s linear infinite;
              will-change: transform;
            }
            .ecosystem-track:hover {
              animation-play-state: paused;
            }
          `}</style>

          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 sm:w-24 bg-gradient-to-r from-white via-white/80 to-transparent z-10" />
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 sm:w-24 bg-gradient-to-l from-white via-white/80 to-transparent z-10" />

          <div className="ecosystem-track py-1">
            {[
              {
                id: 'bible',
                title: 'NATIONS BIBLE AI',
                intro: '다중 역본 대조와 설교자를 위한 나만의 주석 노트',
                icon: 'menu_book',
              },
              {
                id: 'sermon',
                title: 'NATIONS SERMON VIDEO',
                intro: '유튜브 링크로 설교 숏폼 5개 & 주일 묵상카드 완성',
                icon: 'movie_filter',
              },
              {
                id: 'vote',
                title: 'NATIONS VOTE',
                intro: '90% 시간 단축, 실시간 집계 무설치 모바일 교회투표',
                icon: 'how_to_vote',
              },
              {
                id: 'studio',
                title: '네이션스 스튜디오 (Studio)',
                intro: '악보 라이브러리 편집부터 찬양팀 실시간 동기화',
                icon: 'queue_music',
              },
              {
                id: 'church',
                title: 'NATIONS CHURCH',
                intro: '어려운 행정을 덜어낸 간결한 올인원 스마트 교적관리',
                icon: 'church',
              },
              // Loop items duplicate
              {
                id: 'bible-2',
                title: 'NATIONS BIBLE AI',
                intro: '다중 역본 대조와 설교자를 위한 나만의 주석 노트',
                icon: 'menu_book',
              },
              {
                id: 'sermon-2',
                title: 'NATIONS SERMON VIDEO',
                intro: '유튜브 링크로 설교 숏폼 5개 & 주일 묵상카드 완성',
                icon: 'movie_filter',
              },
              {
                id: 'vote-2',
                title: 'NATIONS VOTE',
                intro: '90% 시간 단축, 실시간 집계 무설치 모바일 교회투표',
                icon: 'how_to_vote',
              },
              {
                id: 'studio-2',
                title: '네이션스 스튜디오 (Studio)',
                intro: '악보 라이브러리 편집부터 찬양팀 실시간 동기화',
                icon: 'queue_music',
              },
              {
                id: 'church-2',
                title: 'NATIONS CHURCH',
                intro: '어려운 행정을 덜어낸 간결한 올인원 스마트 교적관리',
                icon: 'church',
              },
            ].map((app, idx) => (
              <div
                key={`${app.id}-${idx}`}
                className="w-[260px] sm:w-[285px] shrink-0 bg-slate-50/80 hover:bg-white rounded-2xl p-4 sm:p-4.5 border border-slate-200/80 transition-all duration-200 select-none flex flex-col justify-between gap-2.5 shadow-2xs hover:shadow-md"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8.5 h-8.5 rounded-xl bg-slate-200/70 flex items-center justify-center shrink-0 text-slate-800">
                    <span className="material-symbols-outlined text-[19px] leading-none">
                      {app.icon}
                    </span>
                  </div>
                  <h3 className="text-[14px] sm:text-[15px] font-bold text-[#0F172A] leading-snug truncate">
                    {app.title}
                  </h3>
                </div>
                <p className="text-[12px] sm:text-[12.5px] text-[#64748B] font-normal leading-relaxed break-keep-all line-clamp-2">
                  {app.intro}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. 하단 로그인 카드 ── */}
      <section className="w-full bg-[#F8F9FD] py-16 sm:py-20 px-4 sm:px-6 flex justify-center border-b border-slate-200/80">
        {renderLoginCard('bottom-login-card')}
      </section>

      {/* ── 8. 네이션스 카카오톡 상담 배너: 어디서부터 시작해야 할지 막막하신가요? ── */}
      <section className="w-full bg-white py-14 sm:py-20 px-4 sm:px-6 flex flex-col items-center text-center gap-6 border-b border-slate-200/80">
        <div className="flex items-center justify-center gap-2 select-none">
          <img
            src="/nations-symbol-clean.png"
            alt="NATIONS 심볼"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
            className="h-8 sm:h-9 w-auto object-contain shrink-0"
          />
          <img
            src="/nations-logo-orig.png"
            alt="NATIONS 로고"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
            className="h-6 sm:h-7 w-auto object-contain shrink-0"
          />
        </div>

        <div className="flex flex-col gap-2 max-w-xl">
          <h2 className="text-[19px] sm:text-[23px] md:text-[26px] font-bold text-[#0F172A] leading-tight break-keep-all">
            어디서부터 시작해야 할지 막막하신가요?
          </h2>
          <p className="text-[13px] sm:text-[14px] text-[#475569] leading-relaxed break-keep-all">
            교회의 규모와 사역 환경에 맞춘 솔루션을 1:1로 제안해 드립니다.{' '}
            <span className="block sm:inline font-medium text-[#0F172A]">작은 문의도 성심껏 동역하겠습니다.</span>
          </p>
        </div>

        <div className="w-full max-w-md mx-auto">
          <a
            href="http://pf.kakao.com/_cxjBxaX/chat"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3.5 sm:py-4 px-6 bg-[#FEE500] hover:bg-[#FDD800] text-[#371D1E] rounded-2xl text-[14.5px] sm:text-[15.5px] font-bold shadow-md hover:shadow-lg flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] cursor-pointer"
          >
            <KakaoChannelIcon className="w-5.5 h-5.5 shrink-0" />
            <span>카카오채널: 더 네이션스 솔루션</span>
          </a>
        </div>
      </section>

      {/* ── 9. 홈페이지 하단: 간편한 스마트 목회 환경을 추구합니다 & 4열 디렉토리 ── */}
      <footer className="w-full bg-[#FAFBFD] pt-12 pb-16 px-4 sm:px-8 border-t border-slate-200">
        <div className="max-w-6xl mx-auto flex flex-col gap-8">
          {/* Top Header */}
          <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-1.5 pb-4 border-b border-slate-200/90">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-slate-800 shrink-0">cloud</span>
              <h3 className="text-[14px] sm:text-[15.5px] md:text-[17px] font-bold text-[#0F172A] tracking-tight break-keep-all">
                간편한 스마트 목회 환경을 추구합니다.
              </h3>
            </div>
            <p className="text-[11.5px] sm:text-[12px] text-[#64748B] font-normal break-keep-all">
              복잡한 설치 없이 웹과 모바일 앱이 어디서나 유기적으로 연동됩니다.
            </p>
          </div>

          {/* 4 Columns Directory */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 text-left">
            {/* 1. 제품 (Products) */}
            <div className="flex flex-col gap-2.5">
              <h4 className="text-[12.5px] font-bold text-[#0F172A]">제품 (Products)</h4>
              <ul className="flex flex-col gap-1.5 text-[11.5px] text-[#64748B]">
                <li>
                  <a href="https://sermon.thenations.kr" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">
                    NATIONS SERMON AI (숏폼 미디어)
                  </a>
                </li>
                <li>
                  <a href="https://vote.thenations.kr" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">
                    NATIONS VOTE (교회 스마트 투표)
                  </a>
                </li>
                <li>
                  <a href="https://studio.thenations.kr" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">
                    네이션스 스튜디오 (구 악보)
                  </a>
                </li>
                <li>
                  <a href="https://bible.thenations.kr" className="hover:text-black font-semibold text-slate-900 transition-colors">
                    NATIONS BIBLE AI (나만의 주석)
                  </a>
                </li>
                <li>
                  <a href="https://thenations.kr" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">
                    NATIONS CHURCH (교회 관리)
                  </a>
                </li>
              </ul>
            </div>

            {/* 2. 요금안내 */}
            <div className="flex flex-col gap-2.5">
              <h4 className="text-[12.5px] font-bold text-[#0F172A]">요금안내</h4>
              <ul className="flex flex-col gap-1.5 text-[11.5px] text-[#64748B]">
                <li>가입 후: 무료 서비스</li>
                <li>유료요금: 앱에 내부 안내</li>
                <li>연간결제: 약 17% 추가 할인 혜택</li>
              </ul>
            </div>

            {/* 3. 고객지원센터 */}
            <div className="flex flex-col gap-2.5">
              <h4 className="text-[12.5px] font-bold text-[#0F172A]">고객지원센터</h4>
              <ul className="flex flex-col gap-1.5 text-[11.5px] text-[#64748B]">
                <li>
                  <a
                    href="http://pf.kakao.com/_cxjBxaX/chat"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-black transition-colors"
                  >
                    1:1 카톡 문의하기
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById('core-features-section');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="hover:text-black transition-colors text-left cursor-pointer"
                  >
                    자주 묻는 질문 (FAQ)
                  </button>
                </li>
                <li className="relative">
                  <button
                    type="button"
                    onClick={() => setShowBusinessInfo(!showBusinessInfo)}
                    className="hover:text-black transition-colors text-left cursor-pointer flex items-center gap-1"
                  >
                    <span>사업자 정보 확인</span>
                    <span className="material-symbols-outlined text-[14px] text-slate-400">
                      {showBusinessInfo ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>
                  {showBusinessInfo && (
                    <div className="mt-2 p-3 bg-white border border-slate-200 rounded-xl shadow-md text-[11px] text-slate-600 leading-relaxed animate-fadeIn">
                      <p className="font-semibold text-slate-900">더네이션스 솔루션</p>
                      <p>대표자: 유문식</p>
                      <p>사업자등록번호: 712-14-02380</p>
                    </div>
                  )}
                </li>
              </ul>
            </div>

            {/* 4. 법률 및 정책 */}
            <div className="flex flex-col gap-2.5">
              <h4 className="text-[12.5px] font-bold text-[#0F172A]">법률 및 정책</h4>
              <ul className="flex flex-col gap-1.5 text-[11.5px] text-[#64748B]">
                <li>
                  <button
                    type="button"
                    onClick={() => openPolicy('terms')}
                    className="hover:text-black transition-colors text-left cursor-pointer"
                  >
                    서비스 이용약관
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openPolicy('privacy')}
                    className="hover:text-black transition-colors text-left cursor-pointer"
                  >
                    개인정보 처리방침
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openPolicy('refund')}
                    className="hover:text-black transition-colors text-left cursor-pointer"
                  >
                    청약철회 및 환불규정
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* 최하단 카피라이트 */}
          <div className="pt-6 border-t border-slate-200/90 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-400">
            <p>© 2026 NATIONS Bible AI. All rights reserved.</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => openPolicy('terms')}
                className="hover:underline cursor-pointer"
              >
                이용약관
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => openPolicy('privacy')}
                className="hover:underline cursor-pointer"
              >
                개인정보처리방침
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => openPolicy('refund')}
                className="hover:underline cursor-pointer"
              >
                환불규정
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* ── 10. 우측 하단 플로팅 퀵 액션 버튼 (앱 & 상담) ── */}
      <aside
        aria-label="빠른 실행 플로팅 메뉴"
        className="fixed bottom-6 right-4 sm:bottom-8 sm:right-6 md:bottom-10 md:right-8 z-40 flex flex-col items-center gap-3 pointer-events-auto select-none"
      >
        {/* 1. 앱 들어가기 플로팅 버튼 */}
        <div className="relative group">
          <button
            type="button"
            onClick={() => setIsAppsMenuOpen(!isAppsMenuOpen)}
            aria-label="앱 들어가기"
            className="w-[52px] h-[52px] sm:w-[56px] sm:h-[56px] rounded-full bg-[#C15F3C] hover:bg-[#a94e30] text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.26)] border border-white/25 flex flex-col items-center justify-center transition-all duration-150 cursor-pointer hover:scale-105 active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px] sm:text-[22px] leading-none">
              apps
            </span>
            <span className="text-[10px] sm:text-[10.5px] font-bold leading-none mt-0.5">
              앱
            </span>
          </button>
          <span className="hidden sm:block absolute right-full mr-3 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-black/85 text-white text-[12px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 shadow-md">
            다른 앱보기
          </span>
        </div>

        {/* 2. 1:1 상담 플로팅 버튼 */}
        <div className="relative group">
          <a
            href="http://pf.kakao.com/_cxjBxaX/chat"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="1:1 상담"
            className="w-[52px] h-[52px] sm:w-[56px] sm:h-[56px] rounded-full bg-[#FEE500] hover:bg-[#ffd800] text-[#371D1E] shadow-[0_4px_14px_rgba(0,0,0,0.16)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.24)] border border-black/10 flex flex-col items-center justify-center transition-all duration-150 cursor-pointer hover:scale-105 active:scale-95"
          >
            <KakaoChannelIcon className="w-[19px] h-[19px] sm:w-[21px] sm:h-[21px] leading-none" />
            <span className="text-[10px] sm:text-[10.5px] font-bold leading-none mt-0.5">
              상담
            </span>
          </a>
          <span className="hidden sm:block absolute right-full mr-3 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-black/85 text-white text-[12px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 shadow-md">
            1:1 실시간 상담
          </span>
        </div>
      </aside>

      {/* 전자상거래 표준 법적 필수 약관 모달 */}
      <LegalPolicyModal
        isOpen={policyModalOpen}
        initialTab={policyModalTab}
        onClose={() => setPolicyModalOpen(false)}
      />
    </div>
  );
};
export default ClaudeAuthPage;
