import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, SlidersHorizontal, BookOpen, Cloud, Copy, 
  FileEdit, Shield, Type, Space, AlignLeft, Building2, MessageCircle, ExternalLink,
  CreditCard, History, HardDrive, Database, User, RefreshCw, ChevronRight, Sparkles
} from 'lucide-react';
import { PolicyViewModal, type PolicyModalType } from './PolicyViewModal';
import { getSitePolicy, type SitePolicy, DEFAULT_SITE_POLICY } from '../services/policyService';
import { useAiUsage } from '../hooks/useAiUsage';
import { auth, db } from '../api/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { shareInviteViaKakao, getSocialUserMeta } from '../utils/socialAuth';
import { getLocalUserResourceCounts } from '../services/userService';
import { formatPlanDisplayName } from '../services/planConfigService';
import { getCommentaryHistory, getTotalMergedCommentaryCount } from '../services/aiHistoryService';

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
  onOpenPricing,
}) => {
  const [policy, setPolicy] = useState<SitePolicy>(DEFAULT_SITE_POLICY);
  const [policyModal, setPolicyModal] = useState<{ isOpen: boolean; tab: PolicyModalType }>({
    isOpen: false,
    tab: 'terms'
  });

  const {
    isLoggedIn,
    totalRemaining,
    paidRemaining,
    freeRemaining,
    monthlyQuotaRemaining,
    cloudCommentaryLimit,
    usedCloudCommentaryCount,
    subscribedPlan,
    subscribedAt,
    rechargeHistory,
    cloudSubscribedAt,
    usageState,
  } = useAiUsage();

  const [resourceCounts, setResourceCounts] = useState({
    sermonCount: 0,
    noteCount: 0,
    commentaryCount: 0,
  });

  const [referralCount, setReferralCount] = useState<number>(0);
  const [activeReferralCount, setActiveReferralCount] = useState<number>(0);
  const [inviteCopied, setInviteCopied] = useState<boolean>(false);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<boolean>(false);

  useEffect(() => {
    getSitePolicy().then(setPolicy);

    // 로컬 설교/구절메모(노트+관주+주석)/AI주석 개수 집계
    const counts = getLocalUserResourceCounts();
    let totalVerseMemCount = counts.noteCount + counts.crossRefCount + counts.commentaryCount;
    let localCommCount = getCommentaryHistory().length;

    setResourceCounts({
      sermonCount: counts.sermonCount,
      noteCount: totalVerseMemCount,
      commentaryCount: localCommCount,
    });

    if (auth.currentUser) {
      getTotalMergedCommentaryCount(auth.currentUser.uid).then(count => {
        setResourceCounts(prev => ({
          ...prev,
          commentaryCount: Math.max(prev.commentaryCount, count),
        }));
      }).catch(() => {});

      getDoc(doc(db, 'users', auth.currentUser.uid)).then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          const friends = Array.isArray(data.invitedFriends) ? data.invitedFriends : [];
          setReferralCount(friends.length);
          setActiveReferralCount(friends.filter((f: any) => f.hasGeneratedCommentary).length);
        }
      }).catch(() => {});
    }
  }, []);

  const formatDate = (ts?: number) => {
    if (!ts) return '-';
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  };

  // 다음 초기화일 계산 (매달 첫일이 아닌 결제일 기준 익월 동일 일자)
  const getNextResetDate = () => {
    const paymentTimestamp = subscribedAt || cloudSubscribedAt;
    const now = new Date();
    if (paymentTimestamp) {
      const payDate = new Date(paymentTimestamp);
      const payDay = payDate.getDate();
      let targetYear = now.getFullYear();
      let targetMonth = now.getMonth();

      // 이번 달의 결제일이 이미 지났으면 다음 달로 설정
      if (now.getDate() >= payDay) {
        targetMonth += 1;
        if (targetMonth > 11) {
          targetMonth = 0;
          targetYear += 1;
        }
      }
      const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
      const actualDay = Math.min(payDay, daysInTargetMonth);
      return `${targetYear}.${String(targetMonth + 1).padStart(2, '0')}.${String(actualDay).padStart(2, '0')}.`;
    }

    // 결제일 정보가 없거나 무료 이용자인 경우 다음 달 동일 일자
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    return `${nextMonth.getFullYear()}.${String(nextMonth.getMonth() + 1).padStart(2, '0')}.${String(nextMonth.getDate()).padStart(2, '0')}.`;
  };

  // 초대 링크
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://ym-bible.web.app';
  const inviteCode = auth.currentUser?.uid ? auth.currentUser.uid.replace(/^(kakao|naver):/i, '').slice(0, 8) : '';
  const inviteLink = inviteCode ? `${baseUrl}?invite=${inviteCode}` : baseUrl;

  const handleCopyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    }
  };

  // 플랜명 가공
  const planDisplayName = formatPlanDisplayName(subscribedPlan);

  const isCloudPlan = cloudCommentaryLimit > 0;

  // AI 원어주석 & 설교자료 사용량 (기록 기반 또는 누적 사용량 추정)
  const aiCommentaryCount = usageState.totalUsed || 0;
  const aiCommentaryCredits = aiCommentaryCount * 1; // 1회당 1크레딧
  const sermonMaterialSetCount = 0;
  const sermonMaterialCredits = sermonMaterialSetCount * 20; // 1세트당 20크레딧 차감

  // 월소진 크레딧 잔여 (전체 크레딧이 아닌 월간 기본/구독 크레딧의 잔여분)
  const monthlyRemainingCredits = (monthlyQuotaRemaining && monthlyQuotaRemaining > 0) 
    ? monthlyQuotaRemaining 
    : (freeRemaining || 0);

  // 월간 총 제공 한도
  const monthlyTotalCapacity = isCloudPlan 
    ? ((monthlyQuotaRemaining || 0) + (freeRemaining || 0) > 0 ? (monthlyQuotaRemaining || 0) + (freeRemaining || 0) : 100)
    : 10;

  const monthlyUsed = Math.max(0, monthlyTotalCapacity - monthlyRemainingCredits);

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

          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#2B2927] text-white hover:bg-[#1F1E1D] text-xs font-medium rounded-xl transition-all cursor-pointer shadow-2xs"
          >
            완료
          </button>
        </div>

        {/* ───── 계정 관리 카드 ───── */}
        <div className="bg-white rounded-2xl border border-[#E5E0D8] shadow-2xs overflow-hidden">
          {/* 상단 계정 헤더 */}
          <div className="p-5 sm:p-6 border-b border-[#F0EBE1] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#FAF0EB] text-[#C46A40] flex items-center justify-center font-bold text-sm">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-base text-[#2B2927]">계정 관리</h2>
                <p className="text-xs text-[#8C877D]">
                  {auth.currentUser?.email || getSocialUserMeta(auth.currentUser)?.email || auth.currentUser?.displayName || getSocialUserMeta(auth.currentUser)?.displayName || (isLoggedIn ? '로그인 중' : '게스트')}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#8C877D] hover:text-[#2B2927] hover:bg-[#F3EFE9] transition-colors cursor-pointer"
            >
              닫기
            </button>
          </div>

          <div className="p-5 sm:p-6 space-y-6">

            {/* [구독정보] */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#6E6A63]">구독정보</span>
                <button
                  onClick={onOpenPricing}
                  className="text-xs font-semibold text-[#C46A40] hover:text-[#A8532B] flex items-center gap-0.5 hover:underline cursor-pointer"
                >
                  <span>플랜 변경 / 업그레이드</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#EAE4DC] flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="text-sm font-bold text-[#2B2927]">{planDisplayName}</strong>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[#8C877D] mt-1">
                    <RefreshCw className="w-3 h-3 text-[#8C877D]" />
                    <span>크레딧 다음 초기화: {getNextResetDate()}</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 text-xs font-medium rounded-lg bg-[#EFECE6] text-[#6E6A63]">
                  이용 중
                </span>
              </div>
            </div>

            {/* [이번 달 크레딧] */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-[#6E6A63]">이번 달 크레딧</span>

              <div className="p-4 sm:p-5 rounded-xl bg-[#FAF8F5] border border-[#EAE4DC] space-y-4">
                {/* 게이지 바 1: 월소진 사용량 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#2B2927]">월소진 사용량</span>
                    <span className="text-[#6E6A63]">
                      <strong className="text-[#2B2927]">{monthlyUsed}</strong>/{monthlyTotalCapacity}{' '}
                      <span className="text-[#8C877D] font-mono">(잔여 {monthlyRemainingCredits} 크레딧)</span>
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-[#EAE4DC] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[#2B2927] rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (monthlyUsed / monthlyTotalCapacity) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* 게이지 바 2: 일반 사용량 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#2B2927]">일반 충전 잔여량</span>
                    <span className="text-[#6E6A63]">
                      <strong className="text-[#2B2927]">{paidRemaining}</strong>/{paidRemaining}{' '}
                      <span className="text-[#8C877D] font-mono">(잔여 {paidRemaining} 크레딧)</span>
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-[#EAE4DC] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[#C46A40] rounded-full transition-all duration-300"
                      style={{ width: paidRemaining > 0 ? '100%' : '0%' }}
                    />
                  </div>
                </div>

                {/* 사용 내역 분할선 */}
                <div className="border-t border-[#EAE4DC] pt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-[#4A4741]">
                    <span>AI 원어주석</span>
                    <span className="font-medium text-[#2B2927] font-mono">
                      {aiCommentaryCount}회 / {aiCommentaryCredits} 크레딧 차감
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#4A4741]">
                    <span>설교자료 SET</span>
                    <span className="font-medium text-[#2B2927] font-mono">
                      {sermonMaterialSetCount}회 / {sermonMaterialCredits} 크레딧 차감
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* [데이터 보관 현황 (유료 클라우드 / 무료 기기보관)] */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-[#6E6A63]">
                {isCloudPlan ? '유료 클라우드 보관 현황' : '무료 기기보관 현황'}
              </span>

              <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#EAE4DC] space-y-2.5 text-xs">
                {isCloudPlan ? (
                  <>
                    <div className="flex items-center justify-between text-[#4A4741]">
                      <div>
                        <span className="font-medium block">설교노트</span>
                        <span className="text-[10px] text-[#8C877D]">상단 설교노트 버튼을 눌러 생성된 설교노트</span>
                      </div>
                      <span className="font-semibold text-[#2B2927]">
                        {resourceCounts.sermonCount}개 <span className="text-[#C46A40]">/ 무제한</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[#4A4741]">
                      <div>
                        <span className="font-medium block">구절메모</span>
                        <span className="text-[10px] text-[#8C877D]">구절에 메모된 모든 노트 (구절 주석, 관주, 노트)</span>
                      </div>
                      <span className="font-semibold text-[#2B2927]">
                        {resourceCounts.noteCount}개 <span className="text-[#C46A40]">/ 무제한</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[#4A4741]">
                      <div>
                        <span className="font-medium block">AI 주석</span>
                        <span className="text-[10px] text-[#8C877D]">심층 생성된 구절별 AI 주석</span>
                      </div>
                      <span className="font-semibold text-[#2B2927]">
                        {resourceCounts.commentaryCount} 구절 <span className="text-[#6E6A63]">/ {cloudCommentaryLimit >= 30000 ? '무제한' : `${cloudCommentaryLimit}슬롯`}</span>
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-[#4A4741]">
                      <div>
                        <span className="font-medium block">설교노트</span>
                        <span className="text-[10px] text-[#8C877D]">상단 설교노트 버튼을 눌러 생성된 설교노트</span>
                      </div>
                      <span className="font-semibold text-[#2B2927]">
                        {resourceCounts.sermonCount}개 <span className="text-[#8C877D]">/ 기기보관</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[#4A4741]">
                      <div>
                        <span className="font-medium block">구절메모</span>
                        <span className="text-[10px] text-[#8C877D]">구절에 메모된 모든 노트 (구절 주석, 관주, 노트)</span>
                      </div>
                      <span className="font-semibold text-[#2B2927]">
                        {resourceCounts.noteCount}개 <span className="text-[#8C877D]">/ 기기보관</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[#4A4741]">
                      <div>
                        <span className="font-medium block">AI 주석</span>
                        <span className="text-[10px] text-[#8C877D]">심층 생성된 구절별 AI 주석</span>
                      </div>
                      <span className="font-semibold text-[#2B2927]">
                        {resourceCounts.commentaryCount} 구절 <span className="text-[#C46A40]">/ 30일 보관</span>
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* [친구초대 1+1 선물] */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-[#6E6A63]">친구초대 1+1 선물</span>

              <div className="p-4 sm:p-5 rounded-xl bg-[#FAF8F5] border border-[#EAE4DC] space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#EAE4DC]">
                  <span className="text-xs font-bold text-[#2B2927]">총 선물 받은 크레딧</span>
                  <span className="text-sm font-bold text-[#C46A40]">
                    {usageState.bonusRemaining || 0} 크레딧
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-[#2B2927]">초대한 친구</div>
                      <div className="text-[11px] text-[#8C877D]">
                        {referralCount === 0 ? '아직 초대한 친구가 없습니다.' : `${referralCount}명 초대 완료`}
                      </div>
                    </div>
                    <span className="font-medium text-[#6E6A63] font-mono">{referralCount}/10</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-[#2B2927]">1회 이상 주석 생성 친구</div>
                      <div className="text-[11px] text-[#8C877D]">
                        {activeReferralCount === 0 ? '첫 주석 생성을 완료한 친구가 아직 없습니다.' : `${activeReferralCount}명이 첫 주석 생성을 완료했습니다!`}
                      </div>
                    </div>
                    <span className="font-medium text-[#6E6A63] font-mono">{activeReferralCount}/10</span>
                  </div>
                </div>

                {/* 특별 혜택 카드 */}
                <div className="p-3.5 rounded-xl bg-white border border-[#EAE4DC] space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-[#2B2927]">
                      <BookOpen className="w-3.5 h-3.5 text-[#C46A40]" />
                      <span>Nations sermon 3개월 구독권 혜택</span>
                    </div>
                    <span className="font-bold text-[#C46A40] text-[11px]">{Math.min(activeReferralCount, 10)}/10 달성 중</span>
                  </div>
                  <p className="text-[11px] text-[#8C877D] leading-relaxed">
                    초대한 친구 10명을 달성하고 10명 모두가 AI 주석을 1회 이상 생성하면{' '}
                    <strong className="text-[#2B2927]">Nations sermon(설교 숏폼앱) 미디어 라이트 3개월 구독권</strong>이 즉시 무료 지급됩니다.
                  </p>
                </div>

                {/* 나의 초대링크 복사 및 카카오톡 초대장 전송 버튼 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={handleCopyInviteLink}
                    className="w-full py-2.5 px-4 bg-white hover:bg-[#F3EFE9] border border-[#ECD9CC] text-[#C46A40] rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{inviteCopied ? '초대링크 복사 완료!' : '나의 초대링크 복사하기'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const userName = auth.currentUser?.displayName || getSocialUserMeta(auth.currentUser)?.displayName || '성도';
                      const ok = shareInviteViaKakao({
                        inviteUrl: inviteLink,
                        userName,
                        appName: 'NATIONS BIBLE',
                      });
                      if (!ok) handleCopyInviteLink();
                    }}
                    className="w-full py-2.5 px-4 bg-[#FEE500] hover:bg-[#FDD800] text-[#191919] rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>카카오톡으로 초대장 보내기</span>
                  </button>
                </div>
              </div>
            </div>

            {/* [계정 삭제] */}
            <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#EAE4DC] flex items-center justify-between">
              <div>
                <strong className="text-xs font-bold text-[#2B2927] block">계정 삭제</strong>
                <span className="text-[11px] text-[#8C877D]">계정의 모든 데이터가 영구삭제되고 복구할 수 없습니다.</span>
              </div>
              <button
                onClick={() => setDeleteConfirmModal(true)}
                className="px-3.5 py-1.5 bg-white border border-[#E0DAD1] hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-xs text-[#6E6A63] font-medium rounded-lg transition-colors cursor-pointer"
              >
                계정 삭제
              </button>
            </div>

          </div>
        </div>

        {/* ───── 성경번역본 텍스트 지원 형식 및 업로드 안내 ───── */}
        <section className="bg-white rounded-2xl border border-[#E5E0D8] p-5 sm:p-7 shadow-xs space-y-4">
          <h2 className="font-serif font-bold text-sm text-[#2B2927] flex items-center gap-2 border-b border-[#F0EBE1] pb-2.5">
            <Shield className="w-4 h-4 text-[#6E6A63] stroke-[1.8px]" />
            성경번역본 텍스트 업로드 및 지원 형식 안내
          </h2>

          {/* 개역개정, NIV 기타 번역본 사용법 무료문의 */}
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

        {/* ───── 본문 서체 및 간격 설정 섹션 ───── */}
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
                  {lineHeight.toFixed(1)}배
                </span>
              </div>
              <input
                type="range"
                min="1.2"
                max="2.5"
                step="0.1"
                value={lineHeight}
                onChange={(e) => setLineHeight(parseFloat(e.target.value))}
                className="w-full accent-[#C96442] cursor-pointer h-1.5 bg-[#E5E0D8] rounded-lg"
              />
              <div className="flex gap-1.5 mt-3">
                {[1.4, 1.6, 1.8, 2.0].map((height) => (
                  <button
                    key={height}
                    onClick={() => setLineHeight(height)}
                    className={`flex-1 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer border ${
                      lineHeight === height 
                        ? 'bg-[#C96442] text-white border-[#C96442] shadow-2xs' 
                        : 'bg-white text-[#6E6A63] border-[#E5E0D8] hover:bg-[#F3EFE9]'
                    }`}
                  >
                    {height.toFixed(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* (3) 구절 간격 */}
            <div className="bg-[#FAF8F5] p-3.5 rounded-xl border border-[#EAE4DC] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#2B2927] flex items-center gap-1.5">
                  <Space className="w-3.5 h-3.5 text-[#C96442]" />
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
                className="w-full accent-[#C96442] cursor-pointer h-1.5 bg-[#E5E0D8] rounded-lg"
              />
              <div className="flex gap-1.5 mt-3">
                {[0, 6, 12, 18].map((spacing) => (
                  <button
                    key={spacing}
                    onClick={() => setVerseSpacing(spacing)}
                    className={`flex-1 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer border ${
                      verseSpacing === spacing 
                        ? 'bg-[#C96442] text-white border-[#C96442] shadow-2xs' 
                        : 'bg-white text-[#6E6A63] border-[#E5E0D8] hover:bg-[#F3EFE9]'
                    }`}
                  >
                    {spacing}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 실시간 미리보기 상자 */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#2B2927] flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-[#6E6A63]" />
                실시간 미리보기
              </span>
              <span className="text-[11px] text-[#8C877D]">
                창세기 1장 1-3절
              </span>
            </div>

            <div className="bg-[#FAF8F5] p-5 rounded-xl border border-[#EAE4DC] space-y-1">
              <div className="border-b border-[#EAE4DC] pb-2 mb-3 text-xs text-[#8C877D] flex items-center justify-between">
                <span className="font-serif font-bold text-[#C96442]">개역개정 (미리보기)</span>
                <span>글꼴 {fontSize}px • 줄간격 {lineHeight.toFixed(1)}배 • 구절간격 {verseSpacing}px</span>
              </div>

              {SAMPLE_VERSES.map((v) => (
                <div 
                  key={v.num}
                  style={{ marginBottom: `${verseSpacing}px` }}
                  className="flex items-baseline gap-3"
                >
                  <span 
                    style={{ 
                      fontSize: `${Math.max(11, Math.round(fontSize * 0.68))}px` 
                    }}
                    className="font-semibold w-5 shrink-0 text-right select-none text-[#8C877D] font-mono"
                  >
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

        {/* 3. Search Font Size */}
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

        {/* 4. Footer & Legal Information */}
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

      {/* 계정 삭제 확인 팝업 모달 */}
      {deleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs select-none">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-[#E5E0D8] p-5 space-y-4">
            <h3 className="text-sm font-bold text-red-600">계정 영구 삭제 안내</h3>
            <p className="text-xs text-[#6E6A63] leading-relaxed">
              계정을 삭제하시면 작성하신 모든 설교노트, 구절메모, 생성된 주석 기록 및 잔여 크레딧이 영구적으로 복구 불가능하게 삭제됩니다.
              <br/><br/>
              정말 계정을 삭제하시려면 고객센터(1:1 문의)로 탈퇴 요청을 접수해주시면 즉시 파기 처리해 드립니다.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmModal(false)}
                className="px-3.5 py-1.5 text-xs text-[#6E6A63] bg-[#F3EFE9] hover:bg-[#EAE4DC] rounded-xl font-medium cursor-pointer"
              >
                취소
              </button>
              <a
                href={policy.kakaoChatUrl || 'http://pf.kakao.com/_cxjBxaX/chat'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setDeleteConfirmModal(false)}
                className="px-3.5 py-1.5 text-xs text-white bg-red-600 hover:bg-red-700 rounded-xl font-medium cursor-pointer"
              >
                1:1 문의로 탈퇴 요청
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 이용약관 & 개인정보 처리방침 열람 모달 */}
      <PolicyViewModal
        isOpen={policyModal.isOpen}
        initialTab={policyModal.tab}
        onClose={() => setPolicyModal({ isOpen: false, tab: 'terms' })}
      />
    </div>
  );
};
