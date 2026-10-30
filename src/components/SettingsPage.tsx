import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Shield, Type, AlignLeft, Building2, ExternalLink, Settings
} from 'lucide-react';
import { PolicyViewModal, type PolicyModalType } from './PolicyViewModal';
import { getSitePolicy, type SitePolicy, DEFAULT_SITE_POLICY } from '../services/policyService';

interface SettingsPageProps {
  onClose: () => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  lineHeight: number;
  setLineHeight: (height: number) => void;
  verseSpacing: number;
  setVerseSpacing: (spacing: number) => void;
  searchFontSize: number;
  setSearchFontSize: (size: number) => void;
  onOpenAdminModal: () => void;
  onOpenPricing?: () => void;
}

const SAMPLE_VERSES = [
  {
    num: 1,
    text: "태초에 하나님이 천지를 창조하시니라"
  },
  {
    num: 2,
    text: "땅이 혼돈하고 공허하며 흑암이 깊음 위에 있고 하나님의 영은 수면 위에 운행하시니라"
  },
  {
    num: 3,
    text: "하나님이 이르시되 빛이 있으라 하시니 빛이 있었고"
  }
];

export const SettingsPage: React.FC<SettingsPageProps> = ({
  onClose,
  fontSize,
  setFontSize,
  lineHeight,
  setLineHeight,
  verseSpacing,
  setVerseSpacing,
  searchFontSize,
  setSearchFontSize,
  onOpenAdminModal,
}) => {
  const [policy, setPolicy] = useState<SitePolicy>(DEFAULT_SITE_POLICY);
  const [policyModal, setPolicyModal] = useState<{ isOpen: boolean; tab: PolicyModalType }>({
    isOpen: false,
    tab: 'terms'
  });

  useEffect(() => {
    getSitePolicy().then(setPolicy);
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-[#FAF9F5] text-[#2B2927] select-none custom-scrollbar">
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 space-y-6 pb-20">

        {/* 1. Header Navigation */}
        <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-5">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium text-[#6E6A63] hover:text-[#2B2927] hover:bg-[#F3EFE9] transition-all cursor-pointer border border-[#E5E0D8] bg-white shadow-2xs"
          >
            <ArrowLeft className="w-4 h-4 stroke-[1.8px]" />
            <span>성경 읽기로 돌아가기</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="font-serif font-bold text-sm text-[#2B2927] flex items-center gap-1.5">
              <Settings className="w-4 h-4 text-[#6E6A63]" />
              화면 및 본문 설정
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#2B2927] text-white hover:bg-[#1F1E1D] text-xs font-medium rounded-xl transition-all cursor-pointer shadow-2xs"
          >
            완료
          </button>
        </div>

        {/* ───── 본문 서체 및 간격 설정 섹션 ───── */}
        <section id="settings-display-section" className="bg-white rounded-2xl border border-[#E5E0D8] p-5 sm:p-7 shadow-xs space-y-6">
          <div className="border-b border-[#F0EBE1] pb-3">
            <h2 className="font-serif font-bold text-base text-[#2B2927] flex items-center gap-2">
              <Type className="w-4 h-4 text-[#C96442] stroke-[1.8px]" />
              본문 서체 및 간격 설정
            </h2>
            <p className="text-[11px] text-[#8C877D] mt-0.5">
              아래 3가지 항목을 조절하면 실제 성경 뷰어와 하단 예시 본문에 실시간으로 적용됩니다.
            </p>
          </div>

          {/* 3 Controls Aligned */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            {/* (1) 본문 글꼴 크기 */}
            <div className="bg-[#FAF8F5] p-3.5 rounded-xl border border-[#EAE4DC] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#2B2927] flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-[#C96442]" />
                  글꼴 크기
                </span>
                <span className="text-xs font-bold text-[#C96442] bg-[#FAF0EB] px-2 py-0.5 rounded-md border border-[#F1D3C6]">
                  {fontSize}px
                </span>
              </div>
              <input
                type="range"
                min="12"
                max="28"
                step="1"
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                className="w-full accent-[#C96442] cursor-pointer h-1.5 bg-[#E5E0D8] rounded-lg"
              />
              <div className="flex gap-1.5 mt-3">
                {[14, 16, 18, 20].map((size) => (
                  <button
                    key={size}
                    onClick={() => setFontSize(size)}
                    className={`flex-1 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer border ${
                      fontSize === size 
                        ? 'bg-[#C96442] text-white border-[#C96442] shadow-2xs' 
                        : 'bg-white text-[#6E6A63] border-[#E5E0D8] hover:bg-[#F3EFE9]'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* (2) 줄 간격 */}
            <div className="bg-[#FAF8F5] p-3.5 rounded-xl border border-[#EAE4DC] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#2B2927] flex items-center gap-1.5">
                  <AlignLeft className="w-3.5 h-3.5 text-[#C96442]" />
                  줄 간격
                </span>
                <span className="text-xs font-bold text-[#C96442] bg-[#FAF0EB] px-2 py-0.5 rounded-md border border-[#F1D3C6]">
                  {lineHeight.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min="1.4"
                max="2.6"
                step="0.1"
                value={lineHeight}
                onChange={(e) => setLineHeight(parseFloat(e.target.value))}
                className="w-full accent-[#C96442] cursor-pointer h-1.5 bg-[#E5E0D8] rounded-lg"
              />
              <div className="flex gap-1.5 mt-3">
                {[1.6, 1.8, 2.0, 2.2].map((lh) => (
                  <button
                    key={lh}
                    onClick={() => setLineHeight(lh)}
                    className={`flex-1 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer border ${
                      lineHeight === lh 
                        ? 'bg-[#C96442] text-white border-[#C96442] shadow-2xs' 
                        : 'bg-white text-[#6E6A63] border-[#E5E0D8] hover:bg-[#F3EFE9]'
                    }`}
                  >
                    {lh}
                  </button>
                ))}
              </div>
            </div>

            {/* (3) 절 간격 */}
            <div className="bg-[#FAF8F5] p-3.5 rounded-xl border border-[#EAE4DC] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#2B2927] flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-[#C96442]" />
                  절 간격
                </span>
                <span className="text-xs font-bold text-[#C96442] bg-[#FAF0EB] px-2 py-0.5 rounded-md border border-[#F1D3C6]">
                  {verseSpacing === 0 ? '없음' : `${verseSpacing * 4}px`}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="3"
                step="1"
                value={verseSpacing}
                onChange={(e) => setVerseSpacing(parseInt(e.target.value, 10))}
                className="w-full accent-[#C96442] cursor-pointer h-1.5 bg-[#E5E0D8] rounded-lg"
              />
              <div className="flex gap-1.5 mt-3">
                {[
                  { val: 0, label: '0px' },
                  { val: 1, label: '4px' },
                  { val: 2, label: '8px' },
                  { val: 3, label: '12px' }
                ].map((item) => (
                  <button
                    key={item.val}
                    onClick={() => setVerseSpacing(item.val)}
                    className={`flex-1 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer border ${
                      verseSpacing === item.val 
                        ? 'bg-[#C96442] text-white border-[#C96442] shadow-2xs' 
                        : 'bg-white text-[#6E6A63] border-[#E5E0D8] hover:bg-[#F3EFE9]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 실시간 미리보기 상자 */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#2B2927]">실시간 미리보기</span>
              <span className="text-[10px] text-[#8C877D]">창세기 1:1-3</span>
            </div>
            <div className="bg-[#FAF8F5] p-5 rounded-xl border border-[#EAE4DC] shadow-inner space-y-2">
              {SAMPLE_VERSES.map((v) => (
                <div 
                  key={v.num} 
                  className="flex items-start gap-2.5"
                  style={{ marginBottom: `${verseSpacing * 4}px` }}
                >
                  <span className="text-xs font-bold text-[#C96442] bg-[#FAF0EB] px-1.5 py-0.5 rounded shrink-0 select-none">
                    {v.num}
                  </span>
                  <span 
                    className="font-serif tracking-normal text-[#2B2927] flex-1 whitespace-pre-wrap"
                    style={{ 
                      fontSize: `${fontSize}px`, 
                      lineHeight: lineHeight 
                    }}
                  >
                    {v.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 2. Search Font Size */}
        <section className="bg-white rounded-2xl border border-[#E5E0D8] p-5 sm:p-7 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#F0EBE1] pb-3">
            <div>
              <h2 className="font-semibold text-xs text-[#2B2927]">검색 결과 글꼴 크기</h2>
              <p className="text-[11px] text-[#8C877D] mt-0.5">성경 검색 목록에 표시되는 구절의 글자 크기를 조절합니다.</p>
            </div>
            <span className="text-xs font-bold text-[#6E6A63] bg-[#F3EFE9] px-2.5 py-1 rounded-md border border-[#E5E0D8]">
              {searchFontSize}px
            </span>
          </div>

          <input
            type="range"
            min="12"
            max="24"
            step="1"
            value={searchFontSize}
            onChange={(e) => setSearchFontSize(parseInt(e.target.value, 10))}
            className="w-full accent-[#C96442] cursor-pointer h-1.5 bg-[#E5E0D8] rounded-lg"
          />
        </section>

        {/* ───── 성경번역본 텍스트 지원 형식 및 업로드 안내 ───── */}
        <section className="bg-white rounded-2xl border border-[#E5E0D8] p-5 sm:p-7 shadow-xs space-y-4">
          <h2 className="font-serif font-bold text-sm text-[#2B2927] flex items-center gap-2 border-b border-[#F0EBE1] pb-2.5">
            <Shield className="w-4 h-4 text-[#6E6A63] stroke-[1.8px]" />
            성경번역본 텍스트 업로드 및 지원 형식 안내
          </h2>

          <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E8E2D8] flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-[#2B2927]">
              개역개정, NIV 기타 번역본 사용법 무료문의
            </span>
            <a
              href={policy.kakaoChatUrl || 'http://pf.kakao.com/_cxjBxaX/chat'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FEE500] hover:bg-[#FDD800] text-[#3C1E1E] rounded-full text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer shrink-0"
              title="카톡 1:1 무료문의 바로가기"
            >
              <svg className="w-3.5 h-3.5 stroke-[#3C1E1E] stroke-[2.8] fill-none shrink-0" viewBox="0 0 24 24">
                <path d="M12 3c-5.52 0-10 3.58-10 8 0 2.87 1.89 5.4 4.77 6.77l-1.2 4.43c-.11.41.34.75.7.53l5.24-3.48c.16.01.32.02.49.02 5.52 0 10-3.58 10-8s-4.48-8-10-8z" />
              </svg>
              <span>카톡 1:1 문의</span>
            </a>
          </div>

          <div className="text-xs text-[#4A4741] space-y-2.5 leading-relaxed pt-1">
            <p className="text-[11px] text-[#6E6A63]">
              개인 소장용 성경 텍스트(.txt) 파일을 업로드하여 나만의 번역본을 추가할 수 있습니다.
            </p>
            <div className="bg-[#FAF9F5] p-3 rounded-xl border border-[#E5E0D8] space-y-1.5 text-[11px]">
              <div className="font-semibold text-[#2B2927]">1. 표준 형식 (줄마다 권/장/절 포함)</div>
              <code className="block bg-white px-2 py-1 rounded border border-[#E5E0D8] text-[10px] text-[#6E6A63] font-mono">
                창세기 1:1 태초에 하나님이 천지를 창조하시니라
              </code>
            </div>
            <div className="bg-[#FAF9F5] p-3 rounded-xl border border-[#E5E0D8] space-y-1.5 text-[11px]">
              <div className="font-semibold text-[#2B2927]">2. 헤더 구분 형식 (권/장이 상단에 위치)</div>
              <code className="block bg-white px-2 py-1 rounded border border-[#E5E0D8] text-[10px] text-[#6E6A63] font-mono">
                [창세기 1] <br />1 태초에 하나님이 천지를 창조하시니라
              </code>
            </div>
            <p className="text-[10px] text-[#8C877D] pt-1">
              * 권장 인코딩: UTF-8 (BOM 없음), 줄바꿈 LF(\n), .txt 파일
            </p>
          </div>
        </section>

        {/* 3. Footer & Legal Information */}
        <div className="pt-4 border-t border-[#E5E0D8] space-y-3">
          <div className="bg-white p-4 rounded-xl border border-[#E5E0D8] text-xs text-[#6E6A63] space-y-2">
            <div className="flex items-center gap-2 font-bold text-[#2B2927] flex-wrap">
              <div className="flex items-center gap-1.5 shrink-0">
                <Building2 className="w-4 h-4 text-[#C46A40]" />
                <span>{policy.businessName || '네이션스 솔루션'}</span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <a
                  href={policy.kakaoChatUrl || 'http://pf.kakao.com/_cxjBxaX/chat'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#FEE500] hover:bg-[#FDD800] text-[#3C1E1E] rounded-full text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer"
                >
                  <svg className="w-3 h-3 stroke-[#3C1E1E] stroke-[2.8] fill-none shrink-0" viewBox="0 0 24 24">
                    <path d="M12 3c-5.52 0-10 3.58-10 8 0 2.87 1.89 5.4 4.77 6.77l-1.2 4.43c-.11.41.34.75.7.53l5.24-3.48c.16.01.32.02.49.02 5.52 0 10-3.58 10-8s-4.48-8-10-8z" />
                  </svg>
                  <span>1:1 문의</span>
                </a>
              </div>

              {policy.representative && <span className="font-normal text-[#8C877D] text-xs">• 대표 {policy.representative}</span>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-[#8C877D] pt-1">
              {policy.businessNumber && <div>사업자등록번호: <span className="text-[#524E48] font-mono">{policy.businessNumber}</span></div>}
              {policy.ecommerceNumber && <div>통신판매업신고: <span className="text-[#524E48] font-mono">{policy.ecommerceNumber}</span></div>}
              <div>고객센터 / 문의: <a href={`mailto:${policy.contactEmail || 'ymoonsik@gmail.com'}`} className="text-[#C46A40] underline">{policy.contactEmail || 'ymoonsik@gmail.com'}</a></div>
            </div>

            <div className="pt-2 border-t border-[#F0EBE1] flex items-center justify-between flex-wrap gap-2 text-[11px]">
              <div className="flex items-center gap-2 text-[#6E6A63]">
                <button
                  type="button"
                  onClick={() => setPolicyModal({ isOpen: true, tab: 'terms' })}
                  className="hover:text-[#C46A40] underline cursor-pointer font-medium"
                >
                  서비스 이용약관
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => setPolicyModal({ isOpen: true, tab: 'privacy' })}
                  className="hover:text-[#C46A40] underline cursor-pointer font-medium"
                >
                  개인정보 처리방침
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => setPolicyModal({ isOpen: true, tab: 'business' })}
                  className="hover:text-[#C46A40] underline cursor-pointer font-medium"
                >
                  사업자 정보 전체보기
                </button>
              </div>

              <button
                onClick={onOpenAdminModal}
                className="text-[#8C877D] hover:text-[#C46A40] underline transition-colors cursor-pointer text-[10px]"
              >
                관리자 모드
              </button>
            </div>
          </div>

          <div className="text-[11px] text-[#A3A19B] text-center">
            {policy.copyright || 'Copyright © 2026 Nations. All rights reserved.'}
          </div>
        </div>

      </div>

      {/* 이용약관 & 개인정보 처리방침 열람 모달 */}
      <PolicyViewModal
        isOpen={policyModal.isOpen}
        initialTab={policyModal.tab}
        onClose={() => setPolicyModal({ isOpen: false, tab: 'terms' })}
      />
    </div>
  );
};
