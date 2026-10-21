import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gift, Copy, Check } from 'lucide-react';
import type { User } from 'firebase/auth';
import { shareInviteViaKakao } from '../utils/socialAuth';

interface InviteBonusModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onRequireLogin?: () => void;
}

export const InviteBonusModal: React.FC<InviteBonusModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onRequireLogin,
}) => {
  const [copied, setCopied] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  // 초대 링크 생성 (로그인 시 본인 UID 기반, 비로그인 시 기본 링크)
  const inviteCode = currentUser?.uid ? currentUser.uid.replace(/^(kakao|naver):/i, '').slice(0, 8) : '';
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://ym-bible.web.app';
  const inviteLink = inviteCode ? `${baseUrl}?invite=${inviteCode}` : baseUrl;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = inviteLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleKakaoShare = async () => {
    const userName = currentUser?.displayName || currentUser?.email?.split('@')[0] || '성도';
    const sharedBySdk = shareInviteViaKakao({
      inviteUrl: inviteLink,
      userName,
      appName: 'NATIONS BIBLE',
    });
    if (sharedBySdk) return;

    const shareTitle = 'NATIONS BIBLE AI - 나만의 주석 & 설교 준비';
    const shareText = `[친구 초대 1+1 보너스]\n성경 연구와 설교 준비를 위한 NATIONS BIBLE에 초대합니다.\n아래 링크로 가입 후 AI 주석을 1회 이상 생성하면 20 크레딧을 선물로 드립니다!\n\n초대링크: ${inviteLink}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: inviteLink,
        });
        return;
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          // fallback
        } else {
          return;
        }
      }
    }

    try {
      await navigator.clipboard.writeText(`${shareTitle}\n\n${shareText}`);
      setShareFeedback('초대 메시지와 링크가 복사되었습니다. 카카오톡 대화창에 붙여넣기(Ctrl+V) 해주세요!');
      setTimeout(() => setShareFeedback(null), 4000);
    } catch {
      handleCopyLink();
    }
  };

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs select-none"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-[#FAF8F5] rounded-2xl shadow-xl border border-[#E8E2D9] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-[#EAE4DC] flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#FAF0EB] text-[#C46A40] flex items-center justify-center">
                <Gift className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#1A1918] tracking-tight">친구 초대 1+1 보너스</h3>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#8C877D] hover:text-[#1A1918] hover:bg-[#F3EFE9] transition-colors cursor-pointer"
              aria-label="닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content Body */}
          <div className="p-5 space-y-4 text-sm text-[#4A4741] overflow-y-auto max-h-[75vh]">
            {/* 기본 혜택 카드 */}
            <div className="p-4 rounded-xl bg-white border border-[#EAE4DC] shadow-2xs">
              <div className="space-y-1.5">
                <span className="block text-xs font-bold text-[#1A1918]">
                  초대 혜택
                </span>
                <p className="text-[13px] font-medium leading-relaxed text-[#2B2927]">
                  초대링크로 친구가 가입 후 <span className="font-bold text-[#C46A40]">AI 주석을 1회 이상 생성</span>하면{' '}
                  <strong className="text-[#2B2927]">20 크레딧 선물 지급</strong>
                </p>
                <p className="text-xs text-[#8C877D]">
                  (가입한 친구에게도 20 크레딧이 함께 지급됩니다)
                </p>
              </div>
            </div>

            {/* 특별 혜택 카드 */}
            <div className="p-4 rounded-xl bg-[#FAF3EC] border border-[#ECD9CC]">
              <div className="space-y-1.5">
                <span className="block text-xs font-bold text-[#1A1918]">
                  특별 혜택
                </span>
                <p className="text-[13px] leading-relaxed text-[#2B2927]">
                  초대한 친구 <span className="font-bold text-[#C46A40]">10명을 달성</span>하고 10명 모두가 AI 주석을 1회 이상 생성하면{' '}
                  <strong className="font-semibold text-[#2B2927]">Nations sermon(설교 숏폼앱) 미디어 라이트 3개월 구독권</strong>이 즉시 무료 지급됩니다.
                </p>
              </div>
            </div>

            {/* 나의 초대링크 섹션 */}
            <div className="pt-2">
              <label className="block text-xs font-semibold text-[#6E6A63] mb-1.5">
                나의 초대링크
              </label>

              {!currentUser ? (
                <div className="p-3 bg-[#F3EFE9] border border-[#E5E0D8] rounded-xl text-center">
                  <p className="text-xs text-[#6E6A63] mb-2">
                    로그인하시면 나만의 고유 초대링크가 생성됩니다.
                  </p>
                  <button
                    onClick={() => {
                      onClose();
                      onRequireLogin?.();
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-[#2B2927] text-white rounded-lg hover:bg-[#3D3A37] transition-all cursor-pointer"
                  >
                    로그인하고 초대링크 받기
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-white border border-[#E0DAD1] rounded-xl p-1.5 focus-within:border-[#C46A40] transition-colors">
                  <input
                    type="text"
                    readOnly
                    value={inviteLink}
                    className="flex-1 px-2.5 py-1 text-xs text-[#2B2927] bg-transparent outline-hidden font-mono select-all truncate"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#FAF0EB] text-[#C46A40] hover:bg-[#F3E2D8] rounded-lg text-xs font-medium transition-colors shrink-0 cursor-pointer"
                    title="링크 복사"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>복사됨</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>복사</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* 카카오톡으로 초대장 보내기 버튼 */}
            <div className="space-y-2 pt-1">
              <button
                onClick={handleKakaoShare}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#FEE500] hover:bg-[#FADA0A] text-[#191919] font-medium text-xs rounded-xl transition-all shadow-2xs cursor-pointer active:scale-[0.99]"
              >
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                  <path d="M12 3c-5.523 0-10 3.582-10 8 0 2.84 1.838 5.337 4.625 6.72-.204.757-.745 2.748-.854 3.176-.134.537.197.53.414.386.171-.114 2.709-1.84 3.799-2.585.66.096 1.336.148 2.016.148 5.523 0 10-3.582 10-8s-4.477-8-10-8z"/>
                </svg>
                <span>카카오톡으로 초대장 보내기</span>
              </button>

              {shareFeedback && (
                <p className="text-[11px] text-center text-[#1E7E34] font-medium animate-fade-in">
                  ✓ {shareFeedback}
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 bg-[#F3EFE9]/60 border-t border-[#EAE4DC] flex items-center justify-between text-[11px] text-[#8C877D]">
            <span>함께 나눌수록 더 풍성해지는 성경 연구</span>
            <button
              onClick={onClose}
              className="text-[#6E6A63] hover:text-[#2B2927] font-medium cursor-pointer"
            >
              닫기
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
