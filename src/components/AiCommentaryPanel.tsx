import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Sparkles, RefreshCw, Copy, Check, ChevronRight, ChevronDown,
  BookOpen, Landmark, Lightbulb, AlertCircle, CreditCard,
  History, Trash2, Calendar, Clock, Compass, ArrowRightLeft, LogIn,
  Gift, Send
} from 'lucide-react';
import { auth } from '../api/firebaseConfig';
import { getReferralSettings, submitReferralRequest, getPromotionSettings } from '../services/promotionService';
import { 
  generateBibleAiCommentary, 
  getCachedCommentary, 
  generateWordDeepStudy,
  getWordDeepStudyFromStorage,
  generatePassageTheologicalStudy,
  getPassageTheologicalStudyFromStorage,
  type AiCommentaryData, 
  type OriginalWordAnalysis,
  type WordDeepStudyResult,
  type PassageTheologicalStudyResult
} from '../services/geminiCommentaryService';
import { 
  getCommentaryHistory, 
  deleteCommentaryHistoryItem, 
  clearAllCommentaryHistory, 
  getRemainingDays, 
  type CommentaryHistoryItem 
} from '../services/aiHistoryService';
import { useAiUsage } from '../hooks/useAiUsage';

// 클로드 사이드바 스타일의 미니멀 4-Point 스파클 아이콘
export const ClaudeSparkleIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 2C12.4 7.2 16.8 11.6 22 12C16.8 12.4 12.4 16.8 12 22C11.6 16.8 7.2 12.4 2 12C7.2 11.6 11.6 7.2 12 2Z" />
  </svg>
);

export type AiTabType = 'all' | 'original' | 'background' | 'sermon' | 'history';

interface AiCommentaryPanelProps {
  currentBookName: string;
  currentBookId?: string | number;
  currentChapter: number;
  currentVerse?: number;
  scriptureText?: string;
  isOpen: boolean;
  onClose: () => void;
  onCopyToSermon?: (text: string) => void;
  onNavigateToVerse?: (bookId: string, chapter: number, verse: number, text?: string) => void;
  initialTab?: AiTabType;
  openRechargeTrigger?: number;
  onOpenAuthModal?: () => void;
}

type TabType = AiTabType;

