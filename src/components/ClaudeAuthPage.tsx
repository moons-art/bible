import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Mail,
  Lock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  KeyRound,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Check,
  CreditCard,
  Database,
  Gift,
  HelpCircle,
  ExternalLink,
  Shield,
  FileText,
  Building2,
  Send,
  ArrowLeft,
  MessageSquare
} from 'lucide-react';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  type User
} from 'firebase/auth';
import { auth, googleProvider } from '../api/firebaseConfig';
import { isInAppBrowser, escapeInAppBrowser } from '../utils/inAppBrowser';
import { 
  startKakaoLogin, 
  startNaverLogin, 
  syncUserWithHub, 
  getSocialUserMeta, 
  getRecentLoginProvider,
  processUniversalPayment,
  requestTossPayment
} from '../utils/socialAuth';
import { syncUserProfile } from '../services/userService';
import { submitReferralRequest } from '../services/promotionService';
import { PolicyViewModal, type PolicyModalType } from './PolicyViewModal';

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
  promoSettings
}) => {
  // 로그인/회원가입 상태
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [showEmailAuth, setShowEmailAuth] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 이용권 탭 ('membership': 클라우드 멤버십 | 'credit': AI 크레딧 충전)
  const [pricingTab, setPricingTab] = useState<'membership' | 'credit'>('membership');
  // 멤버십 결제 주기 ('yearly': 연간 결제 | 'monthly': 월간 구독)
  const [billingCycle, setBillingCycle] = useState<'yearly' | 'monthly'>('yearly');

  // 최근 로그인 수단
  const [recentProvider, setRecentProvider] = useState<string | null>(() => getRecentLoginProvider());

  // 타이핑 애니메이션 문구 및 상태
  const typingLines = React.useMemo(() => [
    { from: '복잡한 성경 주석', to: 'AI 원어 주석으로 한번에' },
    { from: '흩어진 설교 자료', to: '설교노트 클라우드 보관' },
    { from: '여러 번역본 비교', to: '한눈에 보는 다중 번역본' },
    { from: '모바일·태블릿·PC', to: '모든 기기 실시간 동기화' },
  ], []);

  const [displayedLengths, setDisplayedLengths] = useState<number[]>([0, 0, 0, 0]);

  useEffect(() => {
    let currentLine = 0;
    let currentChar = 0;
    const interval = setInterval(() => {
      setDisplayedLengths(prev => {
        const next = [...prev];
        const line = typingLines[currentLine];
        const maxLen = line ? line.from.length + 4 + line.to.length : 0;
        if (currentChar <= maxLen) {
          next[currentLine] = currentChar;
          currentChar++;
        } else {
          if (currentLine < typingLines.length - 1) {
            currentLine++;
            currentChar = 0;
          }
        }
        return next;
      });
    }, 40);
    return () => clearInterval(interval);
  }, [typingLines]);

  // 친구 추천 폼
  const [isReferralOpen, setIsReferralOpen] = useState(false);
  const [referrerEmailInput, setReferrerEmailInput] = useState('');
  const [friendEmailInput, setFriendEmailInput] = useState('');
  const [isSubmittingReferral, setIsSubmittingReferral] = useState(false);
  const [referralFeedback, setReferralFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // FAQ 아코디언 상태
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  // 정책 뷰어 모달
  const [policyModal, setPolicyModal] = useState<{ isOpen: boolean; tab: PolicyModalType }>({
    isOpen: false,
    tab: 'terms'
  });

  // 섹션 참조 (요금제 바로 스크롤용)
  const pricingSectionRef = useRef<HTMLDivElement>(null);
  const loginSectionRef = useRef<HTMLDivElement>(null);

  // 페이지 열릴 때 지정된 섹션으로 자동 스크롤
  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !requiredLogin) onClose();
      };
      window.addEventListener('keydown', handleKeyDown);

      const timer = setTimeout(() => {
        if (initialSection === 'pricing' && pricingSectionRef.current) {
          pricingSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (loginSectionRef.current) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 100);

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        clearTimeout(timer);
      };
    }
  }, [isOpen, initialSection]);

  if (!isOpen) return null;

  // 구글 로그인 핸들러
  const handleGoogleLogin = async () => {
    if (isInAppBrowser()) {
      escapeInAppBrowser();
      setErrorMsg('카카오톡/인앱 브라우저에서는 구글 정책상 로그인이 제한됩니다. 크롬 또는 사파리 외부 브라우저로 이동합니다.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        if (onSuccess) onSuccess();
        syncUserProfile(result.user).catch((e) => console.warn('[ClaudeAuthPage] syncUserProfile non-fatal:', e));
      }
    } catch (err: any) {
      console.error('[ClaudeAuthPage] Google login error:', err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        setErrorMsg('로그인 창이 닫혔습니다.');
      } else if (err.code === 'auth/popup-blocked') {
        setErrorMsg('팝업이 차단되었습니다. 브라우저 팝업 허용 설정을 확인해주세요.');
      } else {
        setErrorMsg('구글 로그인에 실패했습니다. 다시 시도해주세요.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 비밀번호 재설정 발송
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMsg('비밀번호를 재설정할 이메일 주소를 입력해주세요.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSuccessMsg('비밀번호 재설정 이메일이 발송되었습니다! 메일함(또는 스팸함)의 링크를 확인해주세요.');
    } catch (err: any) {
      console.error('[ClaudeAuthPage] Password reset error:', err);
      if (err.code === 'auth/user-not-found') {
        setErrorMsg('등록되지 않은 이메일 주소입니다.');
      } else if (err.code === 'auth/invalid-email') {
        setErrorMsg('올바른 이메일 형식이 아닙니다.');
      } else {
        setErrorMsg('이메일 발송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 이메일 로그인 / 회원가입
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMsg('이메일과 비밀번호를 모두 입력해주세요.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }
    if (tab === 'signup' && password !== passwordConfirm) {
      setErrorMsg('비밀번호와 비밀번호 확인이 서로 일치하지 않습니다.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (tab === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (displayName.trim()) {
          await updateProfile(cred.user, { displayName: displayName.trim() });
        }
        if (onSuccess) onSuccess();
        syncUserProfile(cred.user).catch((e) => console.warn('[ClaudeAuthPage] syncUserProfile:', e));
        alert('회원가입이 완료되었습니다! 환영합니다.');
      } else {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        if (onSuccess) onSuccess();
        syncUserProfile(cred.user).catch((e) => console.warn('[ClaudeAuthPage] syncUserProfile:', e));
      }
    } catch (err: any) {
      console.error('[ClaudeAuthPage] Email auth error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setErrorMsg('이미 등록된 이메일 주소입니다. 로그인을 진행해주세요.');
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setErrorMsg('이메일 또는 비밀번호가 일치하지 않습니다.');
      } else if (err.code === 'auth/user-not-found') {
        setErrorMsg('등록되지 않은 이메일입니다. 회원가입을 진행해주세요.');
      } else if (err.code === 'auth/invalid-email') {
        setErrorMsg('올바른 이메일 형식이 아닙니다.');
      } else {
        setErrorMsg('인증 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 친구 추천 신청 제출
  const handleSubmitReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referrerEmailInput.trim() || !friendEmailInput.trim()) {
      setReferralFeedback({ type: 'error', message: '추천인과 친구분의 이메일을 모두 입력해주세요.' });
      return;
    }
    if (referrerEmailInput.trim().toLowerCase() === friendEmailInput.trim().toLowerCase()) {
      setReferralFeedback({ type: 'error', message: '본인 이메일과 친구 이메일은 달라야 합니다.' });
      return;
    }

    setIsSubmittingReferral(true);
    setReferralFeedback(null);
    try {
      const cleanMyEmail = referrerEmailInput.trim().toLowerCase();
      const cleanFriendEmail = friendEmailInput.trim().toLowerCase();
      await submitReferralRequest({
        referrerEmail: cleanMyEmail,
        referrerName: cleanMyEmail.split('@')[0],
        referrerUid: auth.currentUser?.uid,
        friendEmail: cleanFriendEmail,
        friendName: cleanFriendEmail.split('@')[0],
        bonusCredits: 50
      });
      setReferralFeedback({
        type: 'success',
        message: '추천 신청이 정상 접수되었습니다! 관리자 확인 후 AI 50회가 충전됩니다.'
      });
      setFriendEmailInput('');
    } catch (err) {
      setReferralFeedback({ type: 'error', message: '신청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
    } finally {
      setIsSubmittingReferral(false);
    }
  };

  // 플랜 선택 및 결제 모듈 연동 핸들러
  const handlePlanAction = async (planName: string, isFreePlan = false) => {
    if (!currentUser) {
      alert(`${planName} 플랜을 이용하시려면 먼저 로그인이 필요합니다.\n상단 로그인 화면으로 이동합니다.`);
      loginSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (isFreePlan) {
      // 무료 플랜은 즉시 이용
      onClose();
      return;
    }

    // 대상 플랜 ID 및 결제 금액 산출
    let planId = 'cloud_lite';
    let amount = billingCycle === 'yearly' ? 39000 : 3900;
    if (planName.includes('마스터')) {
      planId = 'cloud_master';
      amount = billingCycle === 'yearly' ? 99000 : 9900;
    } else if (planName.includes('프로')) {
      planId = 'cloud_pro';
      amount = billingCycle === 'yearly' ? 59000 : 5900;
    } else if (planName.includes('200')) {
      planId = 'credit_200';
      amount = 5500;
    } else if (planName.includes('500')) {
      planId = 'credit_500';
      amount = 11000;
    } else if (planName.includes('365')) {
      planId = 'cloud_365';
      amount = 11000;
    }

    const isCreditOrOnce = planId.startsWith('credit_') || planId === 'cloud_365';
    const cycleText = isCreditOrOnce ? '단건 충전' : (billingCycle === 'yearly' ? '연간 결제' : '월간 구독');
    const orderId = `ord_bible_${Date.now()}`;

    // 중앙 결제 허브 베이스 URL
    const isLocal = window.location.hostname.includes('localhost') || window.location.hostname === '127.0.0.1';
    const hubBase = isLocal ? 'http://localhost:5173' : 'https://sermon.thenations.kr';
    const currentOriginUrl = window.location.origin + window.location.pathname;

    // 세션 스토리지에 복귀 정보 기록
    sessionStorage.setItem('pending_pay_target_app', 'bible');
    sessionStorage.setItem('pending_pay_plan_id', planId);
    sessionStorage.setItem('pending_pay_plan_name', planName);
    sessionStorage.setItem('pending_pay_cycle', isCreditOrOnce ? 'once' : billingCycle);
    sessionStorage.setItem('pending_pay_uid', currentUser.uid);
    sessionStorage.setItem('pending_pay_return_url', currentOriginUrl);

    try {
      await requestTossPayment({
        method: '카드',
        amount,
        orderId,
        orderName: `[Nations Bible] ${planName} (${cycleText})`,
        customerName: currentUser.displayName || '성경앱 회원',
        customerEmail: currentUser.email || undefined,
        successUrl: `${hubBase}/payment/success?targetApp=bible&planId=${planId}&planName=${encodeURIComponent(planName)}&billingCycle=${isCreditOrOnce ? 'once' : billingCycle}&uid=${encodeURIComponent(currentUser.uid)}&returnUrl=${encodeURIComponent(currentOriginUrl)}`,
        failUrl: `${hubBase}/payment/fail?returnUrl=${encodeURIComponent(currentOriginUrl)}`,
      });
    } catch (err) {
      console.warn('[ClaudeAuthPage] Toss payment cancelled or error:', err);
    }
  };


  // FAQ 목록 데이터 (사용자 요청 반영)
  const faqs = [
    {
      q: 'NATIONS BIBLE AI 이란?',
      a: '내가 만드는 나만의 주석앱입니다. 정보 홍수 시대에 또 하나의 주석을 갖는 것은 이제 의미가 없습니다. 나의 신학에 맞는 해석과 흩어져 있는 내 해석메모를 통합하여 각 구절마다 나만의 주석을 완성하는 것이 필요합니다.'
    },
    {
      q: 'NATIONS BIBLE AI 기능은?',
      a: '성경번역본 비교 검색, 번역본 추가, 설교준비 위한 성경 듀얼 뷰, 설교노트, 구절별 AI주석 생성, 구절별 나만의 노트, 주석, 관주 생성 이 모든 자료를 나만의 주석 클라우드 DB에 올리고 모든 기기에 실시간 연동됩니다.'
    },
    {
      q: '성경 번역본 추가 및 이용은 무료인가요?',
      a: '네, 기본 제공되는 개역한글(1961), KJV(1611) 은 저작권이 만료되어 누구나 자유롭게 연구에 활용하실 수 있습니다. 우리 앱은 사용자가 직접 소장한 연구용 텍스트 자료를 개인 기기에서 열람할 수 있는 맞춤형 뷰어로서 +번역본 추가 기능을 제공하며, 앱 내에서 번역본을 무단 제공하거나 이에 대한 과금을 요구하지 않습니다. 사용자가 보유한 개인 연구 파일(.txt)을 본인의 기기(로컬 브라우저)에 불러오는 기술적인 방법은 1:1로 무료 문의하시거나 [설정]을 참고하시기 바랍니다.'
    },
    {
      q: 'AI 크레딧은 어떻게 차감되며 유효기간은 얼마인가요?',
      a: '구절 및 단어의 심층 주석을 생성할 때마다 1회씩 차감됩니다. 충전하신 유료 크레딧은 기본적으로 365일(1년) 동안 보존됩니다.'
    },
    {
      q: '클라우드 요금제와 무료 이용자의 자료보관은 어떤 차이가 있나요?',
      a: '무료 보관은 모든 노트와 구절 메모는 개인의 기기에 보관되며, AI주석은 기기에 30일 동안 저장됩니다. \n반면, 클라우드 맴버쉽 회원은 모든 자료가 서버 클라우드에 저장되어, 스마트폰·태블릿·PC 어디서나 크레딧 차감 없이 열람하실 수 있습니다.'
    },
    {
      q: 'PC, 태블릿, 스마트폰 등 다양한 기기에서 연동되나요?',
      a: '네, 작성하신 메모, 노트, 모든 데이터가 모든 기기에서 실시간으로 안전하게 동기화됩니다. 하지만, 성경연구 특성상 넓은 데스트탑 화면이나 테블릿에서 연구하시는 것이 모든 기능을 편하게 이용하실 수 있습니다.'
    }
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-[#FAF9F5] text-[#2C2B29] overflow-y-auto select-text font-sans custom-scrollbar">
      {/* 1. 상단 고정 헤더: 네이션스 바이블 공식 로고 적용 */}
      <header className="sticky top-0 z-40 bg-[#FAF9F5]/95 backdrop-blur-md border-b border-[#E8E5DE] transition-colors">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* 좌측 로고: 네이션스 바이블 공식 로고 이미지 */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center gap-2.5 hover:opacity-85 transition-opacity cursor-pointer text-left"
            >
              <img
                src="/icon.png"
                alt="NATIONS BIBLE"
                className="w-8 h-8 rounded-xl object-contain border border-[#E7E2D8] shadow-2xs"
              />
              <div className="flex flex-col">
                <span className="font-serif text-lg font-bold tracking-tight text-[#2C2B29]">
                  NATIONS BIBLE
                </span>
              </div>
            </button>
          </div>

          {/* 우측 네비게이션 및 돌아가기 버튼 */}
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => {
                pricingSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="hidden sm:inline-block text-xs font-medium text-[#6E6A63] hover:text-[#2C2B29] transition-colors px-2.5 py-1.5 rounded-lg cursor-pointer"
            >
              요금제 안내
            </button>
            <button
              onClick={() => {
                const el = document.getElementById('claude-faq-section');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="hidden sm:inline-block text-xs font-medium text-[#6E6A63] hover:text-[#2C2B29] transition-colors px-2.5 py-1.5 rounded-lg cursor-pointer"
            >
              자주 묻는 질문
            </button>

            {/* 현재 로그인 유저 정보 뱃지 */}
            {currentUser && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-white border border-[#E8E5DE] rounded-full text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-medium text-[#4A4741] max-w-[120px] truncate">
                  {currentUser.displayName || currentUser.email?.split('@')[0]}
                </span>
                <span className="text-[#8C877D]">|</span>
                <span className="text-[#C46A40] font-bold">
                  {totalRemaining} 크레딧
                </span>
              </div>
            )}

            {/* 성경으로 돌아가기 (닫기) 버튼 - 필수 로그인 모드 시 숨김 */}
            {!requiredLogin && (
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-white hover:bg-[#F3EFE9] border border-[#DDD8CE] text-[#2C2B29] rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                title="성경 본문으로 돌아가기"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[#6E6A63]" />
                <span>성경 읽기</span>
                <X className="w-3.5 h-3.5 text-[#8C877D] ml-1" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. 최상단 히어로 & 로그인 섹션 */}
      <section ref={loginSectionRef} className="pt-12 pb-16 px-4 sm:px-6 max-w-4xl mx-auto flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full flex flex-col items-center"
        >
          {/* 헤드카피 */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-[#1A1918] tracking-tight leading-tight mb-4 max-w-2xl">
            더 깊이 묵상하고,<br />
            더 빠르게 연구하세요
          </h1>

          {/* 최상단 서브 문구 (3줄글 & 기능 소개 카드) */}
          <div className="mb-6 text-center text-xs sm:text-sm text-[#4A4741] leading-relaxed">
            <p className="font-semibold text-lg text-[#1C1A18] font-serif mb-2">Nations Bible</p>
            <div className="space-y-1 text-[#66625B]">
              <p><span className="font-bold text-[#1C1A18]">EASY</span> : 쉬워요!</p>
              <p><span className="font-bold text-[#1C1A18]">SIMPLE</span> : 필요한 기능만!</p>
              <p><span className="font-bold text-[#1C1A18]">LIGHT</span> : 부담없어요! 평생 무료 & 합리적 요금</p>
            </div>

            {/* 4줄 순차 타이핑 효과 영역 */}
            <div className="mt-4 w-full sm:w-[405px] h-[126px] min-h-[126px] max-h-[126px] mx-auto rounded-2xl border border-[#DA7756]/40 bg-white/80 py-2.5 shadow-2xs flex flex-col justify-between items-center shrink-0 box-border overflow-hidden">
              <div className="w-[260px] max-w-[90%] pl-2 flex flex-col justify-between h-full">
                {typingLines.map((item, idx) => {
                  const charCount = displayedLengths[idx];
                  const fromLen = item.from.length;
                  const hasFrom = charCount > 0;
                  const hasArrow = charCount >= fromLen + 3;
                  const toTypedCount = Math.max(0, charCount - (fromLen + 4));

                  const fromText = item.from.slice(0, charCount);
                  const toText = item.to.slice(0, toTypedCount);

                  return (
                    <div
                      key={idx}
                      className="h-5 min-h-[20px] max-h-[20px] flex items-center justify-start gap-2 font-medium text-[12px] sm:text-[13px] text-[#2C2B29] whitespace-nowrap overflow-hidden"
                    >
                      <span
                        className={`shrink-0 flex items-center justify-center w-3.5 h-3.5 rounded-full transition-all ${
                          hasFrom ? 'bg-[#1C1A18] text-white opacity-100 scale-100' : 'opacity-0 scale-75'
                        }`}
                      >
                        <Check className="w-2 h-2 stroke-[3px]" />
                      </span>

                      <span className="font-sans tracking-tight text-[#3A3834]">
                        {fromText}
                      </span>

                      {hasArrow && (
                        <span className="inline-flex items-center text-[#1C1A18] shrink-0 font-bold px-0.5 animate-fadeIn">
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-4 h-4 inline-block"
                          >
                            <line x1="3" y1="12" x2="20" y2="12" />
                            <polyline points="15 7 20 12 15 17" />
                          </svg>
                        </span>
                      )}

                      {toTypedCount > 0 && (
                        <span className="font-semibold text-[#1C1A18] tracking-tight">
                          {toText}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 로그인 카드 컨테이너 */}
          <div className="w-full max-w-md bg-white border border-[#E8E5DE] rounded-3xl p-6 sm:p-8 shadow-xs text-left">
            {currentUser ? (
              /* 이미 로그인된 상태 안내 카드 */
              <div className="flex flex-col items-center text-center gap-4 py-2">
                <div className="w-14 h-14 rounded-full bg-[#FAF0EB] text-[#C46A40] flex items-center justify-center border border-[#F5D8CB]">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg text-[#1A1918]">
                    {currentUser.displayName || '회원'}님, 환영합니다!
                  </h3>
                  <p className="text-xs text-[#6E6A63] mt-1">
                    {currentUser.email || getSocialUserMeta(currentUser)?.email || currentUser.displayName || '소셜'} 계정으로 로그인되어 있습니다.
                  </p>
                </div>

                {/* 현재 크레딧 상태 카드 */}
                <div className="w-full p-4 bg-[#FAF9F5] border border-[#E8E5DE] rounded-2xl flex items-center justify-between text-xs">
                  <div className="flex flex-col text-left">
                    <span className="text-[#8C877D]">현재 잔여 AI 크레딧</span>
                    <span className="font-bold text-base text-[#C46A40] mt-0.5">{totalRemaining}회</span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-[#8C877D]">유효기간</span>
                    <span className="font-semibold text-[#2C2B29] mt-0.5">{remainingDaysText}</span>
                  </div>
                </div>

                <div className="w-full flex flex-col gap-2 mt-2">
                  <button
                    onClick={() => {
                      pricingSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="w-full py-3 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CreditCard className="w-4 h-4 text-white/80" />
                    <span>이용권 및 크레딧 충전 플랜 보기</span>
                    <ChevronDown className="w-4 h-4 text-white/80" />
                  </button>

                  <button
                    onClick={onClose}
                    className="w-full py-2.5 bg-[#FAF9F5] hover:bg-[#F3EFE9] border border-[#E8E5DE] text-[#4A4741] rounded-xl text-xs font-semibold transition-all cursor-pointer"
                  >
                    성경 본문 읽기로 돌아가기
                  </button>
                </div>
              </div>
            ) : (
              /* 비로그인 시: Google 및 이메일 로그인 카드 */
              <div className="flex flex-col gap-4">
                <div className="text-center font-bold text-sm text-[#2C2B29]">무료로 이용하기</div>

                {/* 1. 구글로 계속하기 버튼 */}
                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="relative w-full py-3.5 px-4 bg-white hover:bg-[#FAF9F5] active:bg-[#F5F2EB] border border-[#DDD8CE] text-[#2C2B29] rounded-2xl font-semibold text-sm flex items-center justify-center gap-3 transition-all shadow-2xs hover:shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span>Google로 계속하기</span>
                  {recentProvider === 'google' && (
                    <span className="absolute right-3 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#F3EFEA] text-[#8C5E43] border border-[#E5DFD5]">
                      최근 로그인
                    </span>
                  )}
                </button>

                {/* 카카오 & 네이버 간편로그인 버튼 */}
                <button
                  type="button"
                  onClick={() => startKakaoLogin('bible')}
                  disabled={isLoading}
                  className="relative w-full py-3.5 px-4 bg-[#FEE500] hover:bg-[#FDD800] active:bg-[#F5D000] text-[#191919] rounded-2xl font-semibold text-sm flex items-center justify-center gap-2.5 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="#191919">
                    <path d="M12 3C6.477 3 2 6.463 2 10.735c0 2.78 1.884 5.217 4.716 6.578-.154.557-.991 3.588-1.028 3.816-.047.29.106.286.224.208.092-.06 3.658-2.482 5.134-3.489.312.031.63.047.954.047 5.523 0 10-3.463 10-7.735S17.523 3 12 3z" />
                  </svg>
                  <span>카카오로 1초 만에 시작하기</span>
                  {recentProvider === 'kakao' && (
                    <span className="absolute right-3 px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/10 text-[#191919] border border-black/5">
                      최근 로그인
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => startNaverLogin('bible')}
                  disabled={isLoading}
                  className="relative w-full py-3.5 px-4 bg-[#03C75A] hover:bg-[#02B350] active:bg-[#029E46] text-white rounded-2xl font-semibold text-sm flex items-center justify-center gap-2.5 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  <span className="font-black text-sm leading-none">N</span>
                  <span>네이버로 시작하기</span>
                  {recentProvider === 'naver' && (
                    <span className="absolute right-3 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/20 text-white border border-white/20">
                      최근 로그인
                    </span>
                  )}
                </button>

{false && (<button type="button" onClick={() => setShowEmailAuth(!showEmailAuth)}><Mail /><ChevronUp /><ChevronDown /></button>)}

                {/* 4. 이메일 폼 상세 영역 */}
                {showEmailAuth && (
                  <div className="flex flex-col gap-3 pt-2">
                    {isResetMode ? (
                      <div className="flex flex-col gap-3 bg-[#FAF9F5] p-4 rounded-2xl border border-[#E8E5DE]">
                        <div className="flex items-center gap-2 text-[#2C2B29]">
                          <KeyRound className="w-4 h-4 text-[#C46A40]" />
                          <h4 className="font-bold text-xs">비밀번호 재설정 링크 발송</h4>
                        </div>
                        <p className="text-[11px] text-[#6E6A63] leading-relaxed">
                          가입하신 이메일 주소를 입력하시면 비밀번호를 안전하게 재설정할 수 있는 링크를 보내드립니다.
                        </p>

                        {errorMsg && (
                          <div className="p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{errorMsg}</span>
                          </div>
                        )}
                        {successMsg && (
                          <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>{successMsg}</span>
                          </div>
                        )}

                        <form onSubmit={handlePasswordReset} className="flex flex-col gap-2.5">
                          <input
                            type="email"
                            placeholder="가입 이메일 주소"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-white border border-[#DDD8CE] rounded-xl px-3.5 py-2 text-xs text-[#2C2B29] outline-none focus:border-[#C46A40]"
                            required
                          />
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              disabled={isLoading}
                              className="flex-1 py-2 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                            >
                              발송하기
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsResetMode(false);
                                setErrorMsg(null);
                                setSuccessMsg(null);
                              }}
                              className="px-3 py-2 bg-white border border-[#DDD8CE] text-[#6E6A63] rounded-xl text-xs font-medium cursor-pointer"
                            >
                              취소
                            </button>
                          </div>
                        </form>
                      </div>
                    ) : (
                      <>
                        <div className="flex bg-[#F0EEE6] p-1 rounded-xl">
                          <button
                            type="button"
                            onClick={() => {
                              setTab('login');
                              setPasswordConfirm('');
                              setErrorMsg(null);
                              setSuccessMsg(null);
                            }}
                            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                              tab === 'login' ? 'bg-white text-[#2C2B29] shadow-2xs' : 'text-[#8C877D] hover:text-[#2C2B29]'
                            }`}
                          >
                            로그인
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTab('signup');
                              setPasswordConfirm('');
                              setErrorMsg(null);
                              setSuccessMsg(null);
                            }}
                            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                              tab === 'signup' ? 'bg-white text-[#2C2B29] shadow-2xs' : 'text-[#8C877D] hover:text-[#2C2B29]'
                            }`}
                          >
                            간편 회원가입
                          </button>
                        </div>

                        {errorMsg && (
                          <div className="p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{errorMsg}</span>
                          </div>
                        )}

                        <form onSubmit={handleEmailAuth} className="flex flex-col gap-2.5">
                          {tab === 'signup' && (
                            <div>
                              <label className="block text-[11px] font-semibold text-[#6E6A63] mb-1">
                                이름 <span className="text-[#C46A40]">(본명)</span>
                              </label>
                              <input
                                type="text"
                                placeholder="홍길동"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                className="w-full bg-[#FAF9F5] border border-[#DDD8CE] rounded-xl px-3.5 py-2 text-xs text-[#2C2B29] outline-none focus:border-[#C46A40]"
                                required
                              />
                            </div>
                          )}

                          <div>
                            <label className="block text-[11px] font-semibold text-[#6E6A63] mb-1">이메일</label>
                            <input
                              type="email"
                              placeholder="user@example.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="w-full bg-[#FAF9F5] border border-[#DDD8CE] rounded-xl px-3.5 py-2 text-xs text-[#2C2B29] outline-none focus:border-[#C46A40]"
                              required
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[11px] font-semibold text-[#6E6A63]">비밀번호</label>
                              {tab === 'login' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsResetMode(true);
                                    setErrorMsg(null);
                                  }}
                                  className="text-[10px] text-[#C46A40] hover:underline cursor-pointer"
                                >
                                  비밀번호 찾기
                                </button>
                              )}
                            </div>
                            <div className="relative">
                              <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-[#FAF9F5] border border-[#DDD8CE] rounded-xl px-3.5 py-2 pr-9 text-xs text-[#2C2B29] outline-none focus:border-[#C46A40]"
                                required
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-2.5 top-2.5 text-[#8C877D] hover:text-[#2C2B29]"
                              >
                                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>

                          {tab === 'signup' && (
                            <div>
                              <label className="block text-[11px] font-semibold text-[#6E6A63] mb-1">비밀번호 확인</label>
                              <div className="relative">
                                <input
                                  type={showPasswordConfirm ? 'text' : 'password'}
                                  placeholder="••••••••"
                                  value={passwordConfirm}
                                  onChange={(e) => setPasswordConfirm(e.target.value)}
                                  className="w-full bg-[#FAF9F5] border border-[#DDD8CE] rounded-xl px-3.5 py-2 pr-9 text-xs text-[#2C2B29] outline-none focus:border-[#C46A40]"
                                  required
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                                  className="absolute right-2.5 top-2.5 text-[#8C877D] hover:text-[#2C2B29]"
                                >
                                  {showPasswordConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                          )}

                          <button
                            type="submit"
                            disabled={isLoading}
                            className="mt-1 w-full py-2.5 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-semibold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <span>{tab === 'login' ? '이메일로 로그인' : '가입 완료하기'}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                )}

                {/* 5. 법적 고지 */}
                <div className="pt-2 text-center">
                  <p className="text-[11px] text-[#8C877D] leading-relaxed">
                    계속 진행하면 NATIONS BIBLE의{' '}
                    <button
                      type="button"
                      onClick={() => setPolicyModal({ isOpen: true, tab: 'privacy' })}
                      className="text-[#C46A40] underline hover:text-[#B55434] cursor-pointer font-medium"
                    >
                      개인정보처리방침
                    </button>
                    {' '}및{' '}
                    <button
                      type="button"
                      onClick={() => setPolicyModal({ isOpen: true, tab: 'terms' })}
                      className="text-[#C46A40] underline hover:text-[#B55434] cursor-pointer font-medium"
                    >
                      이용약관
                    </button>
                    에 동의하는 것으로 간주됩니다.
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </section>

      {/* 3. 요금제 살펴보기 섹션 */}
      <section ref={pricingSectionRef} className="py-16 px-4 sm:px-6 bg-[#F5F2EB]/50 border-t border-[#E8E5DE]">
        <div className="max-w-6xl mx-auto">
          {/* 섹션 타이틀 */}
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#1A1918] mb-4">
              요금제 살펴보기
            </h2>

            {/* 탭 토글: [클라우드 요금제] / [크레딧 충전요금제] - 글자 더 크게 */}
            <div className="inline-flex bg-[#EAE6DE] p-1.5 rounded-2xl mb-2">
              <button
                type="button"
                onClick={() => setPricingTab('membership')}
                className={`px-5 sm:px-7 py-2.5 text-sm sm:text-base font-bold rounded-xl transition-all cursor-pointer ${
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
                className={`px-5 sm:px-7 py-2.5 text-sm sm:text-base font-bold rounded-xl transition-all cursor-pointer ${
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
            /* ── 클라우드 멤버십 섹션 ── */
            <div className="space-y-6">
              {/* 연간 결제 / 월간 구독 토글 & 안내 툴팁 */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-2 bg-transparent mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#6E6A63]">결제 주기 선택</span>
                  {/* ? 안내 아이콘 및 툴팁 (심플한 블랙) */}
                  <div className="relative group/billing-help inline-flex items-center">
                    <button
                      type="button"
                      className="w-4 h-4 rounded-full bg-[#2C2B29] text-white flex items-center justify-center text-[10px] font-bold cursor-help transition-opacity hover:opacity-80"
                      aria-label="결제 주기 및 플랜 추천 안내"
                    >
                      ?
                    </button>
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover/billing-help:block z-50 w-80 sm:w-96 p-3.5 bg-[#1A1918] text-white text-xs rounded-xl shadow-xl border border-black/20 text-left leading-relaxed pointer-events-none">
                      <p className="font-bold text-[#FAF9F5] mb-1">
                        - 나만의 설교 DB와 설교노트 동기화 필요하신 목회자
                      </p>
                      <p className="text-[#DDD8CE] mb-2.5 text-[11px]">
                        클라우드 라이트 연간권(₩39,000)구매 후 2년차 부터 클라우드 365 연장권(₩11,000) 이용
                      </p>
                      <div className="w-full h-px bg-white/15 my-2"></div>
                      <p className="font-bold text-[#FAF9F5] mb-1">
                        - 성경 66권 AI원어주석과 나만의 구절주석을 합쳐 나만의 주석책을 완성하시려는 목회자
                      </p>
                      <p className="text-[#DDD8CE] text-[11px]">
                        클라우드 마스터 연간권(₩99,000)구매 후 2년차 부터 클라우드 365 연장권(₩11,000) 이용
                      </p>
                    </div>
                  </div>
                </div>

                {/* 연간 결제 / 월간 구독 토글 */}
                <div className="inline-flex items-center bg-[#EAE6DE] p-1 rounded-xl shrink-0 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setBillingCycle('yearly')}
                    className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                      billingCycle === 'yearly'
                        ? 'bg-[#C46A40] text-white shadow-xs'
                        : 'text-[#6E6A63] hover:text-[#2C2B29]'
                    }`}
                  >
                    연간 결제
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingCycle('monthly')}
                    className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                      billingCycle === 'monthly'
                        ? 'bg-[#2C2B29] text-white shadow-xs'
                        : 'text-[#6E6A63] hover:text-[#2C2B29]'
                    }`}
                  >
                    월간 구독
                  </button>
                </div>
              </div>

              {/* 4개 플랜 그리드: Free / 클라우드 라이트 / 클라우드 프로 / 클라우드 마스터 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* 1. Free 플랜 */}
                <div className="bg-white border border-[#E8E5DE] rounded-3xl p-6 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                  <div>
                    <Sparkles className="w-7 h-7 text-[#7A756D] mb-3 stroke-[1.8px]" />
                    <h3 className="text-xl font-bold text-[#1A1918]">기본 제공 (Free)</h3>

                    <div className="mb-6 mt-3">
                      <div className="text-3xl font-serif font-bold text-[#1A1918]">₩0</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handlePlanAction('Free 기본 제공', true)}
                      className="w-full py-2.5 px-4 bg-[#F5F3ED] hover:bg-[#EAE6DE] text-[#2C2B29] rounded-xl text-xs font-bold transition-all cursor-pointer mb-6"
                    >
                      무료로 이용하기
                    </button>

                    <div className="border-t border-[#EFECE6] pt-4">
                      <span className="text-[11px] font-bold text-[#5A564F] block mb-2.5">제공 혜택:</span>
                      <ul className="text-xs text-[#6E6A63] space-y-2.5">
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                          <span>번역본 비교,</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                          <span>
                            나만의 설교노트, 구절 주석 에디터 제공
                            <span className="text-[11px] text-[#8C877D] block mt-0.5">(사용기기에 데이터 저장)</span>
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                          <span>매월 5 크레딧+설교자료 5종 set 1개</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                          <span>AI 원어주석 체험</span>
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
                    <p className="text-[11px] text-[#7A756D] mt-1 mb-4 leading-relaxed">
                      나만의 설교노트와 구절주석 DB서버를 구축하려는 전도사님 추천
                    </p>

                    <div className="mb-6">
                      {billingCycle === 'yearly' ? (
                        <>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-3xl font-serif font-bold text-[#1A1918]">₩39,000</span>
                            <span className="text-xs text-[#8C877D]">/ 연간</span>
                          </div>
                          <p className="text-[10px] text-[#1A1918] font-medium mt-1">
                            *2년 차부터 서버유지 11,000원(월 900원) 연장 가능
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
                      onClick={() => handlePlanAction(`클라우드 라이트 (${billingCycle === 'yearly' ? '연간 39,000원' : '월간 3,900원'})`)}
                      className="w-full py-2.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
                    >
                      클라우드 라이트 시작하기
                    </button>

                    <div className="border-t border-[#EFECE6] pt-4">
                      <span className="text-[11px] font-bold text-[#5A564F] block mb-2.5">주요 혜택:</span>
                      <ul className="text-xs text-[#6E6A63] space-y-2.5">
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                          <span>
                            설교노트, 구절주석 모든 자료 클라우드저장
                            <span className="text-[11px] text-[#8C877D] block mt-0.5">(모든 기기 무제한 연동)</span>
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                          <span>
                            250 크레딧 즉시 지급 (유효기간 1년)
                            <span className="text-[11px] text-[#8C877D] block mt-0.5">(AI 원어주석 250회 or 설교자료 5종 set 12개)</span>
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                          <span>크레딧으로 생성된 AI 원어주석 500구절 클라우드 보관</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* 3. 클라우드 프로 (목회자 추천 배지) */}
                <div className="bg-[#FFFBF8] border-2 border-[#C46A40] rounded-3xl p-6 flex flex-col justify-between shadow-md relative">
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-0.5 rounded-full bg-[#C46A40] text-white text-[11px] font-bold tracking-tight shadow-sm">
                    목회자 추천
                  </span>
                  <div>
                    <Database className="w-7 h-7 text-[#C46A40] mb-3 stroke-[1.8px]" />
                    <h3 className="text-xl font-bold text-[#1A1918]">클라우드 프로</h3>
                    <p className="text-[11px] text-[#7A756D] mt-1 mb-4 leading-relaxed">
                      나만의 DB구축과 함께  AI 주석과 설교자료도 필요하신 강도사님 추천
                    </p>

                    <div className="mb-6">
                      {billingCycle === 'yearly' ? (
                        <>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-3xl font-serif font-bold text-[#1A1918]">₩59,000</span>
                            <span className="text-xs text-[#8C877D]">/ 연간</span>
                          </div>
                          <p className="text-[10px] text-[#1A1918] font-medium mt-1">
                            *2년 차부터 서버유지 11,000원(월 900원) 연장 가능
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
                      onClick={() => handlePlanAction(`클라우드 프로 (${billingCycle === 'yearly' ? '연간 59,000원' : '월간 5,900원'})`)}
                      className="w-full py-2.5 px-4 bg-[#C46A40] hover:bg-[#B55434] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
                    >
                      클라우드 프로 시작하기
                    </button>

                    <div className="border-t border-[#F1D3C6] pt-4">
                      <span className="text-[11px] font-bold text-[#C46A40] block mb-2.5">주요 혜택:</span>
                      <ul className="text-xs text-[#524F4A] space-y-2.5">
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                          <span>클라우드 라이트 모든 혜택 +</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                          <span>AI 원어주석 1000구절 클라우드 보관</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                          <span>
                            500 크레딧 즉시 지급 (유효기간 1년)
                            <span className="text-[11px] text-[#8C877D] block mt-0.5">(AI 원어주석 500회 or 설교자료 5종 set 25개)</span>
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* 4. 클라우드 마스터 (최고 인기) */}
                <div className="bg-white border border-[#E8E5DE] rounded-3xl p-6 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                  <div>
                    <Database className="w-7 h-7 text-[#2C2B29] mb-3 stroke-[1.8px]" />
                    <h3 className="text-xl font-bold text-[#1A1918]">클라우드 마스터</h3>
                    <p className="text-[11px] text-[#7A756D] mt-1 mb-4 leading-relaxed">
                      성경 66권 AI 주석 서재를 완성하려는 목사님 추천
                    </p>

                    <div className="mb-6">
                      {billingCycle === 'yearly' ? (
                        <>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-3xl font-serif font-bold text-[#2C2B29]">₩99,000</span>
                            <span className="text-xs text-[#8C877D]">/ 연간</span>
                          </div>
                          <p className="text-[10px] text-[#1A1918] font-medium mt-1">
                            *2년 차부터 서버유지 11,000원(월 900원) 연장 가능
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
                      onClick={() => handlePlanAction(`클라우드 마스터 (${billingCycle === 'yearly' ? '연간 99,000원' : '월간 9,900원'})`)}
                      className="w-full py-2.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
                    >
                      연간 플랜 시작하기
                    </button>

                    <div className="border-t border-[#EFECE6] pt-4">
                      <span className="text-[11px] font-bold text-[#5A564F] block mb-2.5">주요 혜택:</span>
                      <ul className="text-xs text-[#6E6A63] space-y-2.5">
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-[#2C2B29] shrink-0 mt-0.5" />
                          <span>클라우드 프로 모든 혜택 +</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-[#2C2B29] shrink-0 mt-0.5" />
                          <span>AI 주석 성경 66권 모든 구절 클라우드 보관</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-[#2C2B29] shrink-0 mt-0.5" />
                          <span>
                            AI 1,000 크레딧 즉시 지급 (유효기간 2년)
                            <span className="text-[11px] text-[#8C877D] block mt-0.5">(AI 원어주석 1000회 or 설교자료 5종 set 50개)</span>
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* 클라우드 365 (1년 갱신) 카드 */}
              <div className="p-5 sm:p-6 bg-gradient-to-r from-[#FAF9F5] via-white to-[#FAF0EB] border border-[#E7E2D8] rounded-3xl shadow-2xs max-w-4xl mx-auto">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5 text-left">
                    <div className="w-10 h-10 rounded-2xl bg-[#FAF0EB] text-[#C46A40] flex items-center justify-center border border-[#F1D3C6] shrink-0">
                      <CreditCard className="w-5 h-5 stroke-[2px]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm sm:text-base font-bold text-[#1A1918]">
                          클라우드 365 (1년 갱신)
                        </h4>
                        <span className="px-2 py-0.5 bg-[#FAF0EB] text-[#C46A40] border border-[#F1D3C6] rounded-md text-[10px] font-bold">
                          클라우드 요금제 연간 결제 이용자 전용
                        </span>
                      </div>
                      <p className="text-xs text-[#6E6A63] mt-1 leading-relaxed">
                        2년 차부터 적용되는 서버 유지 및 보관 연장권 (월 900원 상당)
                        <br className="hidden sm:inline" />
                        {' '}· 기존 구축된 설교 데이터 및 AI 원어주석 데이터 동기화 유지
                      </p>
                      <p className="text-xs font-semibold text-[#C46A40] mt-1">
                        갱신 감사 혜택: AI 200 크레딧 즉시 지급 (유효기간 1년)
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 w-full sm:w-auto shrink-0">
                    <div className="text-right">
                      <div className="text-xl sm:text-2xl font-serif font-bold text-[#C46A40]">₩11,000</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePlanAction('클라우드 365 이용하기')}
                      className="w-full sm:w-auto px-4 py-2 bg-[#2C2B29] hover:bg-[#1A1918] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                    >
                      클라우드 365 이용하기
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ── 크레딧 충전요금제 섹션 ── */
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="p-3.5 bg-white border border-[#E8E5DE] rounded-2xl text-center text-xs text-[#6E6A63]">
                (클라우드 요금제 맴버쉽 회원만 구매할 수있습니다)
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* 1. 크레딧 200 */}
                <div className="bg-white border border-[#E8E5DE] rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                  <div>
                    <Sparkles className="w-7 h-7 text-[#C46A40] mb-3 stroke-[1.8px]" />
                    <h3 className="text-xl font-bold text-[#1A1918]">크레딧 200</h3>
                    <p className="text-xs text-[#7A756D] mt-1 mb-4">구절 및 단어 연구가 추가로 필요할 때</p>

                    <div className="mb-6">
                      <div className="text-3xl font-serif font-bold text-[#C46A40]">₩5,500</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handlePlanAction('크레딧 200 충전')}
                      className="w-full py-2.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
                    >
                      충전하기
                    </button>

                    <div className="border-t border-[#EFECE6] pt-4">
                      <span className="text-[11px] font-bold text-[#5A564F] block mb-2.5">포함된 혜택:</span>
                      <ul className="text-xs text-[#6E6A63] space-y-2.5">
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                          <span>
                            200 크레딧 즉시 충전
                            <span className="text-[11px] text-[#8C877D] block mt-0.5">(AI 원어주석 200회 or 설교자료 5종 set 10개)</span>
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                          <span>충전일로부터 365일 (1년)</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* 2. 크레딧 500 */}
                <div className="bg-[#FFFBF8] border-2 border-[#C46A40] rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-md relative">
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-0.5 rounded-full bg-[#C46A40] text-white text-[11px] font-bold tracking-tight shadow-sm">
                    인기 충전
                  </span>
                  <div>
                    <Sparkles className="w-7 h-7 text-[#C46A40] mb-3 stroke-[1.8px]" />
                    <h3 className="text-xl font-bold text-[#1A1918]">크레딧 500</h3>
                    <p className="text-xs text-[#7A756D] mt-1 mb-4">지속적인 설교 준비와 연구를 위한</p>

                    <div className="mb-6">
                      <div className="text-3xl font-serif font-bold text-[#C46A40]">₩11,000</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handlePlanAction('크레딧 500 충전')}
                      className="w-full py-2.5 px-4 bg-[#C46A40] hover:bg-[#B55434] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
                    >
                      충전하기
                    </button>

                    <div className="border-t border-[#F1D3C6] pt-4">
                      <span className="text-[11px] font-bold text-[#C46A40] block mb-2.5">포함된 혜택:</span>
                      <ul className="text-xs text-[#524F4A] space-y-2.5">
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                          <span>
                            500 크레딧 즉시 충전
                            <span className="text-[11px] text-[#8C877D] block mt-0.5">(AI 원어주석 500회 or 설교자료 5종 set 25개)</span>
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                          <span>충전일로부터 365일 (1년)</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 주석 클라우드 이용권 안내 및 데이터 보존 고지 */}
          <div className="mt-8 p-6 bg-white border border-[#E8E5DE] rounded-3xl shadow-2xs max-w-3xl mx-auto">
            <div className="flex items-center gap-2 mb-3 text-[#2C2B29]">
              <Shield className="w-4 h-4 text-[#C46A40]" />
              <h4 className="font-bold text-xs sm:text-sm">주석 클라우드 이용권 안내 및 데이터 보존 고지</h4>
            </div>
            <ul className="text-xs text-[#6E6A63] leading-relaxed space-y-2 list-disc pl-4">
              <li>
                유료 맴버쉽이 유지되는 동안 추가 유지 비용 없이 지속적으로 이용하실 수 있습니다.
              </li>
              <li>
                유료 맴버쉽이 종료되면 등록된 1개의 기기에서 데이터의 열람만 가능합니다.
              </li>
              <li>
                유료 맴버쉽 회원은 동일한 로그인 계정을 사용하는 스마트폰, 태블릿, PC 어디서든 개인의 모든 자료와 보관된 주석을 크레딧 차감 없이 열람하실 수 있습니다.
              </li>
              <li>
                증정된 크레딧은 충전일로부터 365일간 유효하며, 필요시 크레딧을 추가 충전하여 계속 연구하실 수 있습니다.
              </li>
              <li>
                향후 서비스 종료 등 불가피한 사유 발생 시 최소 60일 전 사전 공지되며, 회원님의 데이터를 파일(PDF/텍스트)로 영구 소장하실 수 있도록 일괄 백업 기능을 제공합니다.
              </li>
              <li>
                결제하신 크레딧 및 이용권은 디지털 콘텐츠 특성상 1회라도 이용하거나 회원님의 개인적인 사정으로 인한 중도 환불은 불가합니다. 단, 서비스 종료 등 불가피한 사유 발생 시에는 공지일 기준 6개월 이내의 결제 사항에 대해서만 남은 크레딧에 대해 환불해 드립니다.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 4. 자주 묻는 질문 (FAQ) 아코디언 섹션 */}
      <section id="claude-faq-section" className="py-16 px-4 sm:px-6 max-w-3xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#1A1918] text-center mb-8">
          자주 묻는 질문
        </h2>

        <div className="divide-y divide-[#E8E5DE] border-t border-b border-[#E8E5DE]">
          {faqs.map((faq, idx) => {
            const isOpenFaq = openFaqIndex === idx;
            return (
              <div key={idx} className="py-4">
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpenFaq ? null : idx)}
                  className="w-full flex items-center justify-between text-left gap-4 py-2 hover:opacity-80 transition-opacity cursor-pointer"
                >
                  <span className="text-sm sm:text-base font-bold text-[#1A1918]">
                    {faq.q}
                  </span>
                  <span className="text-xl text-[#8C877D] font-light shrink-0">
                    {isOpenFaq ? '−' : '+'}
                  </span>
                </button>

                {isOpenFaq && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="pt-2 pb-3 text-xs sm:text-sm text-[#6E6A63] leading-relaxed"
                  >
                    {faq.a}
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. 최하단 푸터: 네이션스 바이블 공식 로고 및 우리회사 제품들 링크 */}
      <footer className="pt-12 pb-16 px-4 sm:px-6 bg-[#FAF9F5] border-t border-[#E8E5DE] text-xs">
        <div className="max-w-6xl mx-auto">
          {/* 고객지원 문의 박스 */}
          <div className="mb-12 max-w-xl mx-auto">
            <div className="flex items-center gap-2 mb-3">
              <img
                src="/icon.png"
                alt="NATIONS BIBLE"
                className="w-5 h-5 rounded-md object-contain border border-[#E7E2D8]"
              />
              <span className="font-serif font-bold text-[#1A1918] text-sm">NATIONS BIBLE Support</span>
            </div>
            <a
              href="http://pf.kakao.com/_cxjBxaX/chat"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-white border border-[#DDD8CE] hover:border-[#2C2B29] rounded-2xl px-4 py-3 flex items-center justify-between gap-3 shadow-2xs cursor-pointer transition-colors block text-left"
              title="카카오톡 1:1 문의하기"
            >
              <span className="text-xs text-[#8C877D]">
                도움이 필요하신가요? 카카오톡 1:1 문의하기로 실시간 상담하세요...
              </span>
              <div className="w-7 h-7 rounded-xl bg-[#FEE500] text-[#3C1E1E] flex items-center justify-center shrink-0 shadow-2xs">
                <Send className="w-3.5 h-3.5" />
              </div>
            </a>
          </div>

          {/* 4단 링크 그리드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <h5 className="font-bold text-[#2C2B29] text-xs mb-3.5">제품 (Products)</h5>
              <ul className="space-y-2.5 text-[#6E6A63]">
                <li>
                  <button onClick={onClose} className="hover:text-[#2C2B29] hover:underline cursor-pointer">
                    NATIONS BIBLE (성경)
                  </button>
                </li>
                <li>
                  <a
                    href="https://sermon.thenations.kr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer block"
                  >
                    NATIONS SERMON VIDEO
                  </a>
                </li>
                <li>
                  <a
                    href="https://studio.thenations.kr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer block"
                  >
                    NATIONS STUDIO
                  </a>
                </li>
                <li>
                  <a
                    href="https://vote.thenations.kr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer block"
                  >
                    NATIONS VOTE
                  </a>
                </li>
                <li>
                  <span className="hover:text-[#2C2B29] cursor-pointer">
                    NATIONS CHURCH
                  </span>
                </li>
              </ul>
            </div>

            <div>
              <h5 className="font-bold text-[#2C2B29] text-xs mb-3.5">이용권 & 충전</h5>
              <ul className="space-y-2.5 text-[#6E6A63]">
                <li>
                  <button
                    onClick={() => {
                      pricingSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                      setPricingTab('credit');
                    }}
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer"
                  >
                    AI크레딧 충전 플랜
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      pricingSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                      setPricingTab('membership');
                    }}
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer"
                  >
                    클라우드 요금제
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h5 className="font-bold text-[#2C2B29] text-xs mb-3.5">고객지원센터</h5>
              <ul className="space-y-2.5 text-[#6E6A63]">
                <li>
                  <a
                    href="http://pf.kakao.com/_cxjBxaX/chat"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer block"
                  >
                    1:1 카톡 문의하기
                  </a>
                </li>
                <li>
                  <button
                    onClick={() => {
                      const el = document.getElementById('claude-faq-section');
                      el?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer"
                  >
                    자주 묻는 질문 (FAQ)
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setPolicyModal({ isOpen: true, tab: 'business' })}
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer"
                  >
                    사업자 정보 확인
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h5 className="font-bold text-[#2C2B29] text-xs mb-3.5">법률 및 정책</h5>
              <ul className="space-y-2.5 text-[#6E6A63]">
                <li>
                  <button
                    onClick={() => setPolicyModal({ isOpen: true, tab: 'terms' })}
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer"
                  >
                    서비스 이용약관
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setPolicyModal({ isOpen: true, tab: 'privacy' })}
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer"
                  >
                    개인정보 처리방침
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* 전자상거래법 및 PG사 심사 기준 준수 사업자 정보 표기 */}
          <div className="pt-6 border-t border-[#E8E5DE] text-[11px] leading-relaxed text-[#8C877D] space-y-1">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span>상호명: <strong className="text-[#5A564F]">네이션스 솔루션</strong></span>
              <span className="text-[#D6D2C9]">|</span>
              <span>대표자: <strong className="text-[#5A564F]">최희정</strong></span>
              <span className="text-[#D6D2C9]">|</span>
              <span>사업자등록번호: <strong className="text-[#5A564F] font-mono">120-00-00000</strong></span>
              <span className="text-[#D6D2C9]">|</span>
              <span>통신판매업신고: <strong className="text-[#5A564F]">제 2026-경남창원-00000 호</strong></span>
            </div>
            <div>
              <span>사업장 소재지: <strong className="text-[#5A564F]">창원시 마산합포구 산호시장길 40</strong></span>
            </div>
          </div>

          {/* 하단 카피라이트 및 법적 고지 */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-[#8C877D]">
            <div className="flex items-center gap-2">
              <img
                src="/icon.png"
                alt="NATIONS BIBLE"
                className="w-4 h-4 rounded object-contain border border-[#E7E2D8]"
              />
              <span>© {new Date().getFullYear()} NATIONS BIBLE. All rights reserved.</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setPolicyModal({ isOpen: true, tab: 'terms' })}
                className="hover:text-[#2C2B29] cursor-pointer"
              >
                이용약관
              </button>
              <button
                onClick={() => setPolicyModal({ isOpen: true, tab: 'privacy' })}
                className="hover:text-[#2C2B29] cursor-pointer"
              >
                개인정보처리방침
              </button>
              {!requiredLogin && (
                <button
                  onClick={onClose}
                  className="text-[#2C2B29] font-bold hover:underline cursor-pointer"
                >
                  성경 읽기 복귀 →
                </button>
              )}
            </div>
          </div>
        </div>
      </footer>

      {/* 이용약관 & 개인정보 처리방침 모달 */}
      <PolicyViewModal
        isOpen={policyModal.isOpen}
        initialTab={policyModal.tab}
        onClose={() => setPolicyModal({ isOpen: false, tab: 'terms' })}
      />
    </div>
  );
};
