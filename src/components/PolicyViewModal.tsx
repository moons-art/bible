import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, FileText, Building2, MessageCircle, ExternalLink } from 'lucide-react';
import { getSitePolicy, type SitePolicy, DEFAULT_SITE_POLICY } from '../services/policyService';

export type PolicyModalType = 'terms' | 'privacy' | 'business';

interface PolicyViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: PolicyModalType;
}

export const PolicyViewModal: React.FC<PolicyViewModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'terms'
}) => {
  const [activeTab, setActiveTab] = useState<PolicyModalType>(initialTab);
  const [policy, setPolicy] = useState<SitePolicy>(DEFAULT_SITE_POLICY);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (isOpen) {
      getSitePolicy().then(setPolicy);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-2xl bg-[#FBF9F7] rounded-2xl shadow-2xl border border-[#E5E0D8] overflow-hidden flex flex-col max-h-[88vh]"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-[#EBE6DF] flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#FAF0EB] flex items-center justify-center text-[#C46A40]">
                {activeTab === 'terms' && <FileText className="w-4 h-4" />}
                {activeTab === 'privacy' && <Shield className="w-4 h-4" />}
                {activeTab === 'business' && <Building2 className="w-4 h-4" />}
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[#2B2927]">
                  {activeTab === 'terms' && '서비스 이용약관'}
                  {activeTab === 'privacy' && '개인정보 처리방침'}
                  {activeTab === 'business' && '사업자 및 서비스 정보'}
                </h2>
                <p className="text-[11px] text-[#8C877D]">
                  {policy.businessName} • 스토어 심사 및 법적 고지 기준 준수
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#8C877D] hover:text-[#2B2927] hover:bg-[#F3EFE9] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex items-center gap-1.5 px-5 py-2.5 bg-[#FAF7F2] border-b border-[#EBE6DF] shrink-0 overflow-x-auto">
            <button
              onClick={() => setActiveTab('terms')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'terms'
                  ? 'bg-white text-[#2B2927] shadow-2xs font-semibold border border-[#E5E0D8]'
                  : 'text-[#6E6A63] hover:text-[#2B2927] hover:bg-white/60'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>서비스 이용약관</span>
            </button>
            <button
              onClick={() => setActiveTab('privacy')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'privacy'
                  ? 'bg-white text-[#2B2927] shadow-2xs font-semibold border border-[#E5E0D8]'
                  : 'text-[#6E6A63] hover:text-[#2B2927] hover:bg-white/60'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>개인정보 처리방침</span>
            </button>
            <button
              onClick={() => setActiveTab('business')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'business'
                  ? 'bg-white text-[#2B2927] shadow-2xs font-semibold border border-[#E5E0D8]'
                  : 'text-[#6E6A63] hover:text-[#2B2927] hover:bg-white/60'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>사업자 정보</span>
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-5 text-[#3D3A36] text-xs leading-relaxed custom-scrollbar select-text bg-white">
            {activeTab === 'terms' && (
              <div className="whitespace-pre-wrap font-sans space-y-2">
                {policy.termsOfService}
              </div>
            )}

            {activeTab === 'privacy' && (
              <div className="whitespace-pre-wrap font-sans space-y-2">
                {policy.privacyPolicy}
              </div>
            )}

            {activeTab === 'business' && (
              <div className="space-y-4">
                <div className="bg-[#FAF7F2] p-4 rounded-xl border border-[#EBE6DF] space-y-2.5">
                  <h3 className="font-bold text-sm text-[#2B2927] flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#C46A40]" />
                    <span>{policy.businessName || '네이션스 솔루션'}</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#524E48] pt-1">
                    {policy.representative && (
                      <div>
                        <span className="text-[#8C877D]">대표자: </span>
                        <span className="font-medium text-[#2B2927]">{policy.representative}</span>
                      </div>
                    )}
                    {policy.businessNumber && (
                      <div>
                        <span className="text-[#8C877D]">사업자등록번호: </span>
                        <span className="font-mono text-[#2B2927]">{policy.businessNumber}</span>
                      </div>
                    )}
                    {policy.ecommerceNumber && (
                      <div>
                        <span className="text-[#8C877D]">통신판매업신고번호: </span>
                        <span className="font-mono text-[#2B2927]">{policy.ecommerceNumber}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-[#8C877D]">고객센터 / 문의: </span>
                      <a href={`mailto:${policy.contactEmail || 'ymoonsik@gmail.com'}`} className="text-[#C46A40] underline font-medium">
                        {policy.contactEmail || 'ymoonsik@gmail.com'}
                      </a>
                    </div>
                  </div>
                </div>

                {/* 카카오톡 채널 연동 카드 */}
                <div className="bg-[#FEF9EE] border border-[#F6E1A8] p-4 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-[#FEE500] flex items-center justify-center text-[#3C1E1E] text-xs font-black shadow-2xs">
                        💬
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-[#2B2927]">
                          카카오톡 채널 ({policy.kakaoChannelName || '네이션스 솔루션'})
                        </h4>
                        <p className="text-[11px] text-[#7A622A]">
                          1:1 실시간 상담 및 서비스 문의가 가능합니다.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      href={policy.kakaoChannelUrl || 'http://pf.kakao.com/_cxjBxaX'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FEE500] hover:bg-[#FDD800] text-[#3C1E1E] rounded-full text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer"
                      title="카카오채널 바로가기"
                    >
                      <svg className="w-3.5 h-3.5 fill-[#3C1E1E] shrink-0" viewBox="0 0 24 24">
                        <path d="M12 3c-5.52 0-10 3.58-10 8 0 2.87 1.89 5.4 4.77 6.77l-1.2 4.43c-.11.41.34.75.7.53l5.24-3.48c.16.01.32.02.49.02 5.52 0 10-3.58 10-8s-4.48-8-10-8z" />
                      </svg>
                      <span>카카오채널</span>
                      <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
                    </a>
                    <a
                      href={policy.kakaoChatUrl || 'http://pf.kakao.com/_cxjBxaX/chat'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FEE500] hover:bg-[#FDD800] text-[#3C1E1E] rounded-full text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer"
                      title="1:1 채팅 문의 바로가기"
                    >
                      <svg className="w-3.5 h-3.5 stroke-[#3C1E1E] stroke-[2.2] fill-none shrink-0" viewBox="0 0 24 24">
                        <path d="M12 3c-5.52 0-10 3.58-10 8 0 2.87 1.89 5.4 4.77 6.77l-1.2 4.43c-.11.41.34.75.7.53l5.24-3.48c.16.01.32.02.49.02 5.52 0 10-3.58 10-8s-4.48-8-10-8z" />
                      </svg>
                      <span>1:1 채팅 문의</span>
                      <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
                    </a>
                  </div>
                </div>

                <div className="text-[11px] text-[#8C877D] text-center pt-2">
                  {policy.copyright || 'Copyright © 2026 Nations. All rights reserved.'}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-[#EBE6DF] bg-[#FAF7F2] flex items-center justify-between shrink-0">
            <span className="text-[11px] text-[#8C877D]">
              {policy.copyright}
            </span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-[#2B2927] hover:bg-[#1F1E1D] text-white text-xs font-medium rounded-lg transition-all cursor-pointer shadow-2xs"
            >
              닫기
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
