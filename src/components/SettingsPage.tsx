import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, SlidersHorizontal, BookOpen, Cloud, Copy, 
  FileEdit, Shield, Type, Space, AlignLeft, Building2, MessageCircle, ExternalLink,
  CreditCard, History, HardDrive, Database
} from 'lucide-react';
import { PolicyViewModal, type PolicyModalType } from './PolicyViewModal';
import { getSitePolicy, type SitePolicy, DEFAULT_SITE_POLICY } from '../services/policyService';
import { useAiUsage } from '../hooks/useAiUsage';

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
  onOpenAdminModal
}) => {
  const [policy, setPolicy] = useState<SitePolicy>(DEFAULT_SITE_POLICY);
  const [policyModal, setPolicyModal] = useState<{ isOpen: boolean; tab: PolicyModalType }>({
    isOpen: false,
    tab: 'terms'
  });

  const {
    isLoggedIn,
    paidRemaining,
    freeRemaining,
    cloudCommentaryLimit,
    subscribedPlan,
    subscribedAt,
    rechargeHistory,
    cloudSubscribedAt,
  } = useAiUsage();

  const formatDate = (ts?: number) => {
    if (!ts) return '-';
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  };

  const storageStatusLabel = () => {
    if (!isLoggedIn || cloudCommentaryLimit <= 0) return '기기 저장 (30일 보관)';
    if (cloudCommentaryLimit >= 999999) return '주석 클라우드 무제한';
    if (cloudCommentaryLimit >= 1000) return '주석 클라우드 1000';
    return '주석 클라우드 300';
  };

  const storageStatusDate = () => {
    if (!isLoggedIn || cloudCommentaryLimit <= 0) return null;
    return formatDate(cloudSubscribedAt);
  };

  useEffect(() => {
    getSitePolicy().then(setPolicy);
  }, []);
  return (
    <div className="h-full overflow-y-auto bg-[#FAF9F5] text-[#2B2927] select-none custom-scrollbar">
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 space-y-7 pb-20">

        {/* 1. Header Navigation */}
        <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-5">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium text-[#6E6A63] hover:text-[#2B2927] hover:bg-[#F3EFE9] transition-all cursor-pointer border border-[#E5E0D8] bg-white shadow-2xs"
          >
            <ArrowLeft className="w-4 h-4 stroke-[1.8px]" />
            <span>성경 읽기로 돌아가기</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#2B2927] text-white hover:bg-[#1F1E1D] text-xs font-medium rounded-xl transition-all cursor-pointer shadow-2xs"
          >
            완료
          </button>
        </div>

        {/* Title Section */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[#C96442] text-xs font-semibold tracking-wider uppercase">
            <SlidersHorizontal className="w-3.5 h-3.5 stroke-[2px]" />
            <span>Preferences</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#2B2927] tracking-tight">
            환경설정
          </h1>
          <p className="text-xs text-[#6E6A63] font-normal leading-relaxed">
            성경 본문의 글꼴 크기, 줄 간격, 구절 간격을 조절하여 가장 편안한 읽기 환경을 만들어보세요.
          </p>
        </div>

        {/* ───── 구독 정보 섹션 ───── */}
        {isLoggedIn && (
          <section className="bg-white rounded-2xl border border-[#E5E0D8] p-5 sm:p-7 shadow-xs space-y-5">
            {/* 섹션 헤더 */}
            <div className="border-b border-[#F0EBE1] pb-3">
              <h2 className="font-serif font-bold text-base text-[#2B2927] flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#C96442] stroke-[1.8px]" />
                구독 정보
              </h2>
            </div>

            {/* 현재 크레딧 상태 */}
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-[#2B2927]">
                <span className="font-semibold">잔여 크레딧</span>
                <span className="text-[#C96442] font-bold">{paidRemaining + freeRemaining}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[#2B2927]">
                <span className="font-semibold">저장상태</span>
                <span className="text-[#6E6A63] text-xs">{storageStatusLabel()}</span>
              </div>
            </div>

            {/* 구독상태 */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 mb-1">
                <CreditCard className="w-3.5 h-3.5 text-[#C96442]" />
                <span className="text-xs font-semibold text-[#2B2927] uppercase tracking-wide">구독상태</span>
              </div>
              {subscribedPlan ? (
                <div className="flex items-center justify-between text-sm pl-5">
                  <span className="text-[#2B2927]">
                    {subscribedPlan
                      .replace('관리자 수동 지급', '관리자 지급')
                      .replace('관리자 수동지급', '관리자 지급')}
                  </span>
                  <span className="text-[#8C877D] text-xs">{formatDate(subscribedAt)}</span>
                </div>
              ) : (
                <p className="text-sm text-[#8C877D] pl-5">구독 중인 플랜이 없습니다.</p>
              )}
            </div>

            {/* 충전기록 */}
            <div className="space-y-1.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                <div className="flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-[#C96442]" />
                  <span className="text-xs font-semibold text-[#2B2927] uppercase tracking-wide">충전기록</span>
                </div>
                <span className="text-[11px] text-[#8C877D] sm:text-right">
                  ※ 유효기간이 적게 남은 크레딧부터 우선 차감됩니다.
                </span>
              </div>
              {rechargeHistory && rechargeHistory.length > 0 ? (
                <ul className="pl-5 space-y-1.5">
                  {[...rechargeHistory].reverse().slice(0, 10).map((h: any) => {
                    const displayPlan = h.planName
                      ? h.planName.replace('관리자 수동 지급', '선물증정').replace('관리자 수동지급', '선물증정')
                      : '';
                    const expiresAt = h.expiresAt || (h.date + 365 * 24 * 60 * 60 * 1000);
                    const diffDays = Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
                    const expireText = diffDays > 0 ? `${diffDays}일 남음` : '만료됨';

                    const remaining = h.remaining !== undefined ? h.remaining : h.amount;

                    return (
                      <li key={h.id} className="flex flex-col sm:flex-row sm:items-center justify-between text-sm py-1 border-b border-[#FAF5EE] last:border-0 gap-1.5">
                        <span className="text-[#2B2927] flex items-center gap-1.5 flex-wrap">
                          <strong className="font-semibold">{h.amount > 0 ? `+${h.amount} 크레딧` : '주석 클라우드'}</strong>
                          {displayPlan && (
                            <span className="text-[#6E6A63] text-xs font-normal">({displayPlan})</span>
                          )}
                          {h.amount > 0 && (
                            <span className="text-[11px] font-medium text-[#2B2927] bg-[#F3EFE9] border border-[#E5E0D8] px-1.5 py-0.2 rounded">
                              잔여 {remaining} 크레딧
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-2 text-xs shrink-0">
                          <span className="text-[#C96442] font-medium">유효기간 {expireText}</span>
                          <span className="text-[#DDD8CE]">•</span>
                          <span className="text-[#8C877D]">{formatDate(h.date)}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-[#8C877D] pl-5">충전 기록이 없습니다.</p>
              )}
            </div>

            {/* 저장상태 */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Database className="w-3.5 h-3.5 text-[#2B2927]" />
                <span className="text-xs font-semibold text-[#2B2927] uppercase tracking-wide">저장상태</span>
              </div>
              <div className="flex items-center justify-between text-sm pl-5">
                <span className="text-[#2B2927]">{storageStatusLabel()}</span>
                {storageStatusDate() && (
                  <span className="text-[#8C877D] text-xs">{storageStatusDate()}</span>
                )}
              </div>
            </div>
          </section>
        )}

        {/* 2. Core Section: Typography & Spacing with Live Preview */}
        <section className="bg-white rounded-2xl border border-[#E5E0D8] p-5 sm:p-7 shadow-xs space-y-6">
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
            <div className="bg-[#FAF9F5] p-4 rounded-xl border border-[#E5E0D8] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#2B2927] flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-[#6E6A63]" />
                  본문 글꼴크기
                </span>
                <span className="text-xs font-bold text-[#C96442] bg-[#FAF0EB] px-2 py-0.5 rounded-md border border-[#F1D3C6]">
                  {fontSize}px
                </span>
              </div>
              <input
                type="range"
                min="12"
                max="36"
                step="1"
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-[#E5E0D8] rounded-lg appearance-none cursor-pointer accent-[#C96442]"
              />
              <div className="flex items-center justify-between gap-1 pt-1">
                {[14, 16, 19, 23, 28].map((size) => (
                  <button
                    key={size}
                    onClick={() => setFontSize(size)}
                    className={`flex-1 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer border ${
                      fontSize === size 
                        ? 'bg-[#2B2927] text-white border-[#2B2927]' 
                        : 'bg-white text-[#6E6A63] border-[#E5E0D8] hover:bg-[#F3EFE9]'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* (2) 본문 줄간격 */}
            <div className="bg-[#FAF9F5] p-4 rounded-xl border border-[#E5E0D8] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#2B2927] flex items-center gap-1.5">
                  <AlignLeft className="w-3.5 h-3.5 text-[#6E6A63]" />
                  본문 줄간격
                </span>
                <span className="text-xs font-bold text-[#C96442] bg-[#FAF0EB] px-2 py-0.5 rounded-md border border-[#F1D3C6]">
                  {lineHeight.toFixed(1)}배
                </span>
              </div>
              <input
                type="range"
                min="1.3"
                max="2.8"
                step="0.1"
                value={lineHeight}
                onChange={(e) => setLineHeight(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-[#E5E0D8] rounded-lg appearance-none cursor-pointer accent-[#C96442]"
              />
              <div className="flex items-center justify-between gap-1 pt-1">
                {[1.4, 1.6, 1.8, 2.1, 2.4].map((lh) => (
                  <button
                    key={lh}
                    onClick={() => setLineHeight(lh)}
                    className={`flex-1 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer border ${
                      Math.abs(lineHeight - lh) < 0.05
                        ? 'bg-[#2B2927] text-white border-[#2B2927]' 
                        : 'bg-white text-[#6E6A63] border-[#E5E0D8] hover:bg-[#F3EFE9]'
                    }`}
                  >
                    {lh.toFixed(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* (3) 구절 간격 */}
            <div className="bg-[#FAF9F5] p-4 rounded-xl border border-[#E5E0D8] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#2B2927] flex items-center gap-1.5">
                  <Space className="w-3.5 h-3.5 text-[#6E6A63]" />
                  구절 간격
                </span>
                <span className="text-xs font-bold text-[#C96442] bg-[#FAF0EB] px-2 py-0.5 rounded-md border border-[#F1D3C6]">
                  {verseSpacing}px
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="24"
                step="2"
                value={verseSpacing}
                onChange={(e) => setVerseSpacing(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-[#E5E0D8] rounded-lg appearance-none cursor-pointer accent-[#C96442]"
              />
              <div className="flex items-center justify-between gap-1 pt-1">
                {[0, 2, 4, 8, 14].map((sp) => (
                  <button
                    key={sp}
                    onClick={() => setVerseSpacing(sp)}
                    className={`flex-1 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer border ${
                      verseSpacing === sp 
                        ? 'bg-[#2B2927] text-white border-[#2B2927]' 
                        : 'bg-white text-[#6E6A63] border-[#E5E0D8] hover:bg-[#F3EFE9]'
                    }`}
                  >
                    {sp === 0 ? '붙임' : `${sp}px`}
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* Live Preview Box */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#2B2927] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#C96442] animate-pulse"></span>
                실시간 예시 본문 (Live Preview)
              </span>
              <span className="text-[10px] text-[#8C877D]">
                창세기 1장 1~3절
              </span>
            </div>

            <div className="p-5 sm:p-6 bg-[#FAF9F5] rounded-xl border border-[#E5E0D8] shadow-inner transition-all">
              <div className="border-b border-[#E5E0D8]/60 pb-2 mb-3 flex items-center justify-between text-[11px] text-[#8C877D]">
                <span className="font-serif font-bold text-[#C96442]">개역개정 (미리보기)</span>
                <span>글꼴 {fontSize}px • 줄간격 {lineHeight.toFixed(1)}배 • 구절간격 {verseSpacing}px</span>
              </div>

              <div>
                {/* 예시 소제목 */}
                <div className="pt-1 pb-2 font-bold text-[0.92em] tracking-tight flex items-center gap-1.5 pl-8 text-[#C96442]">
                  <span className="w-1.5 h-3.5 bg-[#C96442] rounded-full inline-block shrink-0"></span>
                  <span>천지 창조</span>
                </div>

                {SAMPLE_VERSES.map((v) => (
                  <div
                    key={v.num}
                    style={{ marginBottom: `${verseSpacing}px` }}
                    className="flex gap-2.5 items-start rounded-lg transition-all px-1.5 py-0.5 hover:bg-[#F3EFE9]/50"
                  >
                    <span 
                      style={{ 
                        lineHeight: lineHeight, 
                        fontSize: `${Math.max(11, Math.round(fontSize * 0.68))}px` 
                      }}
                      className="font-semibold w-5 shrink-0 text-right select-none text-[#8C877D] font-mono"
                    >
                      {v.num}
                    </span>
                    <p
                      className="font-serif tracking-normal text-[#2B2927] flex-1 whitespace-pre-wrap"
                      style={{
                        fontSize: `${fontSize}px`,
                        lineHeight: lineHeight
                      }}
                    >
                      {v.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 3. Search Font Size */}
        <section className="bg-white rounded-2xl border border-[#E5E0D8] p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-xs text-[#2B2927]">검색 결과 글꼴 크기</h2>
              <p className="text-[11px] text-[#8C877D] mt-0.5">우측 성경 검색 패널의 검색 결과 목록 폰트 크기</p>
            </div>
            <span className="text-xs font-bold text-[#6E6A63] bg-[#F3EFE9] px-2.5 py-1 rounded-md border border-[#E5E0D8]">
              {searchFontSize}px
            </span>
          </div>
          <input
            type="range"
            min="11"
            max="20"
            value={searchFontSize}
            onChange={(e) => setSearchFontSize(parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-[#E5E0D8] rounded-lg appearance-none cursor-pointer accent-[#2B2927]"
          />
        </section>

        {/* 4. App Features Guide (Claude Style) */}
        <section className="bg-white rounded-2xl border border-[#E5E0D8] p-5 sm:p-6 shadow-xs space-y-4">
          <h2 className="font-serif font-bold text-sm text-[#2B2927] flex items-center gap-2 border-b border-[#F0EBE1] pb-2.5">
            <BookOpen className="w-4 h-4 text-[#C96442] stroke-[1.8px]" />
            네이션스 바이블 핵심 기능 안내
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3.5 bg-[#FAF9F5] rounded-xl border border-[#E5E0D8] space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[#2B2927]">
                <Cloud className="w-3.5 h-3.5 text-[#3B6D8C]" />
                <span>모든 기기 실시간 동기화</span>
              </div>
              <p className="text-[11px] text-[#6E6A63] leading-relaxed">
                Google 계정 로그인 시 주석, 노트, 업로드한 번역본이 구글 드라이브와 실시간 동기화되며 오프라인에서도 끊김없이 동작합니다.
              </p>
            </div>

            <div className="p-3.5 bg-[#FAF9F5] rounded-xl border border-[#E5E0D8] space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[#2B2927]">
                <BookOpen className="w-3.5 h-3.5 text-[#C96442]" />
                <span>본문 멀티뷰 & 듀얼뷰</span>
              </div>
              <p className="text-[11px] text-[#6E6A63] leading-relaxed">
                좌측 사이드바에서 여러 번역본을 선택하여 한 번에 비교하거나, 상단 [본문 듀얼뷰]로 좌우 창을 분할해 대조 연구할 수 있습니다.
              </p>
            </div>

            <div className="p-3.5 bg-[#FAF9F5] rounded-xl border border-[#E5E0D8] space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[#2B2927]">
                <Copy className="w-3.5 h-3.5 text-[#D97706]" />
                <span>스마트 복사 지정 설정</span>
              </div>
              <p className="text-[11px] text-[#6E6A63] leading-relaxed">
                구절 클릭 시 원하는 번역본 조합(한글/영어/다중) 및 출처 표시 여부를 맞춤 설정하여 손쉽게 복사할 수 있습니다.
              </p>
            </div>

            <div className="p-3.5 bg-[#FAF9F5] rounded-xl border border-[#E5E0D8] space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[#2B2927]">
                <FileEdit className="w-3.5 h-3.5 text-[#524E48]" />
                <span>구절 주석, 관주 & 설교노트</span>
              </div>
              <p className="text-[11px] text-[#6E6A63] leading-relaxed">
                각 구절마다 주석, 관주, 개인 묵상 노트를 기록하고, 우측 슬라이드 설교 에디터를 통해 문서를 작성할 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        {/* 5. Translation Support Format Guide */}
        <section className="bg-white rounded-2xl border border-[#E5E0D8] p-5 sm:p-6 shadow-xs space-y-3.5">
          <h2 className="font-serif font-bold text-sm text-[#2B2927] flex items-center gap-2 border-b border-[#F0EBE1] pb-2.5">
            <Shield className="w-4 h-4 text-[#6E6A63] stroke-[1.8px]" />
            번역본 텍스트 지원 형식 안내
          </h2>

          <div className="text-xs text-[#4A4741] space-y-2.5 leading-relaxed">
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

        {/* 6. Footer & Legal Information */}
        <div className="pt-6 border-t border-[#E5E0D8] space-y-3">
          {/* 사업자 상세 정보 요약 카드 */}
          <div className="bg-white p-4 rounded-xl border border-[#E5E0D8] text-xs text-[#6E6A63] space-y-2">
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-bold text-[#2B2927] flex-wrap">
                <div className="flex items-center gap-1.5 shrink-0">
                  <Building2 className="w-4 h-4 text-[#C46A40]" />
                  <span>{policy.businessName || '네이션스 솔루션'}</span>
                </div>

                {/* 네이션스 솔루션 글자 옆: 1:1 문의 버튼 */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <a
                    href={policy.kakaoChatUrl || 'http://pf.kakao.com/_cxjBxaX/chat'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#FEE500] hover:bg-[#FDD800] text-[#3C1E1E] rounded-full text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer"
                    title="1:1 문의 바로가기"
                  >
                    <svg className="w-3 h-3 stroke-[#3C1E1E] stroke-[2.8] fill-none shrink-0" viewBox="0 0 24 24">
                      <path d="M12 3c-5.52 0-10 3.58-10 8 0 2.87 1.89 5.4 4.77 6.77l-1.2 4.43c-.11.41.34.75.7.53l5.24-3.48c.16.01.32.02.49.02 5.52 0 10-3.58 10-8s-4.48-8-10-8z" />
                    </svg>
                    <span>1:1 문의</span>
                  </a>
                </div>

                {policy.representative && <span className="font-normal text-[#8C877D] text-xs">• 대표 {policy.representative}</span>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-[#8C877D] pt-1">
              {policy.businessNumber && <div>사업자등록번호: <span className="text-[#524E48] font-mono">{policy.businessNumber}</span></div>}
              {policy.ecommerceNumber && <div>통신판매업신고: <span className="text-[#524E48] font-mono">{policy.ecommerceNumber}</span></div>}
              <div>고객센터 / 문의: <a href={`mailto:${policy.contactEmail || 'ymoonsik@gmail.com'}`} className="text-[#C46A40] underline">{policy.contactEmail || 'ymoonsik@gmail.com'}</a></div>
            </div>

            {/* 약관 및 정책 링크 버튼들 */}
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
