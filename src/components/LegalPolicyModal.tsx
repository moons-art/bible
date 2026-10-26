import React, { useState, useEffect } from 'react';
import { X, Shield, FileText, RotateCcw, Building2, ExternalLink } from 'lucide-react';

export type LegalPolicyTab = 'terms' | 'privacy' | 'refund' | 'business';

interface LegalPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: LegalPolicyTab;
}

export default function LegalPolicyModal({ isOpen, onClose, initialTab = 'terms' }: LegalPolicyModalProps) {
  const [activeTab, setActiveTab] = useState<LegalPolicyTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs select-none"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        className="w-full max-w-3xl bg-[#FAF9F7] rounded-3xl shadow-2xl border border-[#E8E4DC] overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-6 py-4.5 border-b border-[#E8E4DC] flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FAF0EB] flex items-center justify-center text-[#DA7756]">
              {activeTab === 'terms' && <FileText className="w-5 h-5" />}
              {activeTab === 'privacy' && <Shield className="w-5 h-5" />}
              {activeTab === 'refund' && <RotateCcw className="w-5 h-5" />}
              {activeTab === 'business' && <Building2 className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#1C1A18] font-serif">
                {activeTab === 'terms' && '서비스 이용약관'}
                {activeTab === 'privacy' && '개인정보 처리방침'}
                {activeTab === 'refund' && '디지털 콘텐츠 청약철회 및 환불 규정'}
                {activeTab === 'business' && '사업자 정보 및 법적 고지'}
              </h2>
              <p className="text-[11px] text-[#8C877D]">
                네이션스 솔루션 • 전자상거래법 및 PG사 가맹점 심사 기준 준수
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#8C877D] hover:text-[#1C1A18] hover:bg-[#F3EFE9] transition-colors cursor-pointer"
            title="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex items-center gap-2 px-6 py-2.5 bg-[#F4F1EA] border-b border-[#E8E4DC] shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'terms'
                ? 'bg-white text-[#1C1A18] shadow-xs'
                : 'text-[#7D786F] hover:text-[#1C1A18]'
            }`}
          >
            서비스 이용약관
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'privacy'
                ? 'bg-white text-[#1C1A18] shadow-xs'
                : 'text-[#7D786F] hover:text-[#1C1A18]'
            }`}
          >
            개인정보 처리방침
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('refund')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'refund'
                ? 'bg-[#DA7756] text-white shadow-xs'
                : 'text-[#DA7756] hover:bg-[#FAF0EB]'
            }`}
          >
            청약철회 및 환불 규정 (필수)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('business')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'business'
                ? 'bg-white text-[#1C1A18] shadow-xs'
                : 'text-[#7D786F] hover:text-[#1C1A18]'
            }`}
          >
            사업자 정보 확인
          </button>
        </div>

        {/* 본문 컨텐츠 */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-[#5C5850] leading-relaxed">
          {activeTab === 'terms' && (
            <div className="space-y-4">
              <h3 className="font-bold text-sm text-[#1C1A18]">제1조 (목적)</h3>
              <p>
                본 약관은 "더네이션스 솔루션"(이하 "회사")이 제공하는 NATIONS BIBLE AI 및 패밀리 웹/앱 서비스(이하 "서비스")의 이용조건 및 절차, 회사와 회원 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
              </p>

              <h3 className="font-bold text-sm text-[#1C1A18]">제2조 (용어의 정의)</h3>
              <p>
                1. "서비스"란 회사가 제공하는 성경 본문 열람, 다중 역본 대조, 주석 및 설교노트 에디터, AI 원어 주석, 클라우드 동기화 및 관련 디지털 콘텐츠 서비스를 의미합니다.<br />
                2. "회원"이란 서비스에 접속하여 본 약관에 동의하고 계정을 생성하여 서비스를 이용하는 자를 의미합니다.<br />
                3. "유료 서비스"란 회사가 유료로 제공하는 클라우드 멤버십 정기구독권(라이트/프로/마스터) 및 AI 크레딧 충전 상품을 의미합니다.
              </p>

              <h3 className="font-bold text-sm text-[#1C1A18]">제3조 (약관의 효력 및 변경)</h3>
              <p>
                1. 회사는 본 약관의 내용을 회원이 쉽게 알 수 있도록 서비스 화면 내에 게시합니다.<br />
                2. 회사는 약관의 규제에 관한 법률, 정보통신망법, 전자상거래법 등 관련 법령을 위배하지 않는 범위에서 본 약관을 개정할 수 있습니다.
              </p>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-4">
              <h3 className="font-bold text-sm text-[#1C1A18]">1. 개인정보 수집 및 이용 목적</h3>
              <p>
                회사는 다음 목적을 위해 필요한 최소한의 개인정보를 수집·이용합니다.<br />
                - 회원 식별, 간편 로그인(Google, Kakao, Naver) 연동 및 본인 확인<br />
                - 클라우드 설교노트 및 구절 주석 데이터 저장, 기기 간 동기화<br />
                - 유료 멤버십 구독 결제, AI 크레딧 지급 및 전자세금계산서/영수증 발행<br />
                - 고객 상담 및 분쟁 해결, 공지사항 전달
              </p>

              <h3 className="font-bold text-sm text-[#1C1A18]">2. 수집하는 개인정보 항목</h3>
              <p>
                - 필수항목: 소셜 로그인 식별자(UID), 이메일, 닉네임(이름)<br />
                - 결제 시: 주문번호, 결제승인키, 마스킹된 카드정보(카드사명, 일부 번호)<br />
                - 서비스 이용과정: 접속 로그, 서비스 이용 기록
              </p>

              <h3 className="font-bold text-sm text-[#1C1A18]">3. 개인정보의 보유 및 이용기간</h3>
              <p>
                회원 탈퇴 시 원칙적으로 지체 없이 파기합니다. 단, 전자상거래법 등 관계 법령에 의해 보존할 필요가 있는 경우 해당 법정 기간 동안 안전하게 보관합니다.<br />
                - 계약 또는 청약철회 등에 관한 기록: 5년<br />
                - 대금결제 및 재화 등의 공급에 관한 기록: 5년<br />
                - 소비자의 불만 또는 분쟁처리에 관한 기록: 3년
              </p>
            </div>
          )}

          {activeTab === 'refund' && (
            <div className="space-y-4 bg-white p-5 rounded-2xl border border-[#F1D3C6]">
              <div className="p-3 bg-[#FAF0EB] rounded-xl text-[#DA7756] text-xs font-bold flex items-center gap-2">
                <RotateCcw className="w-4 h-4 shrink-0" />
                <span>전자상거래 등에서의 소비자보호에 관한 법률 제17조 및 심사 규정 준수</span>
              </div>

              <h3 className="font-bold text-sm text-[#1C1A18]">제1조 (청약철회 및 환불 기본 원칙)</h3>
              <p>
                1. 회원이 구매한 유료 멤버십(정기결제) 상품은 결제일로부터 <strong>7일 이내</strong>에 서비스를 전혀 이용하지 아니한 경우(AI 크레딧 사용 없음, 클라우드 신규 동기화 없음) 전액 환불이 보장됩니다.<br />
                2. 회사는 전자상거래법 제17조 제2항 제5호 및 디지털콘텐츠이용자보호지침에 따라, 용역 또는 디지털콘텐츠의 제공이 개시된 경우(AI 원어 주석 생성, 크레딧 1회 이상 차감 등)에는 청약철회가 제한될 수 있음을 결제 화면 및 본 약관에 명시합니다.
              </p>

              <h3 className="font-bold text-sm text-[#1C1A18]">제2조 (정기구독 해지 및 자동 결제 취소)</h3>
              <p>
                1. 회원은 정기구독(클라우드 라이트, 프로, 마스터) 결제일 이전 언제든지 [내 계정] 메뉴 또는 고객센터를 통해 수수료나 위약금 없이 즉시 다음 결제 예약 해지를 신청할 수 있습니다.<br />
                2. 해지 신청 시 다음 결제 주기의 자동 결제가 즉시 중단되며, 이미 결제된 당월/당해 잔여 이용 기간까지는 유료 멤버십 혜택을 정상적으로 이용하실 수 있습니다.
              </p>

              <h3 className="font-bold text-sm text-[#1C1A18]">제3조 (크레딧 충전 상품의 환불)</h3>
              <p>
                1. 구매 후 7일 이내에 단 1 크레딧도 사용하지 않은 경우 전액 환불됩니다.<br />
                2. 일부 크레딧을 사용한 경우에는 디지털 콘텐츠 특성상 중도 분할 환불이 제한됩니다. 단, 회사의 귀책 사유로 인하여 서비스를 정상적으로 제공할 수 없는 경우에는 잔여 크레딧에 대해 일할 계산하여 환불 조치합니다.
              </p>

              <h3 className="font-bold text-sm text-[#1C1A18]">제4조 (환불 신청 절차)</h3>
              <p>
                환불 신청은 고객지원센터(카카오톡 1:1 상담 @thenations 또는 이메일)를 통해 접수할 수 있으며, 결제 수단(신용카드 결제 취소)에 따라 영업일 기준 3~5일 이내에 취소 처리됩니다.
              </p>
            </div>
          )}

          {activeTab === 'business' && (
            <div className="space-y-4 bg-white p-5 rounded-2xl border border-[#EAE8E1]">
              <h3 className="font-bold text-sm text-[#1C1A18]">사업자 신원정보 확인</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-[#FAF9F7] rounded-xl border border-[#EAE8E1]">
                  <span className="text-[#8C877D] block mb-1">상호명</span>
                  <strong className="text-sm text-[#1C1A18]">더네이션스 솔루션</strong>
                </div>
                <div className="p-3 bg-[#FAF9F7] rounded-xl border border-[#EAE8E1]">
                  <span className="text-[#8C877D] block mb-1">대표자</span>
                  <strong className="text-sm text-[#1C1A18]">유문식</strong>
                </div>
                <div className="p-3 bg-[#FAF9F7] rounded-xl border border-[#EAE8E1]">
                  <span className="text-[#8C877D] block mb-1">사업자등록번호</span>
                  <strong className="text-sm text-[#1C1A18]">712-14-02380</strong>
                </div>
                <div className="p-3 bg-[#FAF9F7] rounded-xl border border-[#EAE8E1]">
                  <span className="text-[#8C877D] block mb-1">고객센터 / 채널상담</span>
                  <strong className="text-sm text-[#1C1A18]">카카오톡 @thenations</strong>
                </div>
              </div>
              <p className="text-[11px] text-[#7D786F]">
                네이션스 솔루션은 공정거래위원회 표준 전자상거래 약관 및 통신판매업 규정을 준수합니다.
              </p>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-6 py-4 border-t border-[#E8E4DC] bg-white flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-[#1C1A18] text-white text-xs font-bold hover:bg-black transition-colors cursor-pointer"
          >
            확인 및 닫기
          </button>
        </div>
      </div>
    </div>
  );
}
