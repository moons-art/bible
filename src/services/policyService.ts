// NATIONS BIBLE 서비스 정책, 약관, 사업자 정보 및 카카오톡 채널 관리 서비스
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../api/firebaseConfig';

export interface SitePolicy {
  businessName: string;         // 서비스 / 상호명
  representative: string;       // 대표자명
  contactEmail: string;         // 고객센터 / 문의 이메일
  businessNumber: string;       // 사업자등록번호
  ecommerceNumber: string;      // 통신판매업신고번호
  copyright: string;            // 저작권 문구
  kakaoChannelName: string;     // 카카오톡 채널 이름
  kakaoChannelUrl: string;      // 카카오톡 채널 홈 URL
  kakaoChatUrl: string;         // 카카오톡 채널 1:1 채팅 URL
  termsOfService: string;       // 서비스 이용약관
  privacyPolicy: string;        // 개인정보 처리방침
  updatedAt?: number;
}

export const DEFAULT_SITE_POLICY: SitePolicy = {
  businessName: '네이션스 솔루션',
  representative: '',
  contactEmail: 'ymoonsik@gmail.com',
  businessNumber: '',
  ecommerceNumber: '',
  copyright: 'Copyright © 2026 Nations. All rights reserved.',
  kakaoChannelName: '네이션스 솔루션',
  kakaoChannelUrl: 'http://pf.kakao.com/_cxjBxaX',
  kakaoChatUrl: 'http://pf.kakao.com/_cxjBxaX/chat',
  termsOfService: `제1조 (목적)
본 약관은 네이션스 솔루션(이하 "회사")이 제공하는 성경 연구, 묵상 및 관련 디지털 콘텐츠 서비스(이하 "서비스")의 이용 조건 및 절차에 관한 제반 사항을 규정함을 목적으로 합니다.

제2조 (용어의 정의)
1. "이용자"란 본 서비스에 접속하여 본 약관에 따라 서비스를 이용하는 회원 및 비회원을 말합니다.
2. "회원"이란 서비스에 개인정보를 제공하여 회원등록을 한 자로서, 서비스의 정보를 지속적으로 제공받으며 서비스를 계속적으로 이용할 수 있는 자를 말합니다.

제3조 (약관의 효력 및 변경)
1. 본 약관은 서비스 화면에 게시하거나 기타의 방법으로 이용자에게 공지함으로써 효력이 발생합니다.
2. 회사는 합리적인 사유가 발생할 경우 관련 법령에 위배되지 않는 범위 안에서 본 약관을 개정할 수 있습니다.

제4조 (서비스의 제공 및 변경)
1. 회사는 성경 본문 열람, 구절 주석, 설교 노트, 찬양집 및 AI 연구 기능 등 다양한 편의 기능을 제공합니다.
2. 서비스는 연중무휴, 1일 24시간 제공함을 원칙으로 하나 시스템 점검 등 필요한 경우 일시 중단될 수 있습니다.

제5조 (지적재산권의 귀속)
1. 서비스 내의 모든 콘텐츠 및 저작물에 대한 저작권 및 기타 지적재산권은 회사 또는 정당한 권리자에게 귀속됩니다.
2. 이용자는 서비스를 통해 얻은 정보를 사전 승낙 없이 복제, 송신, 출판, 배포, 방송 기타 방법에 의하여 영리 목적으로 이용할 수 없습니다.

제6조 (면책조항)
1. 회사는 천재지변 또는 이에 준하는 불가항력으로 인하여 서비스를 제공할 수 없는 경우에는 서비스 제공에 관한 책임이 면제됩니다.
2. 회사는 무료로 제공되는 서비스 이용과 관련하여 관련 법령에 특별한 규정이 없는 한 책임을 지지 않습니다.

부칙
본 약관은 2026년 1월 1일부터 시행됩니다.`,

  privacyPolicy: `네이션스 솔루션(이하 "회사")은 이용자의 개인정보를 중요시하며, 「개인정보 보호법」 등 관련 법령을 준수하고 있습니다.

1. 개인정보의 수집 항목 및 수집 방법
- 필수 항목: 구글 계정 고유 식별자(UID), 이메일 주소, 이름(닉네임), 프로필 이미지 URL
- 자동 수집 항목: 접속 기기 환경 정보(OS, 브라우저 유형), 로그인 일시 및 횟수, 서비스 이용 기록
- 수집 방법: 구글 소셜 로그인 및 회원가입 시 이용자의 동의를 통한 수집

2. 개인정보의 수집 및 이용 목적
- 회원 식별 및 가입 의사 확인
- 개인별 성경 묵상 노트, 설교 데이터, AI 주석 사용 기록의 안전한 클라우드 동기화
- AI 연구 크레딧 관리 및 부정 이용 방지
- 고객 문의 및 1:1 상담 응대

3. 개인정보의 보유 및 이용 기간
- 이용자의 개인정보는 회원 탈퇴 시까지 보유하며, 회원 탈퇴 시 지체 없이 파기합니다.
- 단, 관계 법령의 규정에 의하여 보존할 필요가 있는 경우 관련 법령에서 정한 일정한 기간 동안 개인정보를 보관합니다.

4. 개인정보의 제3자 제공
회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만, 이용자가 사전에 동의한 경우나 법령의 규정에 의한 경우는 예외로 합니다.

5. 개인정보 처리 위탁
- 인프라 및 데이터 저장: Google Cloud Platform (Firebase)
- AI 서비스 제공: Google Gemini API (이용자의 개인 식별 정보는 AI 분석에 사용되지 않습니다)

6. 이용자의 권리와 그 행사 방법
이용자는 언제든지 등록되어 있는 자신의 개인정보를 조회하거나 수정할 수 있으며, 회원 탈퇴를 통해 개인정보 삭제를 요청할 수 있습니다.

7. 개인정보 보호책임자 및 담당 부서
- 담당자: 네이션스 솔루션 개인정보보호팀
- 이메일: ymoonsik@gmail.com
- 카카오톡 1:1 문의: http://pf.kakao.com/_cxjBxaX/chat

공고일자: 2026년 1월 1일
시행일자: 2026년 1월 1일`
};

