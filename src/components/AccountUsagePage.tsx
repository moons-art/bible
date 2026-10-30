import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Cloud, Copy, FileEdit, Building2, ExternalLink,
  CreditCard, History, HardDrive, Database, User, RefreshCw, ChevronRight, Sparkles, BarChart2
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

interface AccountUsagePageProps {
  onClose: () => void;
  onOpenAdminModal: () => void;
  onOpenPricing?: () => void;
  initialTab?: 'all' | 'usage' | 'account';
}

export const AccountUsagePage: React.FC<AccountUsagePageProps> = ({
  onClose,
  onOpenAdminModal,
  onOpenPricing,
  initialTab = 'all',
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
    memoCount: 0,
    commentaryCount: 0
  });

  const [deleteConfirmModal, setDeleteConfirmModal] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  useEffect(() => {
    getSitePolicy().then(setPolicy);
    const u = auth.currentUser;
    if (u) {
      getLocalUserResourceCounts(u.uid).then(counts => {
        const totalCommentaries = getTotalMergedCommentaryCount(u.uid);
        setResourceCounts({
          ...counts,
          commentaryCount: totalCommentaries
        });
      });
    }
  }, []);

  const formatDate = (ts?: number) => {
    if (!ts) return '-';
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  };

  // 다음 초기화일 계산 (결제일 기준 익월 동일 일자)
  const getNextResetDate = () => {
    const paymentTimestamp = subscribedAt || cloudSubscribedAt;
    const now = new Date();
    if (paymentTimestamp) {
      const payDate = new Date(paymentTimestamp);
      const payDay = payDate.getDate();
      let targetYear = now.getFullYear();
      let targetMonth = now.getMonth();

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

  // AI 원어주석 & 설교자료 사용량
  const aiCommentaryCount = usageState.totalUsed || 0;
  const aiCommentaryCredits = aiCommentaryCount * 1;
  const sermonMaterialSetCount = 0;
  const sermonMaterialCredits = sermonMaterialSetCount * 20;

  // 월소진 크레딧 잔여
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

          <div className="flex items-center gap-2">
            <span className="font-serif font-bold text-sm text-[#2B2927] flex items-center gap-1.5">
              <BarChart2 className="w-4 h-4 text-[#C46A40]" />
              사용량 및 계정 관리
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#2B2927] text-white hover:bg-[#1F1E1D] text-xs font-medium rounded-xl transition-all cursor-pointer shadow-2xs"
          >
            완료
          </button>
        </div>

        {/* ───── 계정 관리 카드 ───── */}
        <div id="settings-account-section" className="bg-white rounded-2xl border border-[#E5E0D8] shadow-2xs overflow-hidden">
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
            {/* 구독 플랜 정보 & 결제 플랜 업그레이드 배너 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#FAF9F5] border border-[#E5E0D8]">
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-[#8C877D] block">현재 이용 중인 플랜</span>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-[#2B2927]">{planDisplayName}</span>
                  {isCloudPlan ? (
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-[#FAF0EB] text-[#C46A40] rounded-full border border-[#F1D3C6]">
                      클라우드 플랜
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-[#F0EBE1] text-[#6E6A63] rounded-full">
                      무료 플랜
                    </span>
                  )}
                </div>
                {isCloudPlan && (
                  <p className="text-[11px] text-[#8C877D]">
                    구독 시작일: {formatDate(cloudSubscribedAt || subscribedAt)}
                  </p>
                )}
              </div>

              {onOpenPricing && (
                <button
                  onClick={onOpenPricing}
                  className="px-4 py-2 bg-[#C46A40] hover:bg-[#A8532B] text-white text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-2xs shrink-0"
                >
                  {isCloudPlan ? '플랜 변경' : '플랜 업그레이드'}
                </button>
              )}
            </div>

            {/* ─── 친구 초대 1+1 특별 혜택 ─── */}
            <div className="p-4 rounded-xl bg-[#FAF3EC] border border-[#ECD9CC] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#C46A40]">🎁 친구 초대 1+1 보너스</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#C46A40] text-white font-semibold">혜택</span>
                </div>
              </div>
              <p className="text-xs text-[#8C6D58] leading-relaxed">
                친구가 내 초대 링크로 가입하면, <strong>친구에게 10크레딧</strong>, <strong>나에게도 10크레딧</strong>이 즉시 추가 지급됩니다! (최대 100회)
              </p>

              {/* 내 초대 링크 복사 & 카카오톡 공유 */}
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <div className="flex-1 flex items-center gap-1.5 bg-white px-3 py-2 rounded-lg border border-[#ECD9CC] text-xs">
                  <span className="text-[#8C877D] truncate font-mono select-all flex-1">{inviteLink}</span>
                  <button
                    onClick={handleCopyInviteLink}
                    className="shrink-0 px-2.5 py-1 bg-[#FAF3EC] hover:bg-[#F5EAE0] text-[#C46A40] font-semibold rounded text-[11px] transition-colors cursor-pointer"
                  >
                    {inviteCopied ? '복사됨!' : '링크 복사'}
                  </button>
                </div>

                <button
                  onClick={() => shareInviteViaKakao(inviteCode)}
                  className="px-3.5 py-2 bg-[#FEE500] hover:bg-[#FDD800] text-[#3C1E1E] text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
                >
                  <svg className="w-3.5 h-3.5 stroke-[#3C1E1E] stroke-[2.8] fill-none shrink-0" viewBox="0 0 24 24">
                    <path d="M12 3c-5.52 0-10 3.58-10 8 0 2.87 1.89 5.4 4.77 6.77l-1.2 4.43c-.11.41.34.75.7.53l5.24-3.48c.16.01.32.02.49.02 5.52 0 10-3.58 10-8s-4.48-8-10-8z" />
                  </svg>
                  <span>카카오톡으로 초대장 보내기</span>
                </button>
              </div>
            </div>

            {/* ─── AI 크레딧 현황 및 사용량 ─── */}
            <div id="settings-usage-section" className="space-y-4 pt-2">
              <div className="flex items-center justify-between border-b border-[#F0EBE1] pb-2">
                <h3 className="font-bold text-sm text-[#2B2927] flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#C46A40]" />
                  AI 연구 크레딧 현황 및 사용량
                </h3>
                <span className="text-[11px] text-[#8C877D]">
                  다음 충전(초기화)일: <strong className="text-[#2B2927]">{getNextResetDate()}</strong>
                </span>
              </div>

              {/* 3단 메트릭 카드: 총 잔여 / 당월 소진 잔여 / 유료·보너스 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1) 총 보유 크레딧 */}
                <div className="p-3.5 bg-[#FAF9F5] rounded-xl border border-[#E5E0D8] space-y-1">
                  <span className="text-[11px] text-[#8C877D] font-medium block">총 이용 가능 크레딧</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-[#C46A40]">{totalRemaining}</span>
                    <span className="text-xs text-[#8C877D]">회</span>
                  </div>
                  <span className="text-[10px] text-[#A39E94] block">모든 서비스에 바로 사용 가능</span>
                </div>

                {/* 2) 당월 소진 크레딧 (월간 할당분) */}
                <div className="p-3.5 bg-[#FAF9F5] rounded-xl border border-[#E5E0D8] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#8C877D] font-medium">월 정기 크레딧</span>
                    <span className="text-[10px] text-[#C46A40] font-semibold">{monthlyUsed}/{monthlyTotalCapacity}회 소진</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-[#2B2927]">{monthlyRemainingCredits}</span>
                    <span className="text-xs text-[#8C877D]">/{monthlyTotalCapacity}회</span>
                  </div>
                  {/* 프로그레스 바 */}
                  <div className="w-full bg-[#E5E0D8] h-1.5 rounded-full overflow-hidden mt-1.5">
                    <div 
                      className="bg-[#C46A40] h-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.round((monthlyUsed / monthlyTotalCapacity) * 100))}%` }}
                    />
                  </div>
                </div>

                {/* 3) 유료/보너스 충전 크레딧 */}
                <div className="p-3.5 bg-[#FAF9F5] rounded-xl border border-[#E5E0D8] space-y-1">
                  <span className="text-[11px] text-[#8C877D] font-medium block">유료 충전 및 보너스</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-[#2B2927]">{paidRemaining}</span>
                    <span className="text-xs text-[#8C877D]">회</span>
                  </div>
                  <span className="text-[10px] text-[#A39E94] block">유효기간 1년 · 소멸 없음</span>
                </div>
              </div>

              {/* 서비스별 세부 사용량 현황 테이블 */}
              <div className="bg-[#FAF9F5] rounded-xl border border-[#E5E0D8] p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[#EAE4DA] pb-2">
                  <span className="text-xs font-bold text-[#2B2927]">서비스별 실시간 사용량 현황</span>
                  <span className="text-[10px] text-[#8C877D]">누적 기준</span>
                </div>

                <div className="space-y-2 text-xs">
                  {/* AI 원어·배경·설교 주석 */}
                  <div className="flex items-center justify-between py-1.5 border-b border-[#F0EBE1]">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#C46A40]"></div>
                      <span className="text-[#2B2927]">AI 원어·배경·설교 주석</span>
                      <span className="text-[10px] text-[#8C877D] bg-white px-1.5 py-0.5 rounded border border-[#E5E0D8]">1회당 1크레딧</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-[#2B2927]">{aiCommentaryCount}회</span>
                      <span className="text-[11px] text-[#8C877D] ml-1.5">({aiCommentaryCredits}크레딧 차감)</span>
                    </div>
                  </div>

                  {/* AI 설교 완성 자료 */}
                  <div className="flex items-center justify-between py-1.5 border-b border-[#F0EBE1]">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#8C877D]"></div>
                      <span className="text-[#2B2927]">AI 설교 완성 자료 1세트</span>
                      <span className="text-[10px] text-[#8C877D] bg-white px-1.5 py-0.5 rounded border border-[#E5E0D8]">1세트당 20크레딧</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-[#2B2927]">{sermonMaterialSetCount}세트</span>
                      <span className="text-[11px] text-[#8C877D] ml-1.5">({sermonMaterialCredits}크레딧 차감)</span>
                    </div>
                  </div>

                  {/* 합계 */}
                  <div className="flex items-center justify-between pt-1 font-bold">
                    <span className="text-[#2B2927]">총 차감 누적 합계</span>
                    <span className="text-[#C46A40] text-sm">
                      {aiCommentaryCredits + sermonMaterialCredits} 크레딧
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── 클라우드 저장소 사용 현황 ─── */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between border-b border-[#F0EBE1] pb-2">
                <h3 className="font-bold text-sm text-[#2B2927] flex items-center gap-1.5">
                  <Cloud className="w-4 h-4 text-[#C46A40]" />
                  클라우드 저장소 사용 현황
                </h3>
                <span className="text-[11px] text-[#8C877D]">
                  {isCloudPlan ? '안전하게 서버 실시간 백업 중' : '로컬 브라우저 저장 모드'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1) 설교노트 개수 */}
                <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E5E0D8] space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-[#8C877D]">
                    <FileEdit className="w-3.5 h-3.5 text-[#C46A40]" />
                    <span>작성한 설교노트</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold text-[#2B2927]">{resourceCounts.sermonCount}</span>
                    <span className="text-xs text-[#8C877D]">편</span>
                  </div>
                  <span className="text-[10px] text-[#8C877D] block">클라우드 무제한 자동 동기화</span>
                </div>

                {/* 2) 개인 구절 메모 */}
                <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E5E0D8] space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-[#8C877D]">
                    <HardDrive className="w-3.5 h-3.5 text-[#6E6A63]" />
                    <span>개인 구절 메모</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold text-[#2B2927]">{resourceCounts.memoCount}</span>
                    <span className="text-xs text-[#8C877D]">개</span>
                  </div>
                  <span className="text-[10px] text-[#8C877D] block">성경 뷰어 구절별 메모 보관</span>
                </div>

                {/* 3) 보관된 AI 주석 기록 */}
                <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E5E0D8] space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-[#8C877D]">
                    <Database className="w-3.5 h-3.5 text-[#6E6A63]" />
                    <span>보관된 AI 주석</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold text-[#2B2927]">
                      {isCloudPlan ? `${usedCloudCommentaryCount}/${cloudCommentaryLimit}` : resourceCounts.commentaryCount}
                    </span>
                    <span className="text-xs text-[#8C877D]">개</span>
                  </div>
                  <span className="text-[10px] text-[#8C877D] block">
                    {isCloudPlan ? `클라우드 한도 (${Math.round((usedCloudCommentaryCount/cloudCommentaryLimit)*100)}% 사용)` : '기본 로컬 저장'}
                  </span>
                </div>
              </div>
            </div>

            {/* 계정 삭제(회원 탈퇴) 안내 링크 */}
            <div className="pt-4 border-t border-[#F0EBE1] flex items-center justify-between">
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
