import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, Sparkles, CheckCircle2, AlertCircle, ArrowRight, KeyRound, Eye, EyeOff } from 'lucide-react';
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth, googleProvider } from '../api/firebaseConfig';
import { syncUserProfile } from '../services/userService';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
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

  if (!isOpen) return null;

  // 구글 로그인 실행
  const handleGoogleLogin = async () => {
    // 이미 Firebase 로그인된 경우 팝업 없이 즉시 닫기
    if (auth.currentUser) {
      if (onSuccess) onSuccess();
      onClose();
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        try {
          await syncUserProfile(result.user);
        } catch (e) {
          console.warn('[AuthModal] Google syncUserProfile non-fatal:', e);
        }
        if (onSuccess) onSuccess();
        onClose();
      }
    } catch (err: any) {
      console.error('[AuthModal] Google login error:', err);
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

  // 비밀번호 재설정 이메일 발송
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
      console.error('[AuthModal] Password reset error:', err);
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

  // 이메일 로그인 / 회원가입 실행
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
        // 신규 회원가입
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (displayName.trim()) {
          await updateProfile(cred.user, { displayName: displayName.trim() });
        }
        try {
          await syncUserProfile(cred.user);
        } catch (e) {
          console.warn('[AuthModal] syncUserProfile non-fatal:', e);
        }
        alert('회원가입이 완료되었습니다! 환영합니다.');
      } else {
        // 기존 로그인
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        try {
          await syncUserProfile(cred.user);
        } catch (e) {
          console.warn('[AuthModal] syncUserProfile non-fatal:', e);
        }
      }

      // 로그인 성공 시 팝업 닫기 확실히 보장
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[AuthModal] Email auth error:', err);
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

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/45 backdrop-blur-xs"
      />

      {/* Modal Container */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="relative w-full max-w-md bg-[#FAF9F5] rounded-3xl border border-[#E7E5DF] shadow-2xl overflow-hidden flex flex-col z-10"
      >
        {/* Header */}
        <div className="p-5 border-b border-[#E7E5DF] bg-[#F7F5F0] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img 
              src="/icon.png" 
              alt="NATIONS BIBLE" 
              className="w-8 h-8 rounded-xl object-contain border border-[#E7E2D8] shadow-2xs" 
            />
            <div>
              <h2 className="font-serif text-base font-bold text-[#2C2B29] tracking-tight">NATIONS BIBLE</h2>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-[#EAE4DA] rounded-lg transition-colors text-[#8C877D] hover:text-[#2C2B29] cursor-pointer"
          >
            <X className="w-4 h-4 stroke-[1.8px]" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-5 max-h-[80vh] overflow-y-auto custom-scrollbar">
          {/* 1. 구글 연동 안내 권장 배너 */}
          <div className="p-3.5 bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-[#FAF0EB] text-[#C46A40] flex items-center justify-center shrink-0 mt-0.5">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="text-xs text-[#524F4A] leading-relaxed flex-1">
              <p className="font-bold text-[#2C2B29] mb-1">Google 계정 로그인 권장</p>
              <p className="text-[11px] text-[#78746D] mb-2">
                모든 네이션스 서비스와 연동됩니다.
              </p>
              <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                <span className="text-[10px] font-semibold tracking-tight py-1 px-2 bg-[#FAF9F5] text-[#5A564F] rounded-lg border border-[#EAE6DE] text-center flex items-center justify-center">
                  NATIONS STUDIO
                </span>
                <span className="text-[10px] font-semibold tracking-tight py-1 px-2 bg-[#FAF0EB] text-[#C46A40] rounded-lg border border-[#F1D3C6] text-center flex items-center justify-center">
                  NATIONS BIBLE
                </span>
                <span className="text-[10px] font-semibold tracking-tight py-1 px-2 bg-[#FAF9F5] text-[#5A564F] rounded-lg border border-[#EAE6DE] text-center flex items-center justify-center">
                  NATIONS VOTE
                </span>
                <span className="text-[10px] font-semibold tracking-tight py-1 px-2 bg-[#FAF9F5] text-[#5A564F] rounded-lg border border-[#EAE6DE] text-center flex items-center justify-center">
                  NATIONS CHURCH
                </span>
              </div>
            </div>
          </div>

          {/* 2. 최우선 Google 로그인 버튼 */}
          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full py-3 px-4 bg-white hover:bg-[#F5F3ED] border border-[#DDD8CE] text-[#2C2B29] rounded-xl font-medium text-xs flex items-center justify-center gap-2.5 transition-all shadow-2xs hover:shadow-xs cursor-pointer disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>Google 계정으로 계속하기</span>
          </button>

          {/* Divider */}
          <div className="relative flex items-center justify-center my-1">
            <div className="border-t border-[#E7E5DF] w-full" />
            <span className="bg-[#FAF9F5] px-3 text-[11px] text-[#A39E94] shrink-0 font-sans">
              또는 일반 이메일로 계속하기
            </span>
          </div>

          {/* 비밀번호 재설정 모드일 때 */}
          {isResetMode ? (
            <div className="flex flex-col gap-3 bg-white p-4 rounded-2xl border border-[#E7E5DF] shadow-2xs">
              <div className="flex items-center gap-2 text-[#2C2B29]">
                <KeyRound className="w-4 h-4 text-[#C46A40]" />
                <h3 className="font-bold text-xs">비밀번호 재설정 이메일 발송</h3>
              </div>
              <p className="text-[11px] text-[#6E6A63] leading-relaxed">
                가입하신 이메일 주소를 입력하시면 비밀번호를 안전하게 재설정할 수 있는 확인 메일을 보내드립니다.
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

              <form onSubmit={handlePasswordReset} className="flex flex-col gap-3 mt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-[#6E6A63] mb-1">이메일 주소</label>
                  <div className="relative">
                    <input
                      type="email"
                      placeholder="example@naver.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-[#FAF9F5] border border-[#DDD8CE] focus:border-[#C46A40] focus:ring-2 focus:ring-[#C46A40]/10 rounded-xl px-3.5 py-2 pl-9 text-xs text-[#2C2B29] outline-none transition-all placeholder:text-[#A39E94]"
                      required
                    />
                    <Mail className="w-4 h-4 text-[#A39E94] absolute left-3 top-2.5 stroke-[1.6px]" />
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 py-2 bg-[#C46A40] hover:bg-[#B55434] active:bg-[#9B4527] text-white rounded-xl text-xs font-semibold transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    확인 메일 보내기
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsResetMode(false); setErrorMsg(null); setSuccessMsg(null); }}
                    className="px-3 py-2 bg-[#F5F3ED] hover:bg-[#EAE4DA] text-[#6E6A63] rounded-xl text-xs font-medium transition-colors cursor-pointer"
                  >
                    로그인으로 돌아가기
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              {/* 3. 이메일 탭 (로그인 / 회원가입) */}
              <div className="flex bg-[#F0EEE6] p-1 rounded-xl">
                <button
                  onClick={() => { setTab('login'); setPasswordConfirm(''); setErrorMsg(null); setSuccessMsg(null); }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${tab === 'login' ? 'bg-white text-[#2C2B29] shadow-2xs' : 'text-[#8C877D] hover:text-[#2C2B29]'}`}
                >
                  로그인
                </button>
                <button
                  onClick={() => { setTab('signup'); setPasswordConfirm(''); setErrorMsg(null); setSuccessMsg(null); }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${tab === 'signup' ? 'bg-white text-[#2C2B29] shadow-2xs' : 'text-[#8C877D] hover:text-[#2C2B29]'}`}
                >
                  간편 회원가입
                </button>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* 4. 이메일 폼 */}
              <form onSubmit={handleEmailAuth} className="flex flex-col gap-3">
                {tab === 'signup' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-[#6E6A63] mb-1">
                      이름 <span className="text-[#C46A40] font-bold">(반드시 본명)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="홍길동 (본명 입력)"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-white border border-[#DDD8CE] focus:border-[#C46A40] focus:ring-2 focus:ring-[#C46A40]/10 rounded-xl px-3.5 py-2 text-xs text-[#2C2B29] outline-none transition-all placeholder:text-[#A39E94]"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-[#6E6A63] mb-1">이메일 주소</label>
                  <div className="relative">
                    <input
                      type="email"
                      placeholder="example@naver.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-white border border-[#DDD8CE] focus:border-[#C46A40] focus:ring-2 focus:ring-[#C46A40]/10 rounded-xl px-3.5 py-2 pl-9 text-xs text-[#2C2B29] outline-none transition-all placeholder:text-[#A39E94]"
                      required
                    />
                    <Mail className="w-4 h-4 text-[#A39E94] absolute left-3 top-2.5 stroke-[1.6px]" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-semibold text-[#6E6A63]">
                      비밀번호 {tab === 'signup' ? '(6자 이상)' : ''}
                    </label>
                    {tab === 'login' && (
                      <button
                        type="button"
                        onClick={() => { setIsResetMode(true); setErrorMsg(null); setSuccessMsg(null); }}
                        className="text-[10px] text-[#C46A40] hover:underline cursor-pointer"
                      >
                        비밀번호를 잊으셨나요?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-white border border-[#DDD8CE] focus:border-[#C46A40] focus:ring-2 focus:ring-[#C46A40]/10 rounded-xl px-3.5 py-2 pl-9 pr-10 text-xs text-[#2C2B29] outline-none transition-all placeholder:text-[#A39E94]"
                      required
                    />
                    <Lock className="w-4 h-4 text-[#A39E94] absolute left-3 top-2.5 stroke-[1.6px]" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-[#A39E94] hover:text-[#2C2B29] transition-colors cursor-pointer"
                      title={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4 stroke-[1.6px]" /> : <Eye className="w-4 h-4 stroke-[1.6px]" />}
                    </button>
                  </div>
                </div>

                {tab === 'signup' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-[#6E6A63]">비밀번호 확인</label>
                      {password && passwordConfirm && (
                        <span className={`text-[10px] font-medium ${password === passwordConfirm ? 'text-emerald-600' : 'text-red-500'}`}>
                          {password === passwordConfirm ? '✓ 일치합니다' : '✕ 일치하지 않습니다'}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type={showPasswordConfirm ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={passwordConfirm}
                        onChange={(e) => setPasswordConfirm(e.target.value)}
                        className={`w-full bg-white border rounded-xl px-3.5 py-2 pl-9 pr-10 text-xs text-[#2C2B29] outline-none transition-all placeholder:text-[#A39E94] ${
                          passwordConfirm && password !== passwordConfirm 
                            ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-400/10' 
                            : 'border-[#DDD8CE] focus:border-[#C46A40] focus:ring-2 focus:ring-[#C46A40]/10'
                        }`}
                        required
                      />
                      <Lock className="w-4 h-4 text-[#A39E94] absolute left-3 top-2.5 stroke-[1.6px]" />
                      <button
                        type="button"
                        onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                        className="absolute right-3 top-2.5 text-[#A39E94] hover:text-[#2C2B29] transition-colors cursor-pointer"
                        title={showPasswordConfirm ? '비밀번호 숨기기' : '비밀번호 보기'}
                      >
                        {showPasswordConfirm ? <EyeOff className="w-4 h-4 stroke-[1.6px]" /> : <Eye className="w-4 h-4 stroke-[1.6px]" />}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="mt-2 w-full py-2.5 bg-[#C46A40] hover:bg-[#B55434] active:bg-[#9B4527] text-white rounded-xl text-xs font-semibold transition-all shadow-2xs hover:shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span>{tab === 'login' ? '이메일로 로그인' : '가입 완료하기'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>
            </>
          )}

          {/* 소셜 슬롯 (카카오 / 네이버 안내) */}
          <div className="pt-2 border-t border-[#E7E5DF] flex items-center justify-center gap-3">
            <span className="text-[11px] text-[#A39E94]">소셜 간편로그인:</span>
            <button 
              type="button"
              onClick={() => alert('카카오 로그인은 사업자 검수 후 정식 오픈될 예정입니다. 구글 또는 이메일 로그인을 이용해주세요!')}
              className="px-2.5 py-1 bg-[#FEE500] hover:bg-[#FDD800] text-[#3C1E1E] rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
            >
              카카오톡
            </button>
            <button 
              type="button"
              onClick={() => alert('네이버 로그인은 사업자 검수 후 정식 오픈될 예정입니다. 구글 또는 이메일 로그인을 이용해주세요!')}
              className="px-2.5 py-1 bg-[#03C75A] hover:bg-[#02B350] text-white rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
            >
              네이버
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