const STORAGE_KEY = 'nations_site_policy_cache_v1';

/**
 * 서비스 정책 및 사업자 정보 조회 (캐시 우선 + Firestore 실시간 동기화)
 */
export async function getSitePolicy(): Promise<SitePolicy> {
  // 1. 로컬 캐시 확인
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      // 백그라운드에서 최신 데이터 비동기 갱신
      fetchRemoteSitePolicy().catch(() => {});
      return { ...DEFAULT_SITE_POLICY, ...parsed };
    }
  } catch (e) {}

  return await fetchRemoteSitePolicy();
}

/**
 * 원격 Firestore에서 최신 정책 정보 로드
 */
export async function fetchRemoteSitePolicy(): Promise<SitePolicy> {
  try {
    const docRef = doc(db, 'settings', 'site_policy');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as SitePolicy;
      const merged = { ...DEFAULT_SITE_POLICY, ...data };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch (e) {}
      return merged;
    }
  } catch (err) {
    console.warn('[policyService] fetchRemoteSitePolicy fallback to default:', err);
  }
  return DEFAULT_SITE_POLICY;
}

/**
 * [관리자 전용] 서비스 정책 및 사업자 정보 저장
 */
export async function saveSitePolicy(policy: Partial<SitePolicy>): Promise<void> {
  const docRef = doc(db, 'settings', 'site_policy');
  const updated = {
    ...policy,
    updatedAt: Date.now()
  };

  await setDoc(docRef, updated, { merge: true });

  // 로컬 캐시 즉시 갱신 및 이벤트 전파
  try {
    const full = { ...DEFAULT_SITE_POLICY, ...updated };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
    window.dispatchEvent(new CustomEvent('site-policy-updated', { detail: full }));
  } catch (e) {}
}

/**
 * 실시간 정책 정보 변경 구독
 */
export function subscribeSitePolicy(onUpdate: (policy: SitePolicy) => void): () => void {
  const docRef = doc(db, 'settings', 'site_policy');
  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      const merged = { ...DEFAULT_SITE_POLICY, ...(snap.data() as SitePolicy) };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch (e) {}
      onUpdate(merged);
    } else {
      onUpdate(DEFAULT_SITE_POLICY);
    }
  }, (err) => {
    console.warn('[policyService] subscribeSitePolicy error:', err);
    onUpdate(DEFAULT_SITE_POLICY);
  });
}