export const AiCommentaryPanel: React.FC<AiCommentaryPanelProps> = ({
  currentBookName,
  currentBookId = 1,
  currentChapter,
  currentVerse,
  scriptureText = '',
  isOpen,
  onClose,
  onCopyToSermon,
  onNavigateToVerse,
  initialTab,
  openRechargeTrigger,
  onOpenAuthModal
}) => {
  const { totalRemaining, totalCapacity, freeRemaining, paidRemaining, isAvailable, recharge, remainingDaysText, isLoggedIn } = useAiUsage();
  const [activeTab, setActiveTab] = useState<TabType>(initialTab || 'all');
  const [commentaryData, setCommentaryData] = useState<AiCommentaryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorType, setErrorType] = useState<string | null>(null);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rechargeSuccessMessage, setRechargeSuccessMessage] = useState<string | null>(null);
  const [historyList, setHistoryList] = useState<CommentaryHistoryItem[]>([]);

  // 외부 요청에 따른 탭 전환 동기화
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // 외부 요청에 따른 충전 모달 오픈
  // 외부 요청에 따른 충전 모달 오픈 (로그인 상태일 때만)
  useEffect(() => {
    if (openRechargeTrigger && openRechargeTrigger > 0) {
      if (!isLoggedIn) {
        if (onOpenAuthModal) onOpenAuthModal();
        return;
      }
      setShowRechargeModal(true);
    }
  }, [openRechargeTrigger, isLoggedIn, onOpenAuthModal]);

  // 신규 가입 프로모션 상태
  const [promoSettings, setPromoSettings] = useState<{ enabled: boolean; bonusCredits: number; name: string; description?: string } | null>(null);

  useEffect(() => {
    getPromotionSettings().then(setPromoSettings).catch(() => {});
  }, []);

  // 친구 추천 혜택 관련 상태 (이메일 기반)
  const [referralBonusCount, setReferralBonusCount] = useState<number>(50);
  const [isReferralFormOpen, setIsReferralFormOpen] = useState(false);
  const [referrerEmailInput, setReferrerEmailInput] = useState('');
  const [friendEmailInput, setFriendEmailInput] = useState('');
  const [isSubmittingReferral, setIsSubmittingReferral] = useState(false);
  const [referralFeedback, setReferralFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false);

  // 모달 오픈 시 추천 혜택 설정 불러오기 및 본인 이메일 자동 세팅
  useEffect(() => {
    if (showRechargeModal) {
      getReferralSettings().then(st => {
        if (st && st.bonusCredits) setReferralBonusCount(st.bonusCredits);
      }).catch(() => {});
      if (auth.currentUser?.email) {
        setReferrerEmailInput(auth.currentUser.email);
      }
    }
  }, [showRechargeModal]);

  // 추천 신청 제출 핸들러 (이메일 기반)
  const handleSubmitReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    setReferralFeedback(null);

    const cleanMyEmail = (referrerEmailInput || auth.currentUser?.email || '').trim().toLowerCase();
    const cleanFriendEmail = friendEmailInput.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!cleanMyEmail || !emailRegex.test(cleanMyEmail)) {
      setReferralFeedback({ type: 'error', message: '추천인(본인)의 올바른 이메일 주소를 입력해주세요.' });
      return;
    }
    if (!cleanFriendEmail || !emailRegex.test(cleanFriendEmail)) {
      setReferralFeedback({ type: 'error', message: '친구(상대방) 가입자의 올바른 이메일 주소를 입력해주세요.' });
      return;
    }

    if (cleanMyEmail === cleanFriendEmail) {
      setReferralFeedback({ type: 'error', message: '본인 이메일은 추천 대상으로 입력할 수 없습니다.' });
      return;
    }

    setIsSubmittingReferral(true);
    try {
      await submitReferralRequest({
        referrerEmail: cleanMyEmail,
        referrerName: cleanMyEmail.split('@')[0],
        referrerUid: auth.currentUser?.uid,
        friendEmail: cleanFriendEmail,
        friendName: cleanFriendEmail.split('@')[0],
        bonusCredits: referralBonusCount
      });
      setReferralFeedback({
        type: 'success',
        message: `추천 신청이 정상 접수되었습니다! 관리자 확인 후 AI ${referralBonusCount}회가 충전됩니다.`
      });
      setFriendEmailInput('');
    } catch (err: any) {
      console.error('Failed to submit referral:', err);
      setReferralFeedback({ type: 'error', message: '신청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
    } finally {
      setIsSubmittingReferral(false);
    }
  };

  // 1. 단어 심층 연구 (어원·용례·빈도수·신구약 대조) 상태 관리
  const [deepStudyLoading, setDeepStudyLoading] = useState<Record<string, boolean>>({});
  const [deepStudyResults, setDeepStudyResults] = useState<Record<string, WordDeepStudyResult>>({});
  const [activeDeepStudyWordIdx, setActiveDeepStudyWordIdx] = useState<Record<number, boolean>>({});
  const [copiedDeepStudy, setCopiedDeepStudy] = useState<Record<string, boolean>>({});

  // 2. 구절 신학 심층 연구 (상단 원문 카드 아래 · 교의학·구속사·개혁신학·하나님나라) 상태 관리
  const [passageTheologyLoading, setPassageTheologyLoading] = useState(false);
  const [passageTheologyResult, setPassageTheologyResult] = useState<PassageTheologicalStudyResult | null>(null);
  const [isPassageTheologyOpen, setIsPassageTheologyOpen] = useState(false);
  const [copiedPassageTheology, setCopiedPassageTheology] = useState(false);

  // 30일간 로컬 기기 보관 기록 로드
  const loadHistory = () => {
    setHistoryList(getCommentaryHistory());
  };

  // 단어 심층 연구 실행 핸들러 (어원·용례·빈도수·신구약 대조 - 1회 차감)
  const handleTriggerWordDeepStudy = async (
    word: OriginalWordAnalysis, 
    wordIdx: number
  ) => {
    if (!commentaryData) return;
    const studyKey = `${commentaryData.reference}_${word.strongNumber}_etymology`;

    // 이미 열려있다면 토글 닫기
    if (activeDeepStudyWordIdx[wordIdx]) {
      setActiveDeepStudyWordIdx(prev => ({ ...prev, [wordIdx]: false }));
      return;
    }

    // 1. 메모리 또는 30일 로컬 저장소 캐시 확인 (기존 분석된 것은 횟수 차감 없이 무료 오픈)
    const cached = deepStudyResults[studyKey] || getWordDeepStudyFromStorage(commentaryData.reference, word.strongNumber);
    if (cached) {
      setDeepStudyResults(prev => ({ ...prev, [studyKey]: cached }));
      setActiveDeepStudyWordIdx(prev => ({ ...prev, [wordIdx]: true }));
      return;
    }

    // 2. 잔여 크레딧 확인
    if (!isAvailable) {
      if (!isLoggedIn) return;
      setShowRechargeModal(true);
      return;
    }

    // 3. 심층 연구 로딩 시작 및 펼침
    setDeepStudyLoading(prev => ({ ...prev, [studyKey]: true }));
    setActiveDeepStudyWordIdx(prev => ({ ...prev, [wordIdx]: true }));

    try {
      const result = await generateWordDeepStudy({
        reference: commentaryData.reference,
        scriptureText: commentaryData.scriptureText,
        word
      });
      setDeepStudyResults(prev => ({ ...prev, [studyKey]: result }));
    } catch (err: any) {
      console.error('Failed to generate word deep study:', err);
      if (err.message === 'QUOTA_EXCEEDED') {
        setShowRechargeModal(true);
      } else {
        alert('단어 심층 연구 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      }
      setActiveDeepStudyWordIdx(prev => ({ ...prev, [wordIdx]: false }));
    } finally {
      setDeepStudyLoading(prev => ({ ...prev, [studyKey]: false }));
    }
  };

  // 단어 심층 연구 복사 핸들러
  const handleCopyWordDeepStudy = (result: WordDeepStudyResult) => {
    const lines: string[] = [
      `[단어 심층 연구: 어원·용례·신구약 대조] ${result.reference} - ${result.wordOriginal} (${result.strongNumber})`,
      `출현 빈도: ${result.totalOccurrences}`,
      '',
      '1. 고대 어원 기원 및 역사적 변천사:',
      result.etymologyGenesis,
      '',
      `2. 신구약 교차 원어 대조 (${result.crossTestamentConnection.targetLanguage}):`,
      `대응 단어: ${result.crossTestamentConnection.equivalentTerm} (${result.crossTestamentConnection.strongNumber})`,
      `해설: ${result.crossTestamentConnection.explanation}`,
      ...(result.crossTestamentConnection.crossUsages || []).map(u => `- [${u.reference}] "${u.scriptureSnippet}"\n  묵상: ${u.graceInsight}`),
      '',
      '3. 성경 전체를 관통하는 핵심 용례:',
      ...(result.biblicalUsages || []).map(u => `- [${u.reference}] "${u.scriptureSnippet}"\n  해설: ${u.theologicalContext}`),
      '',
      '4. 유사 동의어 대조 및 독보적 뉘앙스:',
      result.synonymNuance,
      '',
      '[은혜로운 마무리 결언]:',
      result.gracefulConclusion
    ];

    const textToCopy = lines.join('\n');
    navigator.clipboard.writeText(textToCopy);
    setCopiedDeepStudy(prev => ({ ...prev, [result.id]: true }));
    setTimeout(() => {
      setCopiedDeepStudy(prev => ({ ...prev, [result.id]: false }));
    }, 2000);

    if (onCopyToSermon) {
      onCopyToSermon(textToCopy);
    }
  };

  // 구절 신학 심층 연구 실행 핸들러 (상단 원문 카드 아래 · 1회 차감)
  const handleTriggerPassageTheology = async () => {
    if (!commentaryData) return;
    const ref = commentaryData.reference;

    // 이미 열려있다면 토글 닫기
    if (isPassageTheologyOpen && passageTheologyResult) {
      setIsPassageTheologyOpen(false);
      return;
    }

    // 1. 메모리 또는 30일 로컬 저장소 캐시 확인
    const cached = passageTheologyResult || getPassageTheologicalStudyFromStorage(ref);
    if (cached) {
      setPassageTheologyResult(cached);
      setIsPassageTheologyOpen(true);
      return;
    }

    // 2. 잔여 크레딧 확인
    if (!isAvailable) {
      setShowRechargeModal(true);
      return;
    }

    // 3. 실행
    setPassageTheologyLoading(true);
    setIsPassageTheologyOpen(true);

    try {
      const result = await generatePassageTheologicalStudy({
        reference: commentaryData.reference,
        scriptureText: commentaryData.scriptureText,
        testament: commentaryData.testament,
        bookName: currentBookName
      });
      setPassageTheologyResult(result);
    } catch (err: any) {
      console.error('Failed to generate passage theology study:', err);
      if (err.message === 'QUOTA_EXCEEDED') {
        setShowRechargeModal(true);
      } else {
        alert('구절 신학 심층 연구 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      }
      setIsPassageTheologyOpen(false);
    } finally {
      setPassageTheologyLoading(false);
    }
  };

  // 구절 신학 심층 연구 복사 핸들러
  const handleCopyPassageTheology = () => {
    if (!passageTheologyResult) return;
    const res = passageTheologyResult;
    const lines: string[] = [
      `[구절 신학 심층 연구: 교의학·구속사·개혁신학·하나님 나라] ${res.reference}`,
      `"${res.scriptureText}"`,
      '',
    ];

    if (res.interpretationAndSignificance) {
      lines.push('해석과 의미', res.interpretationAndSignificance, '');
    }

    lines.push(
      `1. ${res.dogmaticTheology.title}`,
      res.dogmaticTheology.theologicalContent,
      `[은혜의 결말] ${res.dogmaticTheology.gracefulEnding}`,
      '',
      `2. ${res.redemptiveHistory.title}`,
      res.redemptiveHistory.theologicalContent,
      `[은혜의 결말] ${res.redemptiveHistory.gracefulEnding}`,
      '',
      `3. ${res.reformedPerspective.title}`,
      res.reformedPerspective.theologicalContent,
      `[은혜의 결말] ${res.reformedPerspective.gracefulEnding}`,
      '',
      `4. ${res.kingdomAndGospel.title}`,
      res.kingdomAndGospel.theologicalContent,
      `[은혜의 결말] ${res.kingdomAndGospel.gracefulEnding}`,
      '',
      `[목양적 은혜 결언]`,
      res.pastoralGraceSummary
    );

    const textToCopy = lines.join('\n');
    navigator.clipboard.writeText(textToCopy);
    setCopiedPassageTheology(true);
    setTimeout(() => setCopiedPassageTheology(false), 2000);

    if (onCopyToSermon) {
      onCopyToSermon(textToCopy);
    }
  };

  useEffect(() => {
    loadHistory();
    const handleHistoryUpdate = () => loadHistory();
    window.addEventListener('ai-history-updated', handleHistoryUpdate);
    return () => {
      window.removeEventListener('ai-history-updated', handleHistoryUpdate);
    };
  }, []);

  // 기록 선택 직후 구절 변경 effect에 의해 데이터가 null로 리셋되는 것을 방지하는 Ref
  const lastLoadedReferenceRef = useRef<string | null>(null);

  // 성경 구절 변경 시: 기존 30일 기록에 있으면 즉시 로드, 없으면 대기 상태 유지 (사용자 클릭 시에만 분석)
  useEffect(() => {
    if (!isOpen || !currentVerse) {
      return;
    }

    const reference = `${currentBookName} ${currentChapter}:${currentVerse}`.trim();

    // 이미 현재 구절에 해당하는 주석이 로드되어 있거나 방금 기록에서 로드된 경우 리셋 방지
    if (lastLoadedReferenceRef.current === reference) {
      return;
    }

    lastLoadedReferenceRef.current = reference;
    const cached = getCachedCommentary(reference);

    if (cached) {
      setCommentaryData(cached);
      setErrorType(null);
      // 구절 신학 심층 연구 캐시도 함께 로드
      const cachedTheology = getPassageTheologicalStudyFromStorage(reference);
      setPassageTheologyResult(cachedTheology);
    } else {
      // 새로운 구절은 자동으로 분석하지 않고 사용자가 버튼을 누를 때까지 대기
      setCommentaryData(null);
      setErrorType(null);
      setPassageTheologyResult(null);
      setIsPassageTheologyOpen(false);
    }
  }, [isOpen, currentBookName, currentChapter, currentVerse]);

  // AI 분석 실행 (사용자가 버튼을 클릭했을 때만 호출)
  const handleFetchCommentary = async (forceRefresh: boolean = false) => {
    if (!isLoggedIn) {
      if (onOpenAuthModal) onOpenAuthModal();
      return;
    }

    if (!currentVerse || !scriptureText) return;

    // 강제 새로고침이거나 신규 요청인데 잔여 횟수가 없는 경우
    if (!forceRefresh && !isAvailable) {
      const reference = `${currentBookName} ${currentChapter}:${currentVerse}`;
      if (!getCachedCommentary(reference)) {
        setShowRechargeModal(true);
        setErrorType('QUOTA_EXCEEDED');
        return;
      }
    } else if (forceRefresh && !isAvailable) {
      setShowRechargeModal(true);
      setErrorType('QUOTA_EXCEEDED');
      return;
    }

    setIsLoading(true);
    setErrorType(null);

    try {
      const result = await generateBibleAiCommentary({
        bookName: currentBookName,
        bookId: currentBookId,
        chapter: currentChapter,
        verse: currentVerse,
        scriptureText,
        forceRefresh
      });
      setCommentaryData(result);
      const currentRef = `${currentBookName} ${currentChapter}:${currentVerse}`.trim();
      lastLoadedReferenceRef.current = currentRef;
      loadHistory();
    } catch (err: any) {
      console.error('Commentary fetch failed:', err);
      if (err.message === 'QUOTA_EXCEEDED') {
        setErrorType('QUOTA_EXCEEDED');
        setShowRechargeModal(true);
      } else if (err.message === 'RATE_LIMIT_EXCEEDED') {
        setErrorType('RATE_LIMIT');
      } else {
        setErrorType('ERROR');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 기록 항목 클릭 시 주석 로드
  const handleSelectHistoryItem = (item: CommentaryHistoryItem) => {
    const ref = item.reference.trim();
    lastLoadedReferenceRef.current = ref;

    // item.data가 유효하면 우선 사용하고, 없으면 로컬 기록 스토리지에서 다시 조회
    const data = item.data || getCachedCommentary(ref);
    if (data) {
      setCommentaryData(data);
    }
    setActiveTab('all');
    setErrorType(null);

    // 해당 기록 구절의 신학 심층 연구 결과 캐시 로드
    const cachedTheology = getPassageTheologicalStudyFromStorage(ref);
    setPassageTheologyResult(cachedTheology);
    setIsPassageTheologyOpen(false);

    // 상위 성경 뷰어 구절 이동 동기화
    if (onNavigateToVerse) {
      const match = ref.match(/^([^\d]+)\s*(\d+)[:\s]+(\d+)/);
      const parsedBook = match ? match[1].trim() : (item.bookName || '');
      const parsedChapter = match ? parseInt(match[2], 10) : (item.chapter || 1);
      const parsedVerse = match ? parseInt(match[3], 10) : (item.verse || 1);

      const foundBook = BIBLE_LIST.find(b => 
        b.name === parsedBook || 
        b.id.toLowerCase() === parsedBook.toLowerCase() ||
        b.name.replace(/\s+/g, '') === parsedBook.replace(/\s+/g, '')
      );
      const targetBookId = foundBook ? String(foundBook.id) : String(currentBookId);
      const textToUse = item.scriptureText || data?.scriptureText || '';

      onNavigateToVerse(targetBookId, parsedChapter, parsedVerse, textToUse);
    }
  };

  // 기록 개별 삭제
  const handleDeleteHistory = (e: React.MouseEvent, ref: string) => {
    e.stopPropagation();
    deleteCommentaryHistoryItem(ref);
    loadHistory();
  };

  // 원어 단어 클릭 시 해당 주석 카드로 스크롤 이동 및 일시 하이라이트
  const scrollToWordCard = (index: number) => {
    if (activeTab === 'background' || activeTab === 'sermon' || activeTab === 'history') {
      setActiveTab('all');
    }
    setTimeout(() => {
      const el = document.getElementById(`word-card-${index}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-[#C46A40]', 'bg-[#FAF0EB]');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-[#C46A40]', 'bg-[#FAF0EB]');
        }, 1600);
      }
    }, 60);
  };

  // 음역(로마자) -> 한글 발음 자동 변환 사전 및 헬퍼
  const GREEK_HEBREW_PRONUNCIATION_DICT: Record<string, string> = {
    'kai': '카이', 'legei': '레게이', 'autō': '아우토', 'ei': '에이', 'huios': '휘오스',
    'tou': '투', 'theou': '데우', 'bale': '발레', 'seauton': '세아우톤', 'katō': '카토',
    'gegraptai': '게그랍타이', 'gar': '가르', 'hoti': '호티', 'tois': '토이스',
    'angelois': '앙겔로이스', 'autou': '아우투', 'enteleitai': '엔텔레이타이',
    'peri': '페리', 'sou': '수', 'epi': '에피', 'cheirōn': '케이론', 'arousin': '아루신',
    'se': '세', 'mēpote': '메포테', 'proskopsēs': '프로스코프세스', 'pros': '프로스',
    'lithon': '리돈', 'ton': '톤', 'poda': '포다', 'bereshit': '베레쉬트', 'bara': '바라',
    'elohim': '엘로힘', 'et': '에트', 'hashamayim': '하샤마임', 'ha\'aretz': '하아레츠',
    'ihsou': '예수', 'christou': '그리스도', 'kyrios': '주', 'theos': '하나님', 'logos': '말씀'
  };

  // 헬라어 주요 어근 기본형 원형 뜻 및 합성어 어원 사전 (과거 캐시 및 즉시 표시 보정용)
  const LEMMA_ROOT_DICT: Record<string, { meaning: string; breakdown?: string }> = {
    'γράφω': { meaning: '기록하다' },
    'λέγω': { meaning: '말하다' },
    'βάλλω': { meaning: '던지다, 떨어뜨리다' },
    'προσκόπτω': { meaning: '부딪치다', breakdown: 'πρός(~를 향해) + κόπτω(치다)' },
    'ἐντέลλομαι': { meaning: '명령하다', breakdown: 'ἐν(안에) + τέλλω(명령하다)' },
    'ἐντέλλομαι': { meaning: '명령하다', breakdown: 'ἐν(안에) + τέλλω(명령하다)' },
    'σεαυτοῦ': { meaning: '너 자신', breakdown: 'σύ(너) + αὐτός(자신)' },
    'σεαυτόν': { meaning: '너 자신', breakdown: 'σύ(너) + αὐτός(자신)' },
    'αἴρω': { meaning: '들다, 받들다' },
    'εἰμί': { meaning: '~이다, 존재하다' },
    'εἰ': { meaning: '만일, ~라면' },
    'υἱός': { meaning: '아들' },
    'θεός': { meaning: '하나님, 신' },
    'ἄγγελος': { meaning: '사자, 천사' },
    'χείρ': { meaning: '손' },
    'πούς': { meaning: '발' },
    'λίθος': { meaning: '돌' },
    'ὁ': { meaning: '그 (정관사)' },
    'καί': { meaning: '그리고, 또한' },
    'γάρ': { meaning: '왜냐하면' },
    'ὅτι': { meaning: '~라고, 왜냐하면' },
    'περί': { meaning: '~에 대하여' },
    'ἐπί': { meaning: '~위에, ~에게' },
    'πρός': { meaning: '~를 향하여' },
    'μήποτε': { meaning: '~하지 않도록' },
    'κάτω': { meaning: '아래로' },
    'ἀποκρίνομαι': { meaning: '대답하다', breakdown: 'ἀπό(~로부터) + κρίνω(구별·판단하다)' },
    'προσφέρω': { meaning: '가져오다, 바치다', breakdown: 'πρός(~로) + φέρω(가져오다)' },
    'συναγωγή': { meaning: '회당, 모임', breakdown: 'σύν(함께) + ἄγω(인도하다, 모으다)' },
    'ἐκκλησία': { meaning: '교회, 모임', breakdown: 'ἐκ(~밖으로) + καλέω(부르다)' },
    'εὐαγγέλιον': { meaning: '복음, 기쁜 소식', breakdown: 'εὖ(좋은) + ἀγγέλλω(전하다)' },
    'παρακαλέω': { meaning: '권면하다, 위로하다', breakdown: 'παρά(~곁에) + καλέω(부르다)' },
    'ἀποστέλλω': { meaning: '보내다, 파송하다', breakdown: 'ἀπό(~로부터) + στέλλω(보내다)' },
    'καταβαίνω': { meaning: '내려가다', breakdown: 'κατά(아래로) + βαίνω(가다)' },
    'ἀναβαίνω': { meaning: '올라가다', breakdown: 'ἀνά(위로) + βαίνω(가다)' },
    'μετανοέω': { meaning: '회개하다, 마음을 바꾸다', breakdown: 'μετά(바꾸어) + νοέω(생각하다)' }
  };

  // 한글 발음 추출 헬퍼 (원어 전문 아래 한글 발음 표시용)
  const getKoreanPronunciation = (word: OriginalWordAnalysis): string => {
    if (word.transliterationKo && word.transliterationKo.trim()) {
      return word.transliterationKo.trim();
    }
    if (word.transliteration) {
      const koMatches = word.transliteration.match(/[가-힣]+/g);
      if (koMatches && koMatches.length > 0) {
        return koMatches.join(' ');
      }
      const cleaned = word.transliteration.toLowerCase().replace(/[^a-zōē\'\-]/g, '');
      if (GREEK_HEBREW_PRONUNCIATION_DICT[cleaned]) {
        return GREEK_HEBREW_PRONUNCIATION_DICT[cleaned];
      }
    }
    return word.transliterationEn || word.transliteration || '';
  };

  // 영어+한글 발음 동시 표기 헬퍼 (단어 카드용: 예: "kai / 카이")
  const formatWordPronunciation = (word: OriginalWordAnalysis): string => {
    if (word.transliterationEn && word.transliterationKo) {
      return `${word.transliterationEn.trim()} / ${word.transliterationKo.trim()}`;
    }
    const ko = getKoreanPronunciation(word);
    const en = word.transliterationEn || word.transliteration?.replace(/[가-힣/|·\[\]]/g, '').trim();
    if (en && ko && en !== ko) {
      return `${en} / ${ko}`;
    }
    return word.transliteration || en || ko || '';
  };

  // 개역성경 번역 뜻 추출 헬퍼 (개역성경에 뜻이 안 나오면 null)
  const getKoreanTranslationMeaning = (word: OriginalWordAnalysis): string | null => {
    if (word.koreanTranslation && word.koreanTranslation.trim()) {
      return word.koreanTranslation.trim();
    }
    // 과거 캐시 데이터의 경우 사전 정의/문맥에서 첫 번째 핵심 단어 추출
    if (word.lexicalMeaning) {
      const match = word.lexicalMeaning.match(/^([가-힣a-zA-Z0-9\s~]+?)(?:,|\(|\/|;|$)/);
      if (match && match[1]) {
        const clean = match[1].replace(/[a-zA-Z()]/g, '').trim();
        if (clean && clean.length <= 8) return clean;
      }
    }
    return null;
  };

  // 인터리니어 3행 표시용 뜻 (개역성경 번역 뜻 우선, 생략된 단어는 사전 기본 의미)
  const getInterlinearMeaning = (word: OriginalWordAnalysis): { text: string; isOriginalTranslation: boolean } => {
    const koMeaning = getKoreanTranslationMeaning(word);
    if (koMeaning) {
      return { text: koMeaning, isOriginalTranslation: true };
    }
    // 개역성경에 번역이 생략된 단어는 사전적 기본 의미 보완
    const rootNorm = word.root?.trim();
    if (rootNorm && LEMMA_ROOT_DICT[rootNorm]) {
      return { text: `[${LEMMA_ROOT_DICT[rootNorm].meaning}]`, isOriginalTranslation: false };
    }
    if (word.lexicalMeaning) {
      const firstPart = word.lexicalMeaning.split(/[,;(]/)[0]?.replace(/[a-zA-Z]/g, '').trim();
      if (firstPart && firstPart.length <= 6) {
        return { text: `[${firstPart}]`, isOriginalTranslation: false };
      }
    }
    return { text: '', isOriginalTranslation: false };
  };

  // 어근 표기 포맷팅 헬퍼 (합성어 어원 분해 또는 기본형 원형 뜻)
  const formatRootDisplay = (word: OriginalWordAnalysis): string => {
    const rootNorm = word.root?.trim() || '';
    
    // 1) 합성어 어원 분해가 있는 경우 (신규 응답 또는 사전 매핑)
    const breakdown = word.rootBreakdown?.trim() || (rootNorm ? LEMMA_ROOT_DICT[rootNorm]?.breakdown : undefined);
    if (breakdown) {
      return `어근: ${rootNorm} [${breakdown}]`;
    }

    // 2) 단일어 기본형 원형 뜻 (사전 표준 기본형 뜻 우선 보정 -> AI 분석 원형 뜻 -> 사전 정의 정제)
    let meaning = (rootNorm && LEMMA_ROOT_DICT[rootNorm]?.meaning) || word.rootMeaning?.trim();
    if (!meaning && word.lexicalMeaning) {
      // 본문 굴절 뜻을 배제하고 기본형 동사/명사 뜻으로 정제
      meaning = word.lexicalMeaning.split(/[,;(]/)[0]?.replace(/[a-zA-Z]/g, '').trim();
    }

    if (meaning) {
      return `어근: ${rootNorm} (${meaning})`;
    }
    return `어근: ${rootNorm}`;
  };

  // 전체 복사 핸들러
  const handleCopyAll = () => {
    if (!commentaryData) return;
    const lines = [
      `[AI 원어·성경 주석] ${commentaryData.reference}`,
      `개역개정: "${commentaryData.scriptureText}"`,
      '',
      `1. 원어 주석 (${commentaryData.originalLanguageCommentary.language} BDB/BDAG 공인 사전 기준 - 모든 단어 파싱)`,
      ...commentaryData.originalLanguageCommentary.words.map((w) => {
        const koMeaning = getKoreanTranslationMeaning(w);
        const meaningText = koMeaning ? ` "${koMeaning}"` : '';
        return `[${w.strongNumber}] ${w.wordOriginal} [${formatWordPronunciation(w)}]${meaningText} (${formatRootDisplay(w)})\n  문법: ${w.parsing}\n  사전 정의: ${w.lexicalMeaning}\n  신학적 해설: ${w.contextualMeaning}${w.scholarlyNote ? '\n  학설 참고: ' + w.scholarlyNote : ''}`;
      }),
      '',
      `* 원어 문장 구조 및 신학적 맥락:\n${commentaryData.originalLanguageCommentary.syntacticSummary}`,
      '',
      '2. 역사·문화·지리적 배경',
      `[시대 및 문화적 배경]\n${commentaryData.historicalBackground.eraAndCulture}`,
      '',
      `[지리적 및 사회적 정황]\n${commentaryData.historicalBackground.geographicalSocialContext}`,
      '',
      `[1차 수신자를 향한 기록 목적]\n${commentaryData.historicalBackground.theologicalIntent}`,
      '',
      '3. 설교 인사이트 & 현대적 적용',
      `[복음적 핵심 메시지]\n${commentaryData.sermonInsight.coreMessage}`,
      '',
      `[설교 작성 포인트]`,
      ...commentaryData.sermonInsight.sermonPoints.map((p, i) => `- 포인트 ${i + 1}: ${p}`),
      '',
      `[현대 그리스도인을 위한 묵상과 적용]\n${commentaryData.sermonInsight.meditationApplication}`
    ];

    const textToCopy = lines.join('\n');
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    if (onCopyToSermon) {
      onCopyToSermon(textToCopy);
    }
  };

  // 모의 충전 처리 (추후 PG 결제 모듈 연동)
  const handleSimulateRecharge = (count: number, amount: string) => {
    recharge(count);
    setRechargeSuccessMessage(`${count}회 (${amount}) 충전이 완료되었습니다!`);
    setErrorType(null);
    setTimeout(() => {
      setRechargeSuccessMessage(null);
      setShowRechargeModal(false);
      if (!commentaryData && currentVerse && scriptureText) {
        handleFetchCommentary(false);
      }
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="flex flex-col h-full bg-[#FAF9F5] text-[#2C2B29] border-l border-[#E7E5DF] relative select-text overflow-hidden font-sans">
      
      {/* 1. 헤더 (클로드 웜 샌드 스타일 - 좌측 바와 완벽한 h-14 수직 정렬) */}
      <header className="h-14 min-h-14 px-4 md:px-5 border-b border-[#E7E5DF] bg-[#F7F5F0]/90 backdrop-blur-xs flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[#EFECE6] text-[#4A4741] border border-[#DDD8CE] flex items-center justify-center shrink-0 shadow-2xs">
            <ClaudeSparkleIcon className="w-4 h-4 text-[#4A4741]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="font-serif font-bold text-sm text-[#2C2B29] truncate">AI 원어·성경 주석</h2>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#EBE5DC] text-[#6E6A63] font-medium shrink-0">
                Gemini 3.6
              </span>
            </div>
          </div>
        </div>

        {/* 우측: 잔여 크레딧 안내 및 닫기 버튼 */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isLoggedIn && (
            <button
              onClick={() => setShowRechargeModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-[#6E6A63] hover:text-[#2C2B29] hover:bg-[#EFEAE2] transition-colors cursor-pointer border border-[#E5E0D8] bg-[#FAF9F5] shadow-2xs whitespace-nowrap"
              title="남은 사용 횟수 확인 및 충전"
            >
              <ClaudeSparkleIcon className="w-3.5 h-3.5 text-[#8C877D] shrink-0" />
              <span className="text-[#8C877D]">남은 횟수:</span>
              <strong className="font-bold text-[#2C2B29]">{totalRemaining}</strong>
              <span className="text-[10px] text-[#A39E94]">/ {totalCapacity}회</span>
              <span className="w-px h-3 bg-[#E0DBD2] mx-0.5"></span>
              <span className="text-[#8C877D] text-[11px] font-medium">{remainingDaysText}</span>
              <span className="w-px h-3 bg-[#E0DBD2] mx-0.5"></span>
              <span className="text-[#C46A40] font-semibold text-[11px] hover:underline">충전</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8C877D] hover:text-[#2C2B29] hover:bg-[#EFEAE2] transition-colors cursor-pointer"
            title="AI 주석 닫기"
          >
            <X className="w-4 h-4 stroke-[1.8]" />
          </button>
        </div>
      </header>

      {/* 2. 서브 툴바 (탭 필터 & 10일 기록 탭) */}
      <div className="px-4 py-2 bg-[#FAF9F5] border-b border-[#EFECE6] flex items-center justify-between gap-2 shrink-0 text-xs overflow-x-auto custom-scrollbar">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'all' 
                ? 'bg-[#EAE4DA] text-[#2C2B29] font-semibold' 
                : 'text-[#6E6A63] hover:bg-[#F3EFE9]'
            }`}
          >
            전체
          </button>
          <button
            onClick={() => setActiveTab('original')}
            className={`px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
              activeTab === 'original' 
                ? 'bg-[#EAE4DA] text-[#2C2B29] font-semibold' 
                : 'text-[#6E6A63] hover:bg-[#F3EFE9]'
            }`}
          >
            <BookOpen className="w-3 h-3 text-[#C46A40]" />
            원어 주석
          </button>
          <button
            onClick={() => setActiveTab('background')}
            className={`px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
              activeTab === 'background' 
                ? 'bg-[#EAE4DA] text-[#2C2B29] font-semibold' 
                : 'text-[#6E6A63] hover:bg-[#F3EFE9]'
            }`}
          >
            <Landmark className="w-3 h-3 text-[#8B6B4C]" />
            배경 설명
          </button>
          <button
            onClick={() => setActiveTab('sermon')}
            className={`px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
              activeTab === 'sermon' 
                ? 'bg-[#EAE4DA] text-[#2C2B29] font-semibold' 
                : 'text-[#6E6A63] hover:bg-[#F3EFE9]'
            }`}
          >
            <Lightbulb className="w-3 h-3 text-[#B87A28]" />
            설교 인사이트
          </button>

          {/* 10일간 보관된 주석 기록 탭 */}
          <button
            onClick={() => setActiveTab('history')}
            className={`px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
              activeTab === 'history' 
                ? 'bg-[#C46A40] text-white font-semibold shadow-2xs' 
                : 'text-[#6E6A63] hover:bg-[#F3EFE9]'
            }`}
            title="최근 10일간 기기에 저장된 주석 목록"
          >
            <History className="w-3 h-3" />
            <span>기록 ({historyList.length})</span>
          </button>
        </div>

        {commentaryData && activeTab !== 'history' && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleCopyAll}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#FAF0EB] hover:bg-[#F5E5DC] text-[#C46A40] transition-colors cursor-pointer font-medium"
              title="주석 전체 설교노트 복사"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span className="text-emerald-700">복사됨</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>설교노트 복사</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* 3. 본문 스크롤 컨테이너 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
        
        {/* ======================================================== */}
        {/* [보기 모드 1] 30일간 보관된 주석 기록 목록 뷰 ('history') */}
        {/* ======================================================== */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E8E3DA]">
              <div>
                <h3 className="font-serif font-bold text-sm text-[#2C2B29]">최근 30일간 저장된 주석 목록</h3>
                <p className="text-[11px] text-[#7A756D]">이 기기에 30일간 안전하게 보관됩니다.</p>
              </div>
              {historyList.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowClearHistoryConfirm(true);
                  }}
                  className="text-[11px] text-[#9E9991] hover:text-red-600 transition-colors cursor-pointer"
                >
                  전체 삭제
                </button>
              )}
            </div>

            {/* 주석 기록 전체 삭제 확인 모달 */}
            {showClearHistoryConfirm && typeof document !== 'undefined' && createPortal(
              <div 
                className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    e.stopPropagation();
                    setShowClearHistoryConfirm(false);
                  }
                }}
              >
                <div 
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-sm bg-[#FAF9F5] border border-[#E7E5DF] rounded-3xl shadow-2xl p-6 space-y-4 text-left animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center shrink-0">
                      <Trash2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-[#2C2B29]">주석 기록 전체 삭제</h3>
                      <p className="text-[11px] text-[#8C877D]">30일간 보관된 모든 기록</p>
                    </div>
                  </div>

                  <p className="text-xs text-[#6E6A63] leading-relaxed">
                    저장된 모든 주석 기록을 삭제하시겠습니까?<br />
                    이 작업은 되돌릴 수 없습니다.
                  </p>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EFECE6]">
                    <button
                      type="button"
                      onClick={() => setShowClearHistoryConfirm(false)}
                      className="px-4 py-2 bg-white border border-[#DDD8CE] hover:bg-[#F5F3ED] text-[#6E6A63] text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-2xs"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowClearHistoryConfirm(false);
                        clearAllCommentaryHistory();
                        loadHistory();
                      }}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
                    >
                      전체 삭제
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}

            {!isLoggedIn ? (
              <div className="py-12 text-center text-[#8C877D] space-y-2">
                <History className="w-8 h-8 mx-auto text-[#A39E94] stroke-[1.5]" />
                <p className="text-xs font-semibold text-[#2C2B29]">로그인 후 주석 기록을 확인하실 수 있습니다.</p>
                <p className="text-[11px] text-[#9E9991]">로그인하시면 분석했던 주석 기록이 30일간 안전하게 보관됩니다.</p>
                <button
                  type="button"
                  onClick={() => onOpenAuthModal ? onOpenAuthModal() : undefined}
                  className="mt-2 px-4 py-2 bg-[#C46A40] hover:bg-[#B55434] text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs transition-colors"
                >
                  로그인하기
                </button>
              </div>
            ) : historyList.length === 0 ? (
              <div className="py-12 text-center text-[#8C877D] space-y-2">
                <History className="w-8 h-8 mx-auto text-[#A39E94] stroke-[1.5]" />
                <p className="text-xs">최근 30일간 분석하여 저장된 주석이 없습니다.</p>
                <p className="text-[11px] text-[#9E9991]">성경 본문에서 구절을 선택한 후 AI 주석을 분석해 보세요.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {historyList.map(item => {
                  const daysLeft = getRemainingDays(item.expiresAt);
                  const isCurrent = commentaryData?.reference === item.reference;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectHistoryItem(item)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer shadow-2xs group flex items-start justify-between gap-3 ${
                        isCurrent 
                          ? 'bg-[#FAF0EB] border-[#F1D3C6]' 
                          : 'bg-white border-[#E8E3DA] hover:border-[#C46A40]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-serif font-bold text-xs text-[#2C2B29]">{item.reference}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FAF0EB] text-[#C46A40] font-medium">
                            {item.data?.testament || '성경'} ({item.data?.originalLanguageCommentary?.language || '원어'})
                          </span>
                          <span className="text-[10px] text-[#8C877D] flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {daysLeft}일 보관 남음
                          </span>
                        </div>
                        <p className="text-xs text-[#5C5852] line-clamp-1 font-serif">
                          "{item.scriptureText}"
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 pt-0.5">
                        <button
                          onClick={(e) => handleDeleteHistory(e, item.reference)}
                          className="p-1 rounded text-[#A39E94] hover:text-red-600 hover:bg-[#F3EFE9] transition-colors cursor-pointer"
                          title="기록 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className="w-4 h-4 text-[#A39E94] group-hover:text-[#C46A40] transition-colors" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* [보기 모드 2] 일반 주석 뷰 (전체 / 원어 / 배경 / 설교) */}
        {/* ======================================================== */}
        {activeTab !== 'history' && (
          <>
            {/* [비로그인 상태 전용 안내 뷰] */}
            {!isLoggedIn && !commentaryData && (
              <div className="flex flex-col items-center justify-center text-center py-6 px-4 space-y-3.5 max-w-sm mx-auto">
                {/* 클로드 스타일 미니멀 심볼 */}
                <div className="w-10 h-10 rounded-2xl bg-[#FAF0EB] border border-[#F1D3C6] flex items-center justify-center text-[#C46A40] shadow-2xs">
                  <ClaudeSparkleIcon className="w-4 h-4" />
                </div>
                
                <div className="space-y-1">
                  <h3 className="font-serif font-bold text-base text-[#2C2B29]">AI 성경 연구</h3>
                  <p className="text-xs text-[#7A756D] leading-relaxed">
                    본문 구절의 원어 파싱과 배경, 신학·설교 인사이트를 분석합니다.
                  </p>
                </div>

                {/* 로그인 / 이용하기 메인 버튼 */}
                <button
                  onClick={() => onOpenAuthModal ? onOpenAuthModal() : undefined}
                  className="w-full py-3 px-4 rounded-xl bg-[#C46A40] hover:bg-[#B55434] text-white font-semibold text-xs shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>로그인하고 AI 주석 이용하기</span>
                </button>

                {/* 🎁 로그인 이용하기 바로 아래: 신규 가입 프로모션 및 지메일 원클릭 안내 카드 */}
                <div 
                  onClick={() => onOpenAuthModal ? onOpenAuthModal() : undefined}
                  className="w-full p-3.5 rounded-2xl bg-[#FAF9F5] border border-[#E8E3DA] hover:border-[#C46A40] text-left space-y-2 cursor-pointer transition-all shadow-2xs group"
                >
                  <div className="text-xs leading-relaxed space-y-1">
                    <div className="flex items-center gap-1.5 text-[#5A564F] font-semibold">
                      <ClaudeSparkleIcon className="w-3.5 h-3.5 text-[#C46A40] shrink-0" />
                      <span>가입 시 AI 연구 크레딧 10회 제공</span>
                    </div>
                    {promoSettings?.enabled && (
                      <div className="text-xs font-bold text-[#C46A40] pl-5 flex items-center gap-1.5">
                        <span className="px-2 py-0.5 bg-[#FAF0EB] border border-[#F1D3C6] rounded-md text-[11px]">
                          {(promoSettings.name && !promoSettings.name.includes('10회') && !promoSettings.name.includes('크레딧') && !promoSettings.name.includes('가입')) ? promoSettings.name : '특별혜택기간'}
                        </span>
                        <span>{(promoSettings.description || '200크레딧 제공').replace(/^(?:특별혜택기간|프로모션)\s*:\s*/, '').replace(/200\s*크[래레]딧\s*제공/, '200크레딧 제공').replace('크래딧', '크레딧').trim()}</span>
                      </div>
                    )}
                  </div>

                  {/* 지메일 원클릭 입장 안내 문구 강조 */}
                  <div className="pt-2 border-t border-[#EAE6DE] flex items-start gap-2">
                    <div className="w-4 h-4 rounded-full bg-white border border-[#DDD8CE] flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.63z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                      </svg>
                    </div>
                    <p className="text-[11px] text-[#C46A40] font-medium leading-snug">
                      Google(지메일) 계정은 별도 회원가입 없이 바로 입장하시면 혜택이 즉시 지급됩니다.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* A. 구절 미선택 상태 (구절 번호가 없거나 본문 텍스트가 비어있고, 로드된 주석도 없을 때) */}
            {isLoggedIn && (!currentVerse || !scriptureText || !scriptureText.trim()) && !commentaryData && (
              <div className="flex flex-col items-center justify-center text-center h-full py-16 px-4 text-[#8C877D]">
                <div className="w-12 h-12 rounded-2xl bg-[#F5F2EB] border border-[#E8E3DA] flex items-center justify-center text-[#A39D93] mb-4">
                  <BookOpen className="w-6 h-6 stroke-[1.5]" />
                </div>
                <h3 className="font-serif font-bold text-base text-[#4A4741] mb-1">성경 구절을 선택해주세요</h3>
                <p className="text-xs max-w-xs leading-relaxed text-[#7A756D]">
                  좌측 성경패널에서 구절을 선택하세요
                </p>
              </div>
            )}

            {/* B. 구절이 선택되었으나 아직 분석되지 않은 상태 (수동 시작 버튼 제공) */}
            {isLoggedIn && currentVerse && scriptureText && scriptureText.trim() && !commentaryData && !isLoading && !errorType && (
              <div className="space-y-4 py-2">
                {/* 선택된 본문 카드 */}
                <div className="p-4 rounded-xl bg-white border border-[#E8E3DA] shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-[#8C877D] text-xs">
                    <span className="font-serif font-bold text-sm text-[#2C2B29]">
                      선택된 구절: {currentBookName} {currentChapter}:{currentVerse}
                    </span>
                  </div>
                  <p className="font-serif text-sm leading-relaxed text-[#1F1E1D] font-medium bg-[#FAF9F5] p-3 rounded-lg border border-[#EFECE6]">
                    "{scriptureText}"
                  </p>
                </div>

                {/* AI 주석 생성 시작 버튼 카드 */}
                <div className="p-4 rounded-2xl bg-[#FAF0EB]/60 border border-[#F1D3C6] text-center space-y-3 shadow-xs">
                  <button
                    onClick={() => handleFetchCommentary(false)}
                    className="w-full px-6 py-3 rounded-xl bg-[#C46A40] hover:bg-[#B55434] text-white font-semibold text-sm transition-all shadow-xs cursor-pointer flex items-center justify-center"
                  >
                    AI 주석 생성 시작
                  </button>
                </div>
              </div>
            )}

            {/* C. 로딩 상태 (클로드 스타일 펄스 스켈레톤) */}
            {isLoading && (
              <div className="space-y-4 py-4 animate-pulse">
                <div className="p-3 bg-white rounded-xl border border-[#E8E3DA] space-y-2">
                  <div className="h-4 bg-[#EAE4DA] rounded-md w-1/3"></div>
                  <div className="h-3 bg-[#F2EDE4] rounded-md w-full"></div>
                  <div className="h-3 bg-[#F2EDE4] rounded-md w-4/5"></div>
                </div>

                <div className="space-y-3">
                  <div className="h-4 bg-[#EAE4DA] rounded-md w-1/4"></div>
                  <div className="h-28 bg-white border border-[#E8E3DA] rounded-xl"></div>
                  <div className="h-28 bg-white border border-[#E8E3DA] rounded-xl"></div>
                </div>

                <div className="p-4 bg-[#FAF0EB]/60 rounded-xl border border-[#F1D3C6] flex items-center gap-3">
                  <ClaudeSparkleIcon className="w-5 h-5 text-[#C46A40] animate-spin" />
                  <div className="text-xs text-[#7A756D]">
                    <strong className="text-[#C46A40] font-semibold">AI 원어·신학 심층 분석 엔진</strong>이 모든 단어의 원어 문법과 역사·신학적 배경을 정밀 분석하고 있습니다...
                  </div>
                </div>
              </div>
            )}

            {/* D. 오류 상태 */}
            {!isLoading && errorType && (
              <div className="p-4 rounded-xl bg-[#FDF5F5] border border-[#F8D7DA] text-[#842029] space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-[#B02A37] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-xs">
                      {errorType === 'QUOTA_EXCEEDED' 
                        ? '이번 달 무료 AI 주석 사용 횟수가 모두 소진되었습니다' 
                        : errorType === 'RATE_LIMIT'
                        ? '일시적인 AI 서버 응답 지연이 발생했습니다'
                        : '주석 분석 중 응답이 지연되었습니다'}
                    </h4>
                    <p className="text-xs mt-1 text-[#6A1A24] leading-relaxed">
                      {errorType === 'QUOTA_EXCEEDED'
                        ? '무료 제공(월 10회)이 완료되었습니다. 플랜을 충전하시면 즉시 고품질 주석을 계속 이용하실 수 있습니다.'
                        : errorType === 'RATE_LIMIT'
                        ? 'Google AI 서버의 일시적 요청 폭주로 지연되었습니다. 아래 [다시 시도]를 누르시면 빠른 대체 가용 서버로 즉시 재연결됩니다.'
                        : 'AI 분석 서버의 응답 시간이 초과되었습니다. [다시 시도]를 누르시면 초고속 가용 엔진으로 즉시 생성됩니다.'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {errorType === 'QUOTA_EXCEEDED' ? (
                    <button
                      onClick={() => setShowRechargeModal(true)}
                      className="px-3 py-1.5 rounded-lg bg-[#C46A40] hover:bg-[#B55434] text-white text-xs font-medium transition-colors cursor-pointer"
                    >
                      충전 플랜 확인하기
                    </button>
                  ) : (
                    <button
                      onClick={() => handleFetchCommentary(true)}
                      className="px-3.5 py-1.5 rounded-lg bg-[#C46A40] hover:bg-[#B55434] text-white text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      다시 시도
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* E. 주석 본문 내용 */}
            {!isLoading && commentaryData && (
              <div className="space-y-6 text-xs sm:text-sm">

                {/* 선택된 개역개정 본문 카드 */}
                <div className="p-4 rounded-xl bg-white border border-[#E8E3DA] shadow-2xs space-y-3">
                  <div className="flex items-center justify-between text-[#8C877D] text-xs">
                    <span className="font-serif font-bold text-sm text-[#2C2B29]">{commentaryData.reference}</span>
                  </div>
                  <p className="font-serif text-sm leading-relaxed text-[#1F1E1D] font-medium">
                    "{commentaryData.scriptureText}"
                  </p>

                  {/* 성경 구절 아래 원어 전체 표시 (원어 아래 한글 발음 + 개역성경 뜻) */}
                  {commentaryData.originalLanguageCommentary?.words?.length > 0 && (
                    <div className="pt-3 border-t border-[#F0ECE4]">
                      <div className="flex items-center justify-between text-[11px] text-[#8C877D] mb-2.5">
                        <span className="font-semibold text-[#6E6A63]">{commentaryData.originalLanguageCommentary.language} 원어 전문</span>
                        <span className="text-[11px] text-[#8C877D]">단어를 눌러 정보확인</span>
                      </div>
                      <div 
                        dir={commentaryData.testament === '구약' ? 'rtl' : 'ltr'} 
                        className="flex flex-wrap gap-x-2 gap-y-3 font-serif leading-relaxed text-[#2C2B29] p-3 rounded-xl bg-[#FAF9F5] border border-[#EFECE6]"
                      >
                        {commentaryData.originalLanguageCommentary.words.map((w, idx) => {
                          const interMeaning = getInterlinearMeaning(w);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => scrollToWordCard(idx)}
                              className="flex flex-col items-center justify-start p-1.5 rounded-lg hover:bg-[#FAF0EB] hover:border-[#F1D3C6] border border-transparent transition-all cursor-pointer group text-center min-w-[42px]"
                              title={`[${w.strongNumber}] ${formatWordPronunciation(w)}${interMeaning.text ? ` - ${interMeaning.text}` : ''} (클릭 시 상세 카드로 이동)`}
                            >
                              {/* 1. 원어 단어 */}
                              <span className="font-serif text-base sm:text-lg text-[#2C2B29] group-hover:text-[#C46A40] font-medium group-hover:font-bold transition-colors">
                                {w.wordOriginal}
                              </span>
                              {/* 2. 한글 발음 */}
                              <span className="text-[11px] text-[#7A756D] font-sans group-hover:text-[#C46A40] transition-colors mt-0.5">
                                {getKoreanPronunciation(w)}
                              </span>
                              {/* 3. 개역성경 번역 뜻 (번역 없는 단어는 사전 기본의미 보완) */}
                              {interMeaning.text && (
                                <span className={`text-[10px] font-sans mt-0.5 px-1.5 py-0.2 rounded max-w-[100px] truncate ${
                                  interMeaning.isOriginalTranslation
                                    ? 'text-[#C46A40] font-medium bg-[#FAF0EB] border border-[#F6DDD1]'
                                    : 'text-[#8C877D] font-normal'
                                }`}>
                                  {interMeaning.text}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* ======================================================== */}
                {/* [상단 원문 카드 아래] 구절 전체 신학 심층 연구 섹션 */}
                {/* (교의학 · 구속사적 성취 · 개혁신학 · 하나님 나라와 복음) */}
                {/* ======================================================== */}
                <div className="rounded-xl bg-[#FDFBF7] border border-[#E8DFC8] p-4 shadow-2xs space-y-3">
                  {/* 상단 배너 헤더 */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[#FAF0EB] border border-[#F1D3C6] flex items-center justify-center text-[#C46A40] shrink-0">
                        <Landmark className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-serif font-bold text-sm text-[#2C2B29]">
                          구절 심층 연구
                        </h4>
                        <p className="text-[11px] text-[#7A756D] mt-0.5">
                          교의학, 구속사, 개혁신학, 하나님나라와 복음의 관점에서 심도있는 학술적 연구를 해드립니다.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleTriggerPassageTheology}
                        disabled={passageTheologyLoading}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                          passageTheologyResult
                            ? isPassageTheologyOpen
                              ? 'bg-[#EAE4D6] text-[#4A4741] hover:bg-[#DDD6C5]'
                              : 'bg-[#C46A40] hover:bg-[#B55434] text-white'
                            : 'bg-[#C46A40] hover:bg-[#B55434] text-white'
                        }`}
                      >
                        {passageTheologyLoading ? (
                          <>
                            <ClaudeSparkleIcon className="w-3.5 h-3.5 animate-spin" />
                            <span>연구 분석 중...</span>
                          </>
                        ) : passageTheologyResult ? (
                          <>
                            <span>{isPassageTheologyOpen ? '접기' : '연구 펼쳐보기'}</span>
                            {isPassageTheologyOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </>
                        ) : (
                          <span>연구시작(1회차감)</span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* 로딩 인디케이터 */}
                  {passageTheologyLoading && (
                    <div className="py-6 text-center space-y-2.5 animate-pulse bg-white rounded-lg border border-[#EAE4DA] p-4">
                      <div className="w-9 h-9 rounded-full bg-[#FAF0EB] border border-[#F1D3C6] flex items-center justify-center mx-auto text-[#C46A40]">
                        <ClaudeSparkleIcon className="w-4 h-4 animate-spin text-[#C46A40]" />
                      </div>
                      <p className="text-xs font-semibold text-[#4A4741]">
                        본 구절을 학문적 깊이와 영혼을 울리는 은혜로운 연구를 위해 심층 주해하고 있습니다...
                      </p>
                    </div>
                  )}

                  {/* 신학 심층 연구 결과 펼침 뷰 */}
                  {isPassageTheologyOpen && passageTheologyResult && (
                    <div className="pt-3 border-t border-[#EAE4D6] space-y-4 animate-in fade-in zoom-in-95 duration-200">
                      {/* 상단 복사 버튼 바 (중복 제목 삭제, 우측 복사 버튼 유지) */}
                      <div className="flex items-center justify-end pb-2 border-b border-[#EAE4DA] text-xs">
                        <button
                          type="button"
                          onClick={handleCopyPassageTheology}
                          className="px-2.5 py-1 rounded-lg bg-white border border-[#E0D7C5] text-[#5C5852] hover:text-[#C46A40] hover:border-[#C46A40] transition-colors text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
                          title="신학 연구 전체 설교노트에 복사"
                        >
                          {copiedPassageTheology ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-700 font-medium">복사됨</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>복사</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* 0. 해석과 의미 */}
                      {passageTheologyResult.interpretationAndSignificance && (
                        <div className="p-3.5 rounded-xl bg-gradient-to-br from-[#FAF5EE] to-[#FDFBF7] border border-[#DFD5C0] shadow-2xs space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-sm bg-[#C46A40]"></span>
                            <h5 className="font-serif font-bold text-xs sm:text-sm text-[#2C2B29]">
                              해석과 의미
                            </h5>
                          </div>
                          <div className="text-xs text-[#38342E] leading-relaxed whitespace-pre-line pl-3 font-normal">
                            <p>{passageTheologyResult.interpretationAndSignificance}</p>
                          </div>
                        </div>
                      )}
                      
                      {/* 1. 교의학적 */}
                      <div className="p-3.5 rounded-xl bg-white border border-[#EAE4DA] shadow-2xs space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#C46A40]"></span>
                          <h5 className="font-serif font-bold text-xs sm:text-sm text-[#2C2B29]">
                            1. 교의학적
                          </h5>
                        </div>
                        <div className="text-xs text-[#4A4741] leading-relaxed whitespace-pre-line pl-3 space-y-2 font-normal">
                          <p>{passageTheologyResult.dogmaticTheology.theologicalContent}</p>
                          {passageTheologyResult.dogmaticTheology.gracefulEnding && (
                            <p className="text-[#38261E] font-serif">
                              {passageTheologyResult.dogmaticTheology.gracefulEnding}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 2. 구속사적 그리스도 중심 */}
                      <div className="p-3.5 rounded-xl bg-white border border-[#EAE4DA] shadow-2xs space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#8B6B4C]"></span>
                          <h5 className="font-serif font-bold text-xs sm:text-sm text-[#2C2B29]">
                            2. 구속사적 그리스도 중심
                          </h5>
                        </div>
                        <div className="text-xs text-[#4A4741] leading-relaxed whitespace-pre-line pl-3 space-y-2 font-normal">
                          <p>{passageTheologyResult.redemptiveHistory.theologicalContent}</p>
                          {passageTheologyResult.redemptiveHistory.gracefulEnding && (
                            <p className="text-[#38261E] font-serif">
                              {passageTheologyResult.redemptiveHistory.gracefulEnding}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 3. 개혁신학적 */}
                      <div className="p-3.5 rounded-xl bg-white border border-[#EAE4DA] shadow-2xs space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#8B6B4C]"></span>
                          <h5 className="font-serif font-bold text-xs sm:text-sm text-[#2C2B29]">
                            3. 개혁신학적
                          </h5>
                        </div>
                        <div className="text-xs text-[#4A4741] leading-relaxed whitespace-pre-line pl-3 space-y-2 font-normal">
                          <p>{passageTheologyResult.reformedPerspective.theologicalContent}</p>
                          {passageTheologyResult.reformedPerspective.gracefulEnding && (
                            <p className="text-[#38261E] font-serif">
                              {passageTheologyResult.reformedPerspective.gracefulEnding}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 4. 하나님나라와 복음 */}
                      <div className="p-3.5 rounded-xl bg-white border border-[#EAE4DA] shadow-2xs space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#C46A40]"></span>
                          <h5 className="font-serif font-bold text-xs sm:text-sm text-[#2C2B29]">
                            4. 하나님나라와 복음
                          </h5>
                        </div>
                        <div className="text-xs text-[#4A4741] leading-relaxed whitespace-pre-line pl-3 space-y-2 font-normal">
                          <p>{passageTheologyResult.kingdomAndGospel.theologicalContent}</p>
                          {passageTheologyResult.kingdomAndGospel.gracefulEnding && (
                            <p className="text-[#38261E] font-serif">
                              {passageTheologyResult.kingdomAndGospel.gracefulEnding}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 5. 종합 결언 (제목 및 아이콘 삭제) */}
                      {passageTheologyResult.pastoralGraceSummary && (
                        <div className="p-4 rounded-xl bg-[#FAF0EB] border border-[#E8BCA8] text-xs leading-relaxed text-[#38261E] font-serif shadow-xs">
                          <p className="leading-relaxed">
                            {passageTheologyResult.pastoralGraceSummary}
                          </p>
                        </div>
                      )}

                    </div>
                  )}
                </div>

                {/* [섹션 1] 원어 주석 (구절 내 모든 단어 파싱) */}
                {(activeTab === 'all' || activeTab === 'original') && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between pb-1 border-b border-[#EAE4DA]">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-[#C46A40]" />
                        <h3 className="font-serif font-bold text-sm text-[#2C2B29]">
                          1. 원어 주석 <span className="font-sans font-normal text-xs text-[#7A756D]">({commentaryData.originalLanguageCommentary.language} BDB/BDAG 기준 · 전 단어 분석)</span>
                        </h3>
                      </div>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#FAF0EB] text-[#C46A40] font-medium">
                        총 {commentaryData.originalLanguageCommentary.words.length}개 단어
                      </span>
                    </div>

                    {/* 모든 단어 카드 목록 */}
                    <div className="space-y-3">
                      {commentaryData.originalLanguageCommentary.words.map((word, idx) => {
                        const wordKoMeaning = getKoreanTranslationMeaning(word);
                        return (
                          <div 
                            id={`word-card-${idx}`}
                            key={idx}
                            className="p-3.5 rounded-xl bg-white border border-[#E8E3DA] hover:border-[#D5CEBF] transition-all duration-300 shadow-2xs space-y-2.5"
                          >
                            {/* 상단: 단어 고유번호(맨 앞), 원어 표기, 발음(영어+한글), 번역 뜻, 어근 및 어원 분해 */}
                            <div className="flex items-baseline justify-between gap-2 flex-wrap">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                {/* 1) 단어 앞 #번호 -> 고유번호(스트롱 코드) 맨 앞 배치 */}
                                <span 
                                  className="px-2 py-0.5 rounded-md bg-[#F0ECE4] text-[#4A4741] font-mono text-[11px] font-bold border border-[#DDD8CE] shrink-0 shadow-2xs"
                                  title="단어 고유번호 (Strong Number)"
                                >
                                  {word.strongNumber}
                                </span>

                                {/* 2) 원어 본문 표기 */}
                                <span 
                                  dir={commentaryData.testament === '구약' ? 'rtl' : 'ltr'} 
                                  className="font-serif font-bold text-lg text-[#C46A40]"
                                >
                                  {word.wordOriginal}
                                </span>

                                {/* 3) 발음 (영어 / 한글 동시 표기) */}
                                <span className="text-xs text-[#6E6A63] font-medium">
                                  [{formatWordPronunciation(word)}]
                                </span>

                                {/* 4) 개역성경 뜻: '개역' 삭제하고 뜻만 표시 */}
                                {wordKoMeaning && (
                                  <span className="px-2 py-0.5 rounded-md bg-[#FAF0EB] text-[#C46A40] text-xs font-semibold border border-[#F1D3C6]">
                                    "{wordKoMeaning}"
                                  </span>
                                )}
                              </div>

                              {/* 우측: 어근 및 합성어 어원 분해 */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="px-2.5 py-0.5 rounded-md bg-[#F4EFE6] text-[#4A4741] text-[11px] font-medium border border-[#E8E3DA]">
                                  {formatRootDisplay(word)}
                                </span>
                              </div>
                            </div>

                            {/* 문법 파싱 태그 */}
                            <div className="text-xs px-2.5 py-1 rounded-lg bg-[#FAF9F5] border border-[#EFECE6] text-[#4A4741] font-mono">
                              <span className="text-[#8C877D] font-sans font-semibold mr-1.5">문법 분석:</span>
                              {word.parsing}
                            </div>

                            {/* 사전적 정의 및 문맥적 해설 */}
                            <div className="text-xs space-y-1 leading-relaxed">
                              <div className="text-[#6E6A63]">
                                <strong className="text-[#4A4741]">사전적 정의:</strong> {word.lexicalMeaning}
                              </div>
                              <div className="text-[#2C2B29] font-medium">
                                <strong className="text-[#C46A40]">신학적 해설:</strong> {word.contextualMeaning}
                              </div>
                              {/* 학설 참고: 카드 박스 없애고 약간 흐린 글자로 표시 */}
                              {word.scholarlyNote && (
                                <div className="text-xs text-[#7A756D] pt-1 leading-relaxed">
                                  <span className="font-semibold text-[#8C877D] mr-1">학설 참고:</span>
                                  <span>{word.scholarlyNote}</span>
                                </div>
                              )}
                            </div>

                            {/* ======================================================== */}
                            {/* [고도화] 단어 심층 연구 (어원변천사 · 빈도수 · 신구약 대조 · 성경전체 용례) */}
                            {/* ======================================================== */}
                            <div className="pt-2.5 border-t border-[#F0ECE4] space-y-2.5">
                              {/* 단어 심층 연구 버튼 (구절 심층 연구 버튼과 동일한 스타일 및 상태) */}
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleTriggerWordDeepStudy(word, idx)}
                                  disabled={deepStudyLoading[`${commentaryData.reference}_${word.strongNumber}_etymology`]}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                                    deepStudyResults[`${commentaryData.reference}_${word.strongNumber}_etymology`]
                                      ? activeDeepStudyWordIdx[idx]
                                        ? 'bg-[#EAE4D6] text-[#4A4741] hover:bg-[#DDD6C5]'
                                        : 'bg-[#C46A40] hover:bg-[#B55434] text-white'
                                      : 'bg-[#C46A40] hover:bg-[#B55434] text-white'
                                  }`}
                                >
                                  {deepStudyLoading[`${commentaryData.reference}_${word.strongNumber}_etymology`] ? (
                                    <>
                                      <ClaudeSparkleIcon className="w-3.5 h-3.5 animate-spin" />
                                      <span>연구 분석 중...</span>
                                    </>
                                  ) : deepStudyResults[`${commentaryData.reference}_${word.strongNumber}_etymology`] ? (
                                    <>
                                      <span>{activeDeepStudyWordIdx[idx] ? '접기' : '연구 펼쳐보기'}</span>
                                      {activeDeepStudyWordIdx[idx] ? (
                                        <ChevronDown className="w-3.5 h-3.5" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5" />
                                      )}
                                    </>
                                  ) : (
                                    <span>단어심층 연구(1회 차감)</span>
                                  )}
                                </button>
                              </div>

                              {/* 2. 심층 연구 펼침 패널 (로딩 또는 결과 표시) */}
                              {activeDeepStudyWordIdx[idx] && (
                                <div className="mt-2 rounded-xl bg-[#FAF9F5] border border-[#E8E3DA] p-3.5 space-y-3.5 animate-in fade-in zoom-in-95 duration-150 shadow-xs">
                                  {/* 상단 탭 헤더 및 닫기/복사 */}
                                  <div className="flex items-center justify-between pb-2 border-b border-[#EAE4DA] text-xs">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-[#2C2B29] flex items-center gap-1.5">
                                        <BookOpen className="w-3.5 h-3.5 text-[#C46A40]" />
                                        <span>단어심층연구: 어원, 용례, 대조</span>
                                      </span>
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#FAF0EB] text-[#C46A40] font-semibold font-mono">
                                        {word.strongNumber}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                      {/* 복사 버튼 */}
                                      {deepStudyResults[`${commentaryData.reference}_${word.strongNumber}_etymology`] && (
                                        <button
                                          type="button"
                                          onClick={() => handleCopyWordDeepStudy(deepStudyResults[`${commentaryData.reference}_${word.strongNumber}_etymology`])}
                                          className="p-1 rounded text-[#7A756D] hover:text-[#C46A40] hover:bg-[#EFEAE2] transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
                                          title="단어 심층 연구 내용 복사"
                                        >
                                          {copiedDeepStudy[`${commentaryData.reference}_${word.strongNumber}_etymology`] ? (
                                            <>
                                              <Check className="w-3 h-3 text-emerald-600" />
                                              <span className="text-emerald-700">복사됨</span>
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="w-3 h-3" />
                                              <span>복사</span>
                                            </>
                                          )}
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => setActiveDeepStudyWordIdx(prev => ({ ...prev, [idx]: false }))}
                                        className="p-1 rounded text-[#8C877D] hover:text-[#2C2B29] hover:bg-[#EBE5DC] transition-colors cursor-pointer"
                                        title="접기"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* 로딩 인디케이터 */}
                                  {deepStudyLoading[`${commentaryData.reference}_${word.strongNumber}_etymology`] && (
                                    <div className="py-6 text-center space-y-2.5 animate-pulse">
                                      <div className="w-8 h-8 rounded-full bg-[#FAF0EB] border border-[#F1D3C6] flex items-center justify-center mx-auto text-[#C46A40]">
                                        <ClaudeSparkleIcon className="w-4 h-4 animate-spin text-[#C46A40]" />
                                      </div>
                                      <p className="text-xs font-semibold text-[#4A4741]">
                                        어원 변천사, 신구약 대조 및 핵심 용례를 심층 연구 중입니다...
                                      </p>
                                      <p className="text-[11px] text-[#8C877D]">
                                        TDOT/TDNT/BDB/BDAG 수준의 학술적 연구를 제공합니다.
                                      </p>
                                    </div>
                                  )}

                                  {/* 단어 심층 연구 결과 표시 */}
                                  {deepStudyResults[`${commentaryData.reference}_${word.strongNumber}_etymology`] && (
                                    <div className="space-y-4 text-xs leading-relaxed">
                                      {/* [강조 뱃지] 성경 전체 출현 빈도수 */}
                                      <div className="p-3 rounded-xl bg-white border border-[#E8DFC8] flex items-start gap-2.5 shadow-2xs">
                                        <span className="text-base leading-none mt-0.5">🏷️</span>
                                        <div>
                                          <div className="text-[11px] font-bold text-[#8B6B4C]">성경 전체 출현 빈도수</div>
                                          <div className="text-xs sm:text-sm font-serif font-bold text-[#2C2B29] mt-0.5">
                                            {deepStudyResults[`${commentaryData.reference}_${word.strongNumber}_etymology`].totalOccurrences}
                                          </div>
                                        </div>
                                      </div>

                                      {/* 1) 고대 어원 기원 및 역사적 변천사 */}
                                      <div className="p-3 rounded-xl bg-white border border-[#EAE4DA] shadow-2xs space-y-2">
                                        <h5 className="font-serif font-bold text-[#2C2B29] flex items-center gap-1.5 text-xs sm:text-sm">
                                          <span className="w-1.5 h-1.5 rounded-full bg-[#C46A40]"></span>
                                          <span>1. 고대 어원 기원 및 역사적 변천사</span>
                                        </h5>
                                        <p className="text-[#4A4741] pl-2 whitespace-pre-line leading-relaxed">
                                          {deepStudyResults[`${commentaryData.reference}_${word.strongNumber}_etymology`].etymologyGenesis}
                                        </p>
                                      </div>

                                      {/* 2) 신구약 교차 원어 대조 */}
                                      {deepStudyResults[`${commentaryData.reference}_${word.strongNumber}_etymology`].crossTestamentConnection && (
                                        <div className="p-3 rounded-xl bg-white border border-[#EAE4DA] shadow-2xs space-y-2.5">
                                          <div className="flex items-center justify-between flex-wrap gap-1 pb-1.5 border-b border-[#F0ECE4]">
                                            <h5 className="font-serif font-bold text-[#2C2B29] flex items-center gap-1.5 text-xs sm:text-sm">
                                              <ArrowRightLeft className="w-3.5 h-3.5 text-[#C46A40]" />
                                              <span>2. 신구약 교차 원어 대조 ({deepStudyResults[`${commentaryData.reference}_${word.strongNumber}_etymology`].crossTestamentConnection.targetLanguage})</span>
                                            </h5>
                                            <div className="flex items-center gap-1 text-[11px]">
                                              <span className="text-[#7A756D]">대응 표제어:</span>
                                              <span className="font-serif font-bold text-[#C46A40] bg-[#FAF0EB] px-1.5 py-0.2 rounded border border-[#F6DDD1]">
                                                {deepStudyResults[`${commentaryData.reference}_${word.strongNumber}_etymology`].crossTestamentConnection.equivalentTerm}
                                              </span>
                                              <span className="font-mono text-[10px] text-[#8C877D]">
                                                ({deepStudyResults[`${commentaryData.reference}_${word.strongNumber}_etymology`].crossTestamentConnection.strongNumber})
                                              </span>
                                            </div>
                                          </div>

                                          {/* 70인역(LXX) 및 신구약 의미 승화 해설 */}
                                          <p className="text-[#4A4741] pl-2 whitespace-pre-line leading-relaxed">
                                            {deepStudyResults[`${commentaryData.reference}_${word.strongNumber}_etymology`].crossTestamentConnection.explanation}
                                          </p>

                                          {/* 교차 용례 2선 */}
                                          {deepStudyResults[`${commentaryData.reference}_${word.strongNumber}_etymology`].crossTestamentConnection.crossUsages?.length > 0 && (
                                            <div className="space-y-2 pl-2 pt-1">
                                              <div className="text-[11px] font-bold text-[#8B6B4C]">
                                                • {deepStudyResults[`${commentaryData.reference}_${word.strongNumber}_etymology`].crossTestamentConnection.targetLanguage} 핵심 교차 용례:
                                              </div>
                                              <div className="space-y-2">
                                                {deepStudyResults[`${commentaryData.reference}_${word.strongNumber}_etymology`].crossTestamentConnection.crossUsages.map((cUsage, cIdx) => (
                                                  <div key={cIdx} className="p-2.5 rounded-lg bg-[#FAF9F5] border border-[#EFECE6] space-y-1">
                                                    <div className="font-serif font-bold text-[#C46A40] text-xs">
                                                      {cUsage.reference}
                                                    </div>
                                                    <p className="font-serif text-[11px] text-[#2C2B29] bg-white px-2 py-1 rounded border border-[#EAE4DA]">
                                                      "{cUsage.scriptureSnippet}"
                                                    </p>
                                                    <p className="text-[11px] text-[#5C5852] leading-relaxed pt-0.5 pl-1 italic">
                                                      💡 {cUsage.graceInsight}
                                                    </p>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* 3) 성경 전체를 관통하는 핵심 용례 */}
                                      <div className="p-3 rounded-xl bg-white border border-[#EAE4DA] shadow-2xs space-y-2.5">
                                        <h5 className="font-serif font-bold text-[#2C2B29] flex items-center gap-1.5 text-xs sm:text-sm">
                                          <span className="w-1.5 h-1.5 rounded-full bg-[#C46A40]"></span>
                                          <span>3. 성경 전체를 관통하는 핵심 용례 (신구약 관통)</span>
                                        </h5>
                                        <div className="space-y-2 pl-2">
                                          {deepStudyResults[`${commentaryData.reference}_${word.strongNumber}_etymology`].biblicalUsages?.map((usage, uIdx) => (
                                            <div key={uIdx} className="p-2.5 rounded-lg bg-[#FAF9F5] border border-[#E8E3DA] space-y-1 shadow-2xs">
                                              <div className="flex items-center justify-between font-serif font-bold text-[#C46A40] text-xs">
                                                <span>{usage.reference}</span>
                                              </div>
                                              <p className="font-serif text-[11px] text-[#2C2B29] bg-white px-2 py-1 rounded border border-[#EFECE6]">
                                                "{usage.scriptureSnippet}"
                                              </p>
                                              <p className="text-[11px] text-[#4A4741] leading-relaxed pt-0.5 pl-1">
                                                {usage.theologicalContext}
                                              </p>
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      {/* 4) 유사 동의어 대조 및 독보적 뉘앙스 */}
                                      <div className="p-3 rounded-xl bg-white border border-[#EAE4DA] shadow-2xs space-y-2">
                                        <h5 className="font-serif font-bold text-[#2C2B29] flex items-center gap-1.5 text-xs sm:text-sm">
                                          <span className="w-1.5 h-1.5 rounded-full bg-[#C46A40]"></span>
                                          <span>4. 유사 동의어 대조 및 고유한 뉘앙스</span>
                                        </h5>
                                        <p className="text-[#4A4741] pl-2 whitespace-pre-line leading-relaxed">
                                          {deepStudyResults[`${commentaryData.reference}_${word.strongNumber}_etymology`].synonymNuance}
                                        </p>
                                      </div>

                                      {/* 5) 심층 연구 결언 (제목 삭제) */}
                                      {deepStudyResults[`${commentaryData.reference}_${word.strongNumber}_etymology`].gracefulConclusion && (
                                        <div className="p-3.5 rounded-xl bg-[#FAF0EB]/80 border border-[#F1D3C6] shadow-2xs">
                                          <p className="text-xs text-[#4A2416] leading-relaxed font-serif">
                                            {deepStudyResults[`${commentaryData.reference}_${word.strongNumber}_etymology`].gracefulConclusion}
                                          </p>
                                        </div>
                                      )}

                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 문장 구조 및 심층 신학적 맥락 (확장된 2~3단락) */}
                    <div className="p-4 rounded-xl bg-[#F7F5F0] border border-[#E8E3DA] text-xs leading-relaxed space-y-2">
                      <div className="font-semibold text-[#4A4741] flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-[#C46A40]" />
                        <span>원어 문장 구조 및 심층 신학적 맥락 해설</span>
                      </div>
                      <div className="text-[#5C5852] whitespace-pre-line leading-relaxed space-y-2">
                        {commentaryData.originalLanguageCommentary.syntacticSummary}
                      </div>
                    </div>
                  </section>
                )}

                {/* [섹션 2] 역사·문화·지리적 배경 (길고 깊이 있게 확장) */}
                {(activeTab === 'all' || activeTab === 'background') && (
                  <section className="space-y-3">
                    <div className="flex items-center gap-2 pb-1 border-b border-[#EAE4DA]">
                      <Landmark className="w-4 h-4 text-[#8B6B4C]" />
                      <h3 className="font-serif font-bold text-sm text-[#2C2B29]">2. 역사·문화·지리적 배경 (심층 분석)</h3>
                    </div>

                    <div className="p-4 rounded-xl bg-white border border-[#E8E3DA] space-y-4 leading-relaxed text-xs">
                      <div>
                        <h4 className="font-bold text-[#4A4741] mb-1.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#8B6B4C]"></span>
                          시대 및 문화적 배경
                        </h4>
                        <p className="text-[#5C5852] whitespace-pre-line leading-relaxed pl-2.5">
                          {commentaryData.historicalBackground.eraAndCulture}
                        </p>
                      </div>
                      <div className="pt-3 border-t border-[#F0ECE4]">
                        <h4 className="font-bold text-[#4A4741] mb-1.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#8B6B4C]"></span>
                          지리적 및 사회적 정황
                        </h4>
                        <p className="text-[#5C5852] whitespace-pre-line leading-relaxed pl-2.5">
                          {commentaryData.historicalBackground.geographicalSocialContext}
                        </p>
                      </div>
                      <div className="pt-3 border-t border-[#F0ECE4]">
                        <h4 className="font-bold text-[#4A4741] mb-1.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#8B6B4C]"></span>
                          1차 수신자를 향한 기록 목적 및 신학적 동기
                        </h4>
                        <p className="text-[#5C5852] whitespace-pre-line leading-relaxed pl-2.5">
                          {commentaryData.historicalBackground.theologicalIntent}
                        </p>
                      </div>
                    </div>
                  </section>
                )}

                {/* [섹션 3] 설교 인사이트 */}
                {(activeTab === 'all' || activeTab === 'sermon') && (
                  <section className="space-y-3">
                    <div className="flex items-center gap-2 pb-1 border-b border-[#EAE4DA]">
                      <Lightbulb className="w-4 h-4 text-[#B87A28]" />
                      <h3 className="font-serif font-bold text-sm text-[#2C2B29]">3. 설교 인사이트 & 현대적 적용</h3>
                    </div>

                    <div className="p-4 rounded-xl bg-white border border-[#E8E3DA] space-y-3.5 leading-relaxed text-xs">
                      <div>
                        <h4 className="font-bold text-[#C46A40] mb-1">복음적 핵심 메시지</h4>
                        <p className="text-[#2C2B29] font-medium leading-relaxed">{commentaryData.sermonInsight.coreMessage}</p>
                      </div>

                      <div className="pt-2 border-t border-[#F0ECE4] space-y-2">
                        <h4 className="font-bold text-[#4A4741]">설교 작성 포인트</h4>
                        <ul className="space-y-1.5 pl-2">
                          {commentaryData.sermonInsight.sermonPoints.map((pt, i) => (
                            <li key={i} className="flex items-start gap-2 text-[#5C5852]">
                              <span className="w-4 h-4 rounded-full bg-[#FAF0EB] text-[#C46A40] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                                {i + 1}
                              </span>
                              <span>{pt}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="pt-2 border-t border-[#F0ECE4]">
                        <h4 className="font-bold text-[#4A4741] mb-1">그리스도인을 위한 묵상과 삶의 적용</h4>
                        <p className="text-[#5C5852] bg-[#FAF9F5] p-3 rounded-lg border border-[#EFECE6] whitespace-pre-line leading-relaxed">
                          {commentaryData.sermonInsight.meditationApplication}
                        </p>
                      </div>
                    </div>
                  </section>
                )}

                {/* 하단 사전 대조 검증 및 출처 안내 */}
                <div className="flex items-center justify-between text-[11px] text-[#A39E94] pt-2 px-1 border-t border-[#EFECE6]">
                  <span>엄격한 신학 원어 사전 대조 검증</span>
                  <span>Gemini 3.6 Flash</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 4. 구독 및 충전 안내 모달 */}
      {showRechargeModal && (
        <div 
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowRechargeModal(false)}
        >
          <div 
            className="relative w-full max-w-md bg-[#FAF9F5] text-[#2C2B29] rounded-2xl shadow-2xl border border-[#E7E5DF] overflow-hidden p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 닫기 버튼 */}
            <button 
              onClick={() => setShowRechargeModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-[#8C877D] hover:text-[#2C2B29] hover:bg-[#EFEAE2] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4 stroke-[1.8]" />
            </button>

            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-2xl bg-[#FAF0EB] border border-[#F1D3C6] flex items-center justify-center text-[#C46A40] mx-auto mb-3 shadow-2xs">
                <CreditCard className="w-6 h-6 stroke-[1.8]" />
              </div>
              <h3 className="text-base font-serif font-bold text-[#2C2B29] mb-1">AI 원어 주석 이용권 안내</h3>
              <p className="text-xs text-[#7A756D] leading-relaxed">
                매월 기본 10회가 무료 제공되며, 필요에 따라 유료 이용권을 충전하실 수 있습니다.
              </p>
              <p className="text-[11px] text-[#C46A40] font-medium mt-1">
                * 충전된 유료 횟수는 1년(365일)동안 사용하실 수 있습니다.
              </p>
            </div>

            {/* 현재 잔여 상태 */}
            <div className="p-3 bg-white rounded-xl border border-[#E8E3DA] mb-4 text-xs flex items-center justify-between">
              <div>
                <span className="text-[#8C877D]">현재 잔여 횟수:</span>
                <strong className="ml-1 text-sm font-bold text-[#C46A40]">{totalRemaining}회</strong>
                <span className="text-[10px] text-[#7A756D] ml-1.5">(무료 {freeRemaining}회 / 유료 {paidRemaining}회)</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-[#F4EFE6] text-[#6E6A63] text-[10px] font-medium">
                매월 1일 10회 자동 갱신
              </span>
            </div>

            {rechargeSuccessMessage && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>{rechargeSuccessMessage}</span>
              </div>
            )}

            {/* 충전 플랜 목록 */}
            <div className="space-y-2.5 mb-2">
              {/* 기본 무료 플랜 */}
              <div className="p-3 rounded-xl border border-[#E8E3DA] bg-white flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-[#2C2B29]">기본 무료 제공</div>
                  <div className="text-[#8C877D] text-[11px]">매월 10회 무료 제공</div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-[#F4EFE6] text-[#7A756D] font-bold text-xs">
                  무료 (0원)
                </span>
              </div>

              {/* 플랜 1: 라이트 플랜 (200회) */}
              <div className="p-3 rounded-xl border border-[#E8E3DA] bg-white hover:border-[#C46A40] transition-all flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-[#2C2B29]">라이트 플랜 (200회)</div>
                  <div className="text-[#8C877D] text-[11px]">설교 준비 및 집중 묵상용</div>
                </div>
                <button
                  onClick={() => alert('준비중입니다.\n곧 서비스 오픈 예정입니다!')}
                  className="px-3 py-1.5 rounded-lg bg-[#C46A40] hover:bg-[#B55434] text-white font-semibold transition-colors cursor-pointer shadow-2xs"
                >
                  5,000원 충전
                </button>
              </div>

              {/* 플랜 2: 스탠다드 플랜 (500회) - 인기 추천 */}
              <div className="p-3 rounded-xl border-2 border-[#C46A40] bg-[#FFFBF8] relative flex items-center justify-between text-xs shadow-xs">
                <span className="absolute -top-2 left-4 px-2 py-0.2 rounded-full bg-[#C46A40] text-white text-[9px] font-bold tracking-wider">
                  인기 추천
                </span>
                <div>
                  <div className="font-bold text-[#2C2B29]">스탠다드 플랜 (500회)</div>
                  <div className="text-[#8C877D] text-[11px]">가장 많은 목회자/성도가 선택</div>
                </div>
                <button
                  onClick={() => alert('준비중입니다.\n곧 서비스 오픈 예정입니다!')}
                  className="px-3 py-1.5 rounded-lg bg-[#C46A40] hover:bg-[#B55434] text-white font-semibold transition-colors cursor-pointer shadow-2xs"
                >
                  10,000원 충전
                </button>
              </div>

              {/* 플랜 3: 프로 플랜 (1,000회) - 최대 혜택 패키지 */}
              <div className="p-3 rounded-xl border border-[#E8E3DA] bg-white hover:border-[#C46A40] transition-all flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-[#2C2B29]">프로 플랜 (1,000회)</div>
                  <div className="text-[#8C877D] text-[11px]">최대 혜택 패키지</div>
                </div>
                <button
                  onClick={() => alert('준비중입니다.\n곧 서비스 오픈 예정입니다!')}
                  className="px-3 py-1.5 rounded-lg bg-[#2C2B29] hover:bg-[#1A1918] text-white font-semibold transition-colors cursor-pointer shadow-2xs"
                >
                  15,000원 충전
                </button>
              </div>
            </div>

            {/* 🎁 친구 추천하기 섹션 */}
            <div className="mt-3 p-3.5 rounded-2xl bg-gradient-to-br from-[#FFFBF8] to-[#F7F4EE] border border-[#F1D3C6] shadow-2xs">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#FAF0EB] text-[#C46A40] flex items-center justify-center shrink-0 border border-[#F1D3C6]">
                    <Gift className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#2C2B29]">
                      친구 추천하기
                    </h4>
                    <p className="text-[11px] font-bold text-[#C46A40] mt-0.5">
                      +{referralBonusCount || 50}회 혜택 선물
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsReferralFormOpen(!isReferralFormOpen);
                    setReferralFeedback(null);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-[#C46A40] hover:bg-[#B55434] text-white text-xs font-semibold shrink-0 transition-colors shadow-2xs cursor-pointer"
                >
                  {isReferralFormOpen ? '닫기' : '친구 추천하기'}
                </button>
              </div>

              {/* 친구 추천 신청 입력 폼 (이메일 기반) */}
              {isReferralFormOpen && (
                <form onSubmit={handleSubmitReferral} className="mt-3 pt-3 border-t border-[#EFECE6] space-y-2.5 animate-in fade-in duration-200">
                  <div className="p-2.5 rounded-xl bg-white border border-[#E8E3DA] text-[11px] text-[#C46A40] leading-relaxed">
                    💡 가입하신 구글/지메일 주소를 정확히 기입하시면, 관리자 확인 후 AI {referralBonusCount}회가 충전됩니다.
                  </div>

                  {referralFeedback && (
                    <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                      referralFeedback.type === 'success' 
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                      {referralFeedback.type === 'success' ? <Check className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />}
                      <span>{referralFeedback.message}</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[#5A564F]">추천인(나)의 가입 이메일</label>
                    <input
                      type="email"
                      placeholder="본인 구글/가입 이메일 (예: user@gmail.com)"
                      value={referrerEmailInput}
                      onChange={(e) => setReferrerEmailInput(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#DDD8CE] rounded-xl text-xs text-[#2C2B29] outline-none focus:border-[#C46A40] focus:ring-1 focus:ring-[#C46A40]"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[#5A564F]">친구(상대방)의 가입 이메일</label>
                    <input
                      type="email"
                      placeholder="친구 구글/가입 이메일 (예: friend@gmail.com)"
                      value={friendEmailInput}
                      onChange={(e) => setFriendEmailInput(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#DDD8CE] rounded-xl text-xs text-[#2C2B29] outline-none focus:border-[#C46A40] focus:ring-1 focus:ring-[#C46A40]"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingReferral}
                    className="w-full py-2.5 bg-[#C46A40] hover:bg-[#B55434] text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSubmittingReferral ? '신청 처리 중...' : `친구 추천 혜택 (${referralBonusCount}회) 신청 제출`}</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AiCommentaryPanel;
