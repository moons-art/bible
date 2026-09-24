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

  // 이용권 탭 ('credit': AI크레딧 | 'cloud': 주석 클라우드)
  const [pricingTab, setPricingTab] = useState<'credit' | 'cloud'>('credit');

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
        if (e.key === 'Escape') onClose();
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

  // 플랜 선택 및 액션 핸들러 (비로그인 상태일 때는 무료플랜을 포함한 모든 플랜이 상단 로그인 화면으로 부드럽게 스크롤 이동)
  const handlePlanAction = (planName: string, isFreePlan = false) => {
    if (!currentUser) {
      alert(`${planName} 이용을 위해 먼저 로그인을 진행해주세요.\n상단 로그인 화면으로 이동합니다.`);
      loginSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (isFreePlan) {
      // 이미 로그인된 상태에서 무료 플랜 선택 시 성경 본문 읽기로 이동
      onClose();
      return;
    }

    alert(`[${planName}] 결제 모듈 연동 준비 중입니다.\n관리자 승인 또는 친구 추천을 통해 무료 크레딧을 받으실 수 있습니다!`);
  };

  // FAQ 목록 데이터 (사용자 요청 반영)
  const faqs = [
    {
      q: 'NATIONS BIBLE AI 이란?',
      a: 'NATIONS BIBLE AI는 내가 만드는 나만의 주석앱입니다. 모든 연구자가 대부분의 주석과 정보 접근이 가능한 정보 홍수 시대에 단지 주석을 하나 찾아보는 정도가 아니라, 내 신학에 맞는 해석과 흩어져 있는 내 메모를 통합하여 각 구절마다 나만의 주석을 완성하는 앱입니다.'
    },
    {
      q: 'NATIONS BIBLE AI 기능은?',
      a: '성경앱의 기본인 성경번역본 비교 검색, 나만의 번역본 추가, 설교준비 위한 번역본 듀얼 뷰, 설교노트, 구절별 ai주석 생성 및 저장, 구절별 나만의 노트, 주석, 관주 저장 이 모든 기능을 주석 클라우드 서비스로 통합하여 모든 기기에 실시간 연동됩니다.'
    },
    {
      q: '성경 번역본 추가 및 이용은 무료인가요?',
      a: '네, 기본 제공되는 개역한글(1961), KJV(1611) 은 저작권이 만료되어 누구나 자유롭게 연구에 활용하실 수 있습니다. 우리 앱은 사용자가 직접 소장한 연구용 텍스트 자료를 개인 기기에서 열람할 수 있는 맞춤형 뷰어로서 +번역본 추가 기능을 제공하며, 앱 내에서 번역본을 무단 제공하거나 이에 대한 과금을 요구하지 않습니다. 사용자가 보유한 개인 연구 파일(.txt)을 본인의 기기(로컬 브라우저)에 불러오는 기술적인 방법은 1:1로 무료 문의하시거나 [설정]을 참고하시기 바랍니다.'
    },
    {
      q: 'AI 크레딧은 어떻게 차감되며 유효기간은 얼마인가요?',
      a: '구절 및 단어의 심층 주석을 생성할 때마다 1회씩 차감됩니다. 충전하신 유료 크레딧은 충전일로부터 365일(1년) 동안 보존되며, 프로 플랜의 경우 유효기간 제한 없이 평생 영구 사용하실 수 있습니다.'
    },
    {
      q: '주석 클라우드 평생보관권과 일반 보관은 어떤 차이가 있나요?',
      a: '일반 보관은 현재 사용 중인 기기에 30일 동안 저장됩니다. 반면 주석 클라우드 평생보관권을 구매하시면 생성된 모든 주석이 서버 클라우드에 영구 저장되어, 스마트폰·태블릿·PC 어디서나 크레딧 차감 없이 평생 다시 열람하실 수 있습니다.'
    },
    {
      q: 'PC, 태블릿, 스마트폰 등 다양한 기기에서 연동되나요?',
      a: '네, NATIONS BIBLE은 반응형 웹 기술을 적용하여 모든 화면 크기에 최적화되어 있습니다. 작성하신 메모, 노트, 모든 데이터가 모든 기기에서 실시간으로 안전하게 동기화됩니다. 하지만, 성경연구 특성상 넓은 데스트탑 화면이나 테블릿에서 연구하시는 것이 모든 기능을 편하게 이용하실 수 있습니다.'
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
              이용권 안내
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

            {/* 성경으로 돌아가기 (닫기) 버튼 */}
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-white hover:bg-[#F3EFE9] border border-[#DDD8CE] text-[#2C2B29] rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer"
              title="성경 본문으로 돌아가기"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#6E6A63]" />
              <span>성경 읽기</span>
              <X className="w-3.5 h-3.5 text-[#8C877D] ml-1" />
            </button>
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

          {/* 요청하신 서브카피 반영 */}
          <p className="text-sm sm:text-base text-[#6E6A63] max-w-lg mb-8 leading-relaxed">
            원어 분석부터 나만의 주석까지,<br className="sm:hidden" />
            NATIONS BIBLE AI와 함께 말씀의 깊이를 경험하세요.
          </p>

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
                    {currentUser.email} 계정으로 로그인되어 있습니다.
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
                {/* 1. 구글로 계속하기 버튼 */}
                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="w-full py-3.5 px-4 bg-white hover:bg-[#FAF9F5] active:bg-[#F5F2EB] border border-[#DDD8CE] text-[#2C2B29] rounded-2xl font-semibold text-sm flex items-center justify-center gap-3 transition-all shadow-2xs hover:shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span>Google로 계속하기</span>
                </button>

                {/* 2. 구분선 '또는' */}
                <div className="relative flex items-center justify-center my-1">
                  <div className="border-t border-[#E8E5DE] w-full" />
                  <span className="bg-white px-3 text-xs text-[#8C877D] font-normal shrink-0">
                    또는
                  </span>
                </div>

                {/* 3. 이메일로 계속하기 버튼: 요청하신 검정 버튼 적용 */}
                <button
                  type="button"
                  onClick={() => {
                    setShowEmailAuth(!showEmailAuth);
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className="w-full py-3.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] active:bg-black text-white rounded-2xl font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                >
                  <Mail className="w-4 h-4 text-white/80" />
                  <span>이메일로 계속하기</span>
                  {showEmailAuth ? (
                    <ChevronUp className="w-3.5 h-3.5 text-white/80" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-white/80" />
                  )}
                </button>

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

      {/* 3. 이용권 살펴보기 섹션 (요청하신 타이틀 및 탭 변경 적용) */}
      <section ref={pricingSectionRef} className="py-16 px-4 sm:px-6 bg-[#F5F2EB]/50 border-t border-[#E8E5DE]">
        <div className="max-w-6xl mx-auto">
          {/* 섹션 타이틀: "이용권 살펴보기" */}
          <div className="text-center max-w-xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#1A1918] mb-3">
              이용권 살펴보기
            </h2>
            <p className="text-xs sm:text-sm text-[#6E6A63] mb-6">
              필요에 맞는 최적의 연구 플랜을 선택하고 연구를 확장하세요.
            </p>

            {/* 탭 토글: [AI 크레딧 충전 플랜] / [주석 클라우드 이용권] */}
            <div className="inline-flex bg-[#EAE6DE] p-1 rounded-2xl">
              <button
                onClick={() => setPricingTab('credit')}
                className={`px-4 sm:px-6 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  pricingTab === 'credit'
                    ? 'bg-white text-[#2C2B29] shadow-xs'
                    : 'text-[#6E6A63] hover:text-[#2C2B29]'
                }`}
              >
                AI 크레딧 충전 플랜
              </button>
              <button
                onClick={() => setPricingTab('cloud')}
                className={`px-4 sm:px-6 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  pricingTab === 'cloud'
                    ? 'bg-white text-[#2C2B29] shadow-xs'
                    : 'text-[#6E6A63] hover:text-[#2C2B29]'
                }`}
              >
                주석 클라우드 이용권
              </button>
            </div>
          </div>

          {pricingTab === 'credit' ? (
            /* AI크레딧 플랜 그리드: Free / 라이트 / 스탠다드 / 프로 (반응형 4열) */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* 1. Free 플랜 (바탕 없는 아이콘 적용) */}
              <div className="bg-white border border-[#E8E5DE] rounded-3xl p-6 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                <div>
                  {/* 바탕 없는 순수 아이콘 */}
                  <Sparkles className="w-7 h-7 text-[#7A756D] mb-3 stroke-[1.8px]" />
                  <h3 className="text-xl font-bold text-[#1A1918]">Free</h3>
                  {/* 요청하신 부제목 변경 */}
                  <p className="text-xs font-medium text-[#C46A40] mt-1 mb-4">AI를 제외한 모든 것 free</p>

                  <div className="mb-6">
                    <div className="text-3xl font-serif font-bold text-[#1A1918]">₩0</div>
                    <div className="text-xs text-[#8C877D] mt-0.5">모두에게 무료</div>
                  </div>

                  <button
                    onClick={() => handlePlanAction('Free 플랜', true)}
                    className="w-full py-2.5 px-4 bg-[#F5F3ED] hover:bg-[#EAE6DE] text-[#2C2B29] rounded-xl text-xs font-bold transition-all cursor-pointer mb-6"
                  >
                    성경 무료로 사용해 보기
                  </button>

                  <div className="border-t border-[#EFECE6] pt-4">
                    <span className="text-[11px] font-bold text-[#5A564F] block mb-2.5">포함된 혜택:</span>
                    <ul className="text-xs text-[#6E6A63] space-y-2.5">
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                        <span>웹, iOS, Android 및 데스크톱에서 성경 열람</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                        <span>다양한 성경 역본 검색</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                        <span>매월 AI 주석 10 크레딧 무료 제공</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                        <span>나만의 구절 노트, 주석 작성, 설교노트 제공</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                        <span>ai 주석 해당 기기에 30일 보관</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* 2. 라이트 플랜 (5,000원 - FREE와 동일한 아이콘 색상 text-[#7A756D]) */}
              <div className="bg-white border border-[#E8E5DE] rounded-3xl p-6 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                <div>
                  {/* FREE와 동일한 아이콘 색상 */}
                  <Sparkles className="w-7 h-7 text-[#7A756D] mb-3 stroke-[1.8px]" />
                  <h3 className="text-xl font-bold text-[#1A1918]">라이트 플랜</h3>
                  <p className="text-xs text-[#7A756D] mt-1 mb-4">개인 말씀 묵상 및 성경 공부를 위한</p>

                  <div className="mb-6">
                    <div className="text-3xl font-serif font-bold text-[#C46A40]">₩5,000</div>
                    <div className="text-xs text-[#8C877D] mt-0.5">AI 주석 200 크레딧 (1년 유효)</div>
                  </div>

                  <button
                    onClick={() => handlePlanAction('라이트 플랜')}
                    className="w-full py-2.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
                  >
                    충전하기
                  </button>

                  <div className="border-t border-[#EFECE6] pt-4">
                    <span className="text-[11px] font-bold text-[#5A564F] block mb-2.5">Free의 모든 혜택 +</span>
                    <ul className="text-xs text-[#6E6A63] space-y-2.5">
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span><strong>AI 주석 200 크레딧</strong> 즉시 지급</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>히브리어/헬라어 원어 심층 연구</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>충전일로부터 365일(1년) 여유 있는 유효기간</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>기기에 30일 안전 저장</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* 3. 스탠다드 플랜 (10,000원 - FREE와 동일한 아이콘 색상 text-[#7A756D]) */}
              <div className="bg-white border border-[#E8E5DE] rounded-3xl p-6 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                <div>
                  {/* FREE와 동일한 아이콘 색상 */}
                  <CreditCard className="w-7 h-7 text-[#7A756D] mb-3 stroke-[1.8px]" />
                  <h3 className="text-xl font-bold text-[#1A1918]">스탠다드 플랜</h3>
                  <p className="text-xs text-[#7A756D] mt-1 mb-4">정기적인 성경 연구와 주석 활용을 위한</p>

                  <div className="mb-6">
                    <div className="text-3xl font-serif font-bold text-[#C46A40]">₩10,000</div>
                    <div className="text-xs text-[#8C877D] mt-0.5">AI 주석 500 크레딧 (1년 유효)</div>
                  </div>

                  <button
                    onClick={() => handlePlanAction('스탠다드 플랜')}
                    className="w-full py-2.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
                  >
                    충전하기
                  </button>

                  <div className="border-t border-[#EFECE6] pt-4">
                    <span className="text-[11px] font-bold text-[#5A564F] block mb-2.5">Free의 모든 혜택 +</span>
                    <ul className="text-xs text-[#6E6A63] space-y-2.5">
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span><strong>AI 주석 500 크레딧</strong> 즉시 지급</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>히브리어/헬라어 원어 심층 연구</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>충전일로부터 365일(1년) 여유 있는 유효기간</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>기기에 30일 안전 저장</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* 4. 프로 플랜 (15,000원 - FREE와 동일한 아이콘 색상, 클라우드 제공 문구 및 30일 안내 문구 추가) */}
              <div className="bg-[#FFFBF8] border-2 border-[#C46A40] rounded-3xl p-6 flex flex-col justify-between shadow-md relative">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-0.5 rounded-full bg-[#C46A40] text-white text-[11px] font-bold tracking-tight shadow-sm">
                  목회자 추천 플랜
                </span>
                <div>
                  {/* FREE와 동일한 아이콘 색상 */}
                  <Sparkles className="w-7 h-7 text-[#7A756D] mb-3 stroke-[1.8px]" />
                  <h3 className="text-xl font-bold text-[#1A1918]">프로 플랜 (Pro)</h3>
                  <p className="text-xs text-[#7A756D] mt-1 mb-4">설교 준비와 깊은 강해 연구를 위한</p>

                  <div className="mb-6">
                    <div className="text-3xl font-serif font-bold text-[#1A1918]">₩15,000</div>
                    {/* 요청하신 문구 수정 */}
                    <div className="text-xs text-[#C46A40] font-bold mt-0.5">AI 주석 1,000 크레딧, 클라우드 제공</div>
                  </div>

                  <button
                    onClick={() => handlePlanAction('프로 플랜 (Pro)')}
                    className="w-full py-2.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
                  >
                    충전하기
                  </button>

                  <div className="border-t border-[#F1D3C6] pt-4">
                    <span className="text-[11px] font-bold text-[#C46A40] block mb-2.5">스탠다드의 모든 혜택, 추가로:</span>
                    <ul className="text-xs text-[#524F4A] space-y-2.5">
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span><strong>AI 주석 1,000 크레딧 대용량 제공</strong></span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>모든 노트, 메모, 설교노트 클라우드 평생 저장</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>모든 기기 실시간 연동 (AI 주석 제외)</span>
                      </li>
                      {/* 요청하신 추가 문구 */}
                      <li className="flex items-start gap-2 pl-6 -mt-1">
                        <span className="text-[11px] text-[#7A756D] leading-relaxed">
                          (AI 주석은 기기에 30일 저장, 저장된 기기에서 열람가능)
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>우선순위 AI 처리 속도 지원</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* 주석 클라우드 3개 플랜 (아이콘 흐린 검은색, 혜택 문구 및 검은색 구매 버튼 통일) */
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {/* 클라우드 플랜 1: 주석 클라우드 300 */}
              <div className="bg-white border border-[#E8E5DE] rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                <div>
                  {/* 약간 흐린 검은색 아이콘 */}
                  <Database className="w-7 h-7 text-[#4A4741] mb-3 stroke-[1.8px]" />
                  <h3 className="text-xl font-bold text-[#1A1918]">주석 클라우드 300</h3>
                  <p className="text-xs text-[#7A756D] mt-1 mb-4">개인 서재 주석 보관 시작하기</p>

                  <div className="mb-6">
                    <div className="text-3xl font-serif font-bold text-[#C46A40]">₩19,000</div>
                    {/* 요청하신 가격 아래 문구 수정 */}
                    <div className="text-xs text-[#8C877D] mt-0.5">AI주석 300구절 평생보관 + 200 크레딧 증정</div>
                  </div>

                  <button
                    onClick={() => handlePlanAction('주석 클라우드 300')}
                    className="w-full py-2.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
                  >
                    구매하기
                  </button>

                  <div className="border-t border-[#EFECE6] pt-4">
                    <span className="text-[11px] font-bold text-[#5A564F] block mb-2.5">포함된 혜택:</span>
                    <ul className="text-xs text-[#6E6A63] space-y-2.5">
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>생성된 주석 <strong>300구절 평생보관</strong></span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        {/* 요청하신 증정 문구 수정 */}
                        <span><strong>+200 AI 주석 크레딧 (라이트플랜 증정)</strong></span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>모든 기기 실시간 연동</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>모든 노트, 메모, 설교노트 클라우드 평생 저장</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* 클라우드 플랜 2: 주석 클라우드 1000 (가장 인기 - 검은색 구매 버튼으로 통일) */}
              <div className="bg-[#FFFBF8] border-2 border-[#C46A40] rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-md relative">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-0.5 rounded-full bg-[#C46A40] text-white text-[11px] font-bold tracking-tight shadow-sm">
                  가장 인기
                </span>
                <div>
                  {/* 약간 흐린 검은색 아이콘 */}
                  <Database className="w-7 h-7 text-[#4A4741] mb-3 stroke-[1.8px]" />
                  <h3 className="text-xl font-bold text-[#1A1918]">주석 클라우드 1000</h3>
                  <p className="text-xs text-[#7A756D] mt-1 mb-4">평생 보관 나만의 디지털 서재 구축</p>

                  <div className="mb-6">
                    <div className="text-3xl font-serif font-bold text-[#C46A40]">₩35,000</div>
                    {/* 요청하신 가격 아래 문구 수정 */}
                    <div className="text-xs text-[#8C877D] mt-0.5">AI주석 1,000구절 평생보관 + 500 크레딧 증정</div>
                  </div>

                  {/* 요청하신 검은색 버튼으로 통일 */}
                  <button
                    onClick={() => handlePlanAction('주석 클라우드 1000')}
                    className="w-full py-2.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
                  >
                    구매하기
                  </button>

                  <div className="border-t border-[#F1D3C6] pt-4">
                    <span className="text-[11px] font-bold text-[#C46A40] block mb-2.5">포함된 혜택:</span>
                    <ul className="text-xs text-[#524F4A] space-y-2.5">
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>생성된 주석 <strong>1,000구절 평생보관</strong></span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        {/* 요청하신 증정 문구 수정 */}
                        <span><strong>+500 AI 주석 크레딧 (스탠다드 플랜 증정)</strong></span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        {/* 요청하신 문구 수정: 모든 기기 실시간 영구 연동 */}
                        <span>모든 기기 실시간 영구 연동</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                        <span>모든 노트, 메모, 설교노트 클라우드 평생 저장</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* 클라우드 플랜 3: 주석 클라우드 무제한 */}
              <div className="bg-white border border-[#E8E5DE] rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                <div>
                  {/* 약간 흐린 검은색 아이콘 */}
                  <Database className="w-7 h-7 text-[#4A4741] mb-3 stroke-[1.8px]" />
                  <h3 className="text-xl font-bold text-[#1A1918]">주석 클라우드 무제한</h3>
                  <p className="text-xs text-[#7A756D] mt-1 mb-4">성경 전권 무제한 영구 보관 아카이브</p>

                  <div className="mb-6">
                    <div className="text-3xl font-serif font-bold text-[#2C2B29]">₩49,000</div>
                    {/* 요청하신 가격 아래 문구 수정 */}
                    <div className="text-xs text-[#8C877D] mt-0.5">AI주석 성경전체 평생보관 + 1,000 크레딧 증정</div>
                  </div>

                  <button
                    onClick={() => handlePlanAction('주석 클라우드 무제한')}
                    className="w-full py-2.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
                  >
                    구매하기
                  </button>

                  <div className="border-t border-[#EFECE6] pt-4">
                    <span className="text-[11px] font-bold text-[#5A564F] block mb-2.5">포함된 혜택:</span>
                    <ul className="text-xs text-[#6E6A63] space-y-2.5">
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#2C2B29] shrink-0 mt-0.5" />
                        <span><strong>성경 전체 66권 주석 평생 무제한 보관</strong></span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#2C2B29] shrink-0 mt-0.5" />
                        {/* 요청하신 증정 문구 수정 */}
                        <span><strong>+1,000 AI 주석 크레딧 (프로 플랜 증정)</strong></span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#2C2B29] shrink-0 mt-0.5" />
                        <span>모든 기기 실시간 영구 연동</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#2C2B29] shrink-0 mt-0.5" />
                        <span>모든 노트, 메모, 설교노트 클라우드 평생 저장</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 친구 추천 특별 보너스 배너 */}
          <div className="mt-10 p-6 bg-white border border-[#E8E5DE] rounded-3xl shadow-2xs max-w-3xl mx-auto">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 text-left">
                <Gift className="w-8 h-8 text-[#C46A40] shrink-0 stroke-[1.8px]" />
                <div>
                  <h4 className="text-sm font-bold text-[#1A1918]">동역자·친구 추천 보너스</h4>
                  <p className="text-xs text-[#6E6A63] mt-0.5">
                    NATIONS BIBLE을 친구에게 추천하시면 <strong>AI 50회</strong>를 무료로 충전해 드립니다!
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsReferralOpen(!isReferralOpen)}
                className="w-full sm:w-auto px-4 py-2.5 bg-[#2C2B29] hover:bg-[#1A1918] text-white text-xs font-bold rounded-xl shrink-0 transition-colors shadow-2xs cursor-pointer"
              >
                {isReferralOpen ? '닫기' : '추천 보너스 신청하기'}
              </button>
            </div>

            {isReferralOpen && (
              <form onSubmit={handleSubmitReferral} className="mt-4 pt-4 border-t border-[#EFECE6] space-y-3">
                <div className="p-3 rounded-xl bg-[#FAF0EB]/60 border border-[#F5D8CB] text-xs text-[#C46A40]">
                  💡 회원가입하신 구글/이메일 주소를 적어주시면 관리자 확인 후 즉시 보너스 크레딧이 적립됩니다.
                </div>

                {referralFeedback && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                      referralFeedback.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {referralFeedback.type === 'success' ? (
                      <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    )}
                    <span>{referralFeedback.message}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#5A564F] mb-1">나의 가입 이메일</label>
                    <input
                      type="email"
                      placeholder="내 이메일 주소"
                      value={referrerEmailInput}
                      onChange={(e) => setReferrerEmailInput(e.target.value)}
                      className="w-full px-3.5 py-2 bg-[#FAF9F5] border border-[#DDD8CE] rounded-xl text-xs text-[#2C2B29] outline-none focus:border-[#C46A40]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#5A564F] mb-1">내가 추천하여 가입한 친구 이메일</label>
                    <input
                      type="email"
                      placeholder="친구 이메일 주소"
                      value={friendEmailInput}
                      onChange={(e) => setFriendEmailInput(e.target.value)}
                      className="w-full px-3.5 py-2 bg-[#FAF9F5] border border-[#DDD8CE] rounded-xl text-xs text-[#2C2B29] outline-none focus:border-[#C46A40]"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingReferral}
                  className="w-full py-2.5 bg-[#2C2B29] hover:bg-[#1A1918] text-white text-xs font-bold rounded-xl transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmittingReferral ? '신청 처리 중...' : '친구 추천 보너스 (+50회) 신청하기'}</span>
                </button>
              </form>
            )}
          </div>

          {/* 주석 클라우드 이용권 안내 및 서비스 운영/데이터 보존 고지문 (자주 묻는 질문 바로 위) */}
          <div className="mt-8 p-6 bg-white border border-[#E8E5DE] rounded-3xl shadow-2xs max-w-3xl mx-auto">
            <div className="flex items-center gap-2 mb-3 text-[#2C2B29]">
              <Shield className="w-4 h-4 text-[#C46A40]" />
              <h4 className="font-bold text-xs sm:text-sm">주석 클라우드 이용권 안내 및 데이터 보존 고지</h4>
            </div>
            <ul className="text-xs text-[#6E6A63] leading-relaxed space-y-2 list-disc pl-4">
              <li>
                주석 클라우드 보관 서비스는 네이션스 바이블 서비스 운영 기간 동안 월 구독료나 추가 유지 비용 없이 지속적으로 이용하실 수 있습니다.
              </li>
              <li>
                동일한 로그인 계정(Google/이메일)을 사용하시면 스마트폰, 태블릿, PC 어디서든 보관된 주석을 크레딧 차감 없이 무료로 열람하실 수 있습니다.
              </li>
              <li>
                기본 증정된 AI 크레딧은 충전일로부터 365일간 유효하며, 필요시 일반 크레딧을 추가 충전하여 계속 연구하실 수 있습니다.
              </li>
              <li>
                향후 서비스 종료 등 불가피한 사유 발생 시 최소 60일 전 사전 공지되며, 회원님이 정성껏 축적하신 주석 데이터를 파일(PDF/텍스트)로 영구 소장하실 수 있도록 일괄 백업 기능을 제공합니다.
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
                  <span className="hover:text-[#2C2B29] cursor-pointer">
                    NATIONS STUDIO
                  </span>
                </li>
                <li>
                  <span className="hover:text-[#2C2B29] cursor-pointer">
                    NATIONS VOTE
                  </span>
                </li>
                <li>
                  <span className="hover:text-[#2C2B29] cursor-pointer">
                    NATIONS CHURCH
                  </span>
                </li>
                <li>
                  <span className="hover:text-[#2C2B29] cursor-pointer">
                    AI 주석 연구 엔진
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
                      setPricingTab('cloud');
                    }}
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer"
                  >
                    주석 클라우드 보관권
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      pricingSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                      setIsReferralOpen(true);
                    }}
                    className="hover:text-[#C46A40] font-semibold cursor-pointer"
                  >
                    친구 추천 혜택 (+50회)
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

          {/* 하단 카피라이트 및 법적 고지 */}
          <div className="pt-6 border-t border-[#E8E5DE] flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-[#8C877D]">
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
              <button
                onClick={onClose}
                className="text-[#2C2B29] font-bold hover:underline cursor-pointer"
              >
                성경 읽기 복귀 →
              </button>
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
