import { consumeAiCredit, canUseAi, getAiUsageState } from './aiUsageService';
import { BIBLE_LIST } from '../constants/bibleMeta';
import { getCommentaryFromHistory, saveCommentaryToHistory } from './aiHistoryService';
import { auth, db, functions } from '../api/firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import { doc, setDoc, updateDoc, increment, getDoc } from 'firebase/firestore';
import { consumeCreditInFirestore } from './userService';
import { trackAiCall, trackFirestoreWrite } from './systemMetricsService';

// 로컬 및 파이어베이스 Firestore 동시 1회 차감 헬퍼 함수
function deductCredit(refKey: string) {
  trackAiCall(1);
  consumeAiCredit(refKey);
  if (auth.currentUser) {
    consumeCreditInFirestore(auth.currentUser.uid, refKey).catch(err => {
      console.warn('[geminiCommentaryService] consumeCreditInFirestore failed:', err);
    });
  }
}

// 헬퍼: 조건 만족 시 클라우드 영구 저장
async function saveToCloudIfEligible(result: any, type: 'commentary' | 'word' | 'passage') {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const state = getAiUsageState();
  const limit = state.cloudCommentaryLimit || 0;
  
  if (limit <= 0) return; // 클라우드 이용권 없음
  
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    
    const profile = userSnap.data();
    const currentCount = profile.usedCloudCommentaryCount || 0;
    
    // 무제한(30000 이상)이 아닌 경우 한도 체크
    if (limit < 30000 && currentCount >= limit) {
      console.warn('[geminiCommentaryService] Cloud commentary limit reached.');
      return; 
    }
    
    let docId = '';
    if (type === 'commentary') {
      docId = result.reference.replace(/\//g, '_');
    } else {
      docId = result.id.replace(/\//g, '_');
    }
    
    const cloudRef = doc(db, 'users', uid, 'cloudCommentaries', docId);
    const existingSnap = await getDoc(cloudRef);
    
    await setDoc(cloudRef, {
      ...result,
      type,
      savedAt: Date.now()
    }, { merge: true });
    trackFirestoreWrite(1);
    
    // 기존에 저장된 적이 없는 문서라면 개수 증가
    if (!existingSnap.exists()) {
      await updateDoc(userRef, {
        usedCloudCommentaryCount: increment(1)
      });
      trackFirestoreWrite(1);
    }
  } catch (err) {
    console.error('[geminiCommentaryService] saveToCloudIfEligible failed:', err);
  }
}

// 원어 단어 분석 인터페이스
export interface OriginalWordAnalysis {
  wordOriginal: string;      // 히브리어/헬라어 원어 표기 (모음부호 포함)
  transliteration: string;   // 영어/한글 발음 동시 표기 (예: "kai / 카이")
  transliterationEn?: string; // 영어 로마자 발음 (예: "kai")
  transliterationKo?: string; // 한글 발음 (예: "카이")
  strongNumber: string;      // 스트롱 코드 (예: H7225, G3056)
  root: string;              // 어근 (Root 표제어, 예: γράφω, προσκόπτω)
  rootMeaning?: string;      // 어근의 기본형 원형 뜻 (본문 굴절 뜻이 아닌 사전 기본 뜻, 예: "기록하다", "부딪치다")
  rootBreakdown?: string;    // 합성어인 경우 어원 분해 (예: "πρός(~를 향해) + κόπτω(치다)")
  parsing: string;           // 정밀 문법 파싱 (품사, 시제, 격, 어간, 성/수 등)
  lexicalMeaning: string;    // 공인 사전(BDB, BDAG) 기반의 사전적 의미
  contextualMeaning: string; // 개역개정 문맥에서의 정확한 신학적·사전적 의미 해설
  koreanTranslation?: string; // <개역개정> 본문에서의 실제 번역 어휘/뜻 (독립 번역이 없으면 생략)
  scholarlyNote?: string;    // 학설 분분 / 불명확 사항 표기
}

// 3단계 AI 주석 결과 인터페이스
export interface AiCommentaryData {
  reference: string;         // 성경 구절 레퍼런스 (예: 창세기 1:1)
  scriptureText: string;     // 개역개정 본문
  testament: '구약' | '신약';

  // 1) 원어 주석
  originalLanguageCommentary: {
    language: '히브리어' | '헬라어' | '아람어';
    words: OriginalWordAnalysis[];
    syntacticSummary: string; // 문장 구조 및 전체 원어적 맥락 요약
  };

  // 2) 배경 설명
  historicalBackground: {
    eraAndCulture: string;       // 고대 근동(구약) 및 1세기 유대·로마 문화(신약)의 역사적 배경
    geographicalSocialContext: string; // 지리적, 문화적, 사회적 상황
    theologicalIntent: string;   // 당시 1차 수신자들을 향한 기록 목적 및 신학적 배경
  };

  // 3) 설교 인사이트
  sermonInsight: {
    coreMessage: string;         // 본문의 핵심 복음적 메시지
    sermonPoints: string[];      // 설교 작성 시 활용할 수 있는 핵심 포인트 (2~3개)
    meditationApplication: string; // 현대 그리스도인의 삶을 위한 구체적 적용점과 묵상
  };
}


// 구약/신약 판별 헬퍼 (구약: 1~39권, 신약: 40~66권)
export function isOldTestament(bookIdOrName: string | number): boolean {
  if (typeof bookIdOrName === 'number') {
    return bookIdOrName <= 39;
  }
  const str = String(bookIdOrName).trim();
  const num = parseInt(str, 10);
  if (!isNaN(num) && String(num) === str) {
    return num <= 39;
  }

  // BIBLE_LIST에서 인덱스로 정확히 판별 (0~38: 창세기~말라기 39권)
  const index = BIBLE_LIST.findIndex(b => 
    b.id.toUpperCase() === str.toUpperCase() || 
    b.name === str || 
    str.startsWith(b.name)
  );
  if (index !== -1) {
    return index < 39;
  }

  // 영문 3글자 약어 및 한글 이름 fallback
  const otCodes = [
    'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH',
    'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN',
    'HOS', 'JOE', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL',
    '창', '출', '레', '민', '신', '수', '삿', '룻', '삼상', '삼하', '왕상', '왕하', '대상', '대하', 
    '스', '느', '에', '욥', '시', '잠', '전', '아', '사', '렘', '애', '겔', '단', '호', '욜', '암', 
    '옵', '욘', '미', '나', '합', '습', '학', '슥', '말',
    '창세기', '출애굽기', '레위기', '민수기', '신명기', '여호수아', '사사기', '룻기',
    '사무엘상', '사무엘하', '열왕기상', '열왕기하', '역대상', '역대하', '에스라', '느헤미야', '에스더',
    '욥기', '시편', '잠언', '전도서', '아가', '이사야', '예레미야', '예레미야애가', '에스겔', '다니엘',
    '호세아', '요엘', '아모스', '오바댜', '요나', '미가', '나훔', '하박국', '스바냐', '학개', '스가랴', '말라기'
  ];
  return otCodes.includes(str.toUpperCase());
}

// 로컬 캐시/히스토리 조회 (10일 이내)
export function getCachedCommentary(reference: string): AiCommentaryData | null {
  return getCommentaryFromHistory(reference);
}

// 단어 데이터 정규화 헬퍼 (UI 호환성 100% 보장)
function normalizeWord(rawWord: any): OriginalWordAnalysis {
  const transliteration = String(rawWord.transliteration || '').trim();
  let transliterationEn = rawWord.transliterationEn || '';
  let transliterationKo = rawWord.transliterationKo || '';

  if (!transliterationEn || !transliterationKo) {
    if (transliteration.includes('/')) {
      const parts = transliteration.split('/');
      transliterationEn = transliterationEn || parts[0].trim();
      transliterationKo = transliterationKo || parts[1].trim();
    } else {
      transliterationKo = transliterationKo || transliteration;
    }
  }

  return {
    wordOriginal: String(rawWord.wordOriginal || '').trim(),
    transliteration,
    transliterationEn,
    transliterationKo,
    strongNumber: String(rawWord.strongNumber || '').trim(),
    root: String(rawWord.root || '').trim(),
    rootMeaning: String(rawWord.rootMeaning || rawWord.lexicalMeaning || '').trim(),
    rootBreakdown: String(rawWord.rootBreakdown || '').trim(),
    parsing: String(rawWord.parsing || '').trim(),
    lexicalMeaning: String(rawWord.lexicalMeaning || '').trim(),
    contextualMeaning: String(rawWord.contextualMeaning || rawWord.lexicalMeaning || '').trim(),
    koreanTranslation: String(rawWord.koreanTranslation || '').trim(),
    scholarlyNote: rawWord.scholarlyNote ? String(rawWord.scholarlyNote).trim() : undefined
  };
}

// --- 메인 주석 생성 함수 (병렬 2단계 분할 로딩 & 원어 전수 파싱) ---
export async function generateBibleAiCommentary(params: {
  bookName: string;
  bookId?: string | number;
  chapter: number;
  verse: number;
  scriptureText: string;
  forceRefresh?: boolean;
  onPartialResult?: (data: Partial<AiCommentaryData>) => void;
}): Promise<AiCommentaryData> {
  const { bookName, bookId = 1, chapter, verse, scriptureText, forceRefresh = false, onPartialResult } = params;
  const reference = `${bookName} ${chapter}:${verse}`;
  const testament = isOldTestament(bookId || bookName) ? '구약' : '신약';
  const originalLang = testament === '구약' ? '히브리어' : '헬라어';
  const originalSource = testament === '구약' ? '히브리어 BHS' : '헬라어 NA28/UBS5';

  // 1. 10일 이내의 기존 기록 확인 (강제 새로고침이 아닌 경우 무료로 즉시 반환)
  if (!forceRefresh) {
    const cached = getCommentaryFromHistory(reference);
    if (cached) {
      if (onPartialResult) onPartialResult(cached);
      return cached;
    }
  }

  // 2. 잔여 크레딧 확인
  if (!canUseAi()) {
    throw new Error('QUOTA_EXCEEDED');
  }

  // 3. Cloud Functions 중계 서버리스 함수 호출 (브라우저 네트워크 키 노출 원천 방지)
  try {
    const callGenerateBible = httpsCallable<any, any>(
      functions,
      'generateBibleContent'
    );

    const response = await callGenerateBible({
      actionType: 'verse_commentary',
      payload: {
        bookName,
        bookId,
        chapter,
        verse,
        scriptureText
      }
    });

    const data = response.data;
    const finalResult: AiCommentaryData = {
      reference,
      scriptureText,
      testament,
      originalLanguageCommentary: {
        language: data.originalLanguageCommentary?.language || originalLang,
        words: (data.originalLanguageCommentary?.words || []).map(normalizeWord),
        syntacticSummary: data.originalLanguageCommentary?.syntacticSummary || ''
      },
      historicalBackground: data.historicalBackground || {
        eraAndCulture: '',
        geographicalSocialContext: '',
        theologicalIntent: ''
      },
      sermonInsight: data.sermonInsight || {
        coreMessage: '',
        sermonPoints: [],
        meditationApplication: ''
      }
    };

    if (onPartialResult) {
      onPartialResult(finalResult);
    }

    // 4. 30일간 로컬 기기 보관소에 저장
    saveCommentaryToHistory(finalResult);

    // 5. 주석 클라우드 이용권이 있다면 영구 저장
    saveToCloudIfEligible(finalResult, 'commentary');

    // 6. 사용 횟수 1회 차감 (로컬 + Firestore DB 원자적 1회만 차감)
    deductCredit(reference);

    return finalResult;
  } catch (err: any) {
    console.error('[geminiCommentaryService] Functions Commentary generation failed:', err);
    throw err;
  }
}


// ========================================================
// 1. 단어 심층 연구 시스템 (어원변천사 · 빈도수 · 신구약 교차 대조 · 용례)
// ========================================================

export interface BiblicalUsageItem {
  reference: string;          // 성경 구절 (예: 창 1:1, 요 1:1, 롬 5:8)
  scriptureSnippet: string;   // 해당 성경 구절 본문 인용
  theologicalContext: string; // 해당 문맥에서의 의미 발전 및 핵심 메시지 (단락 끝 은혜로운 결말 포함)
}

// 신구약 교차 원어 대조 (히브리어 <-> 헬라어)
export interface CrossTestamentConnection {
  originalTerm: string;         // 본문 단어 (예: חֶסֶד [헤세드])
  targetLanguage: '신약 헬라어' | '구약 히브리어';
  equivalentTerm: string;       // 70인역(LXX) 및 신약/구약 대응 단어 (예: ἔλεος [엘레오스] / χάρις [카리스])
  strongNumber: string;         // 대응 스트롱 번호 (예: G1656 / G5485)
  explanation: string;          // 70인역(LXX)을 경유한 신구약 의미론적 전이 및 신학적 성취 해설 (끝부분 은혜로운 결말)
  crossUsages: {
    reference: string;
    scriptureSnippet: string;
    graceInsight: string;       // 은혜롭고 따뜻한 묵상 통찰
  }[];
}

export interface WordDeepStudyResult {
  id: string; // key: reference_strongNumber_etymology
  studyType: 'etymology';
  reference: string;
  strongNumber: string;
  wordOriginal: string;
  root: string;
  createdAt: number;
  expiresAt: number; // 30일 보관

  // 1) 성경 전체 출현 빈도수
  totalOccurrences: string;            // 성경 전체 총 출현 횟수 및 책별/장르별 분포 (예: "성경 전체 총 248회 출현 (모세오경 32회, 역사서 41회, 시편 127회 집중, 예언서 48회)")
  
  // 2) 고대 어원 기원 및 역사적 변천사 (단락 끝부분 은혜로운 결말)
  etymologyGenesis: string;
  
  // 3) 신구약 교차 원어 대조 (히브리어면 신약 헬라어 대응, 헬라어면 구약 히브리어 대응)
  crossTestamentConnection: CrossTestamentConnection;

  // 4) 성경 전체를 관통하는 핵심 용례 3~4선 (각 단락 끝부분 은혜로운 결말)
  biblicalUsages: BiblicalUsageItem[];

  // 5) 유사 동의어 대조 및 독보적 뉘앙스 (단락 끝부분 은혜로운 결말)
  synonymNuance: string;

  // 6) 단어 연구를 매듭짓는 은혜롭고 따뜻한 결말 묵상
  gracefulConclusion: string;
}

const WORD_DEEP_STUDY_STORAGE_KEY = 'nations_word_deep_studies_v2';
const PASSAGE_THEOLOGY_STORAGE_KEY = 'nations_passage_theology_studies_v1';
const RETENTION_30_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// 로컬 저장소에서 단어 심층 연구 캐시 조회 (30일 유효)
export function getWordDeepStudyFromStorage(
  reference: string,
  strongNumber: string
): WordDeepStudyResult | null {
  try {
    const raw = localStorage.getItem(WORD_DEEP_STUDY_STORAGE_KEY);
    if (!raw) return null;
    const list: WordDeepStudyResult[] = JSON.parse(raw);
    const key = `${reference.trim()}_${strongNumber.trim()}_etymology`;
    const now = Date.now();
    const item = list.find(i => i.id === key);
    if (item && item.expiresAt > now) {
      return item;
    }
    return null;
  } catch (err) {
    console.error('Failed to get word deep study cache:', err);
    return null;
  }
}

// 로컬 저장소에 단어 심층 연구 저장 (30일 보관)
export function saveWordDeepStudyToStorage(result: WordDeepStudyResult): void {
  try {
    const raw = localStorage.getItem(WORD_DEEP_STUDY_STORAGE_KEY);
    const list: WordDeepStudyResult[] = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    const filtered = list.filter(i => i.expiresAt > now && i.id !== result.id);
    filtered.push(result);
    localStorage.setItem(WORD_DEEP_STUDY_STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to save word deep study cache:', err);
  }
}

// --- 메인 단어 심층 연구 생성 함수 (단어별 1회 차감) ---
export async function generateWordDeepStudy(params: {
  reference: string;
  scriptureText: string;
  word: OriginalWordAnalysis;
}): Promise<WordDeepStudyResult> {
  const { reference, scriptureText, word } = params;
  const key = `${reference.trim()}_${word.strongNumber.trim()}_etymology`;

  // 1. 기존 30일 보관 캐시 확인 (있으면 횟수 차감 없이 즉시 반환)
  const cached = getWordDeepStudyFromStorage(reference, word.strongNumber);
  if (cached) {
    return cached;
  }

  // 2. 크레딧 확인
  if (!canUseAi()) {
    throw new Error('QUOTA_EXCEEDED');
  }

  // 3. Cloud Functions 중계 호출
  try {
    const callGenerateBible = httpsCallable<any, any>(
      functions,
      'generateBibleContent'
    );

    const response = await callGenerateBible({
      actionType: 'word_deep_study',
      payload: {
        reference,
        scriptureText,
        word
      }
    });

    const parsed = response.data;
    const now = Date.now();
    const result: WordDeepStudyResult = {
      id: key,
      studyType: 'etymology',
      reference,
      strongNumber: word.strongNumber,
      wordOriginal: word.wordOriginal,
      root: word.root,
      createdAt: now,
      expiresAt: now + RETENTION_30_DAYS_MS,
      ...parsed
    };

    // 30일간 로컬 기기 보관소에 저장
    saveWordDeepStudyToStorage(result);

    // 클라우드 영구 저장 시도
    saveToCloudIfEligible(result, 'word');

    // 크레딧 1회 차감 (로컬 + Firestore DB 원자적 차감)
    deductCredit(`${reference}_${word.strongNumber}_etymology`);

    return result;
  } catch (err) {
    console.error('Failed to generate word deep study via Functions:', err);
    throw err;
  }
}

// ========================================================
// 2. 구절 신학 심층 연구 시스템 (구절 단위 · 상단 원문 카드 하단 배치)
//    - 교의학(Dogmatics)
//    - 구속사(Redemptive History)
//    - 개혁신학(Reformed Perspective)
//    - 하나님 나라와 복음(Kingdom & Gospel)
//    - 각 단락 끝부분은 항상 은혜롭고 따뜻하게 결말맺음
// ========================================================

export interface TheologyTopicSection {
  title: string;
  theologicalContent: string;  // 학문적이고 심도 있는 신학 주해
  gracefulEnding: string;      // 성도의 영혼을 적시는 따뜻하고 은혜로운 결말
}

export interface PassageTheologicalStudyResult {
  id: string; // key: reference_passage_theology
  reference: string;
  scriptureText: string;
  testament: '구약' | '신약';
  createdAt: number;
  expiresAt: number; // 30일 보관

  interpretationAndSignificance?: string;     // 0. [해석과 의미] - 성경신학적 깊은 해석과 설교 준비를 위한 핵심 의미
  dogmaticTheology: TheologyTopicSection;     // 1. 교의학적 심층 연구 (삼위일체, 기독론, 구원론 등)
  redemptiveHistory: TheologyTopicSection;    // 2. 구속사적 심층 연구 (창조-타락-구속-그리스도 안에서의 성취)
  reformedPerspective: TheologyTopicSection;  // 3. 개혁신학적 심층 연구 (하나님의 절대 주권, 은혜의 언약)
  kingdomAndGospel: TheologyTopicSection;     // 4. 하나님 나라와 복음의 심층 연구 (이미와 아직, 급진적 은혜)
  pastoralGraceSummary: string;               // 구절 전체를 아우르는 최종 목양적 은혜 결언
}

// 로컬 저장소에서 구절 신학 심층 연구 캐시 조회 (30일 유효)
export function getPassageTheologicalStudyFromStorage(
  reference: string
): PassageTheologicalStudyResult | null {
  try {
    const raw = localStorage.getItem(PASSAGE_THEOLOGY_STORAGE_KEY);
    if (!raw) return null;
    const list: PassageTheologicalStudyResult[] = JSON.parse(raw);
    const key = `${reference.trim()}_passage_theology`;
    const now = Date.now();
    const item = list.find(i => i.id === key);
    if (item && item.expiresAt > now) {
      return item;
    }
    return null;
  } catch (err) {
    console.error('Failed to get passage theology study cache:', err);
    return null;
  }
}

// 로컬 저장소에 구절 신학 심층 연구 저장 (30일 보관)
export function savePassageTheologicalStudyToStorage(result: PassageTheologicalStudyResult): void {
  try {
    const raw = localStorage.getItem(PASSAGE_THEOLOGY_STORAGE_KEY);
    const list: PassageTheologicalStudyResult[] = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    const filtered = list.filter(i => i.expiresAt > now && i.id !== result.id);
    filtered.push(result);
    localStorage.setItem(PASSAGE_THEOLOGY_STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to save passage theology study cache:', err);
  }
}

// --- 메인 구절 신학 심층 연구 생성 함수 (구절별 1회 차감) ---
export async function generatePassageTheologicalStudy(params: {
  reference: string;
  scriptureText: string;
  testament?: '구약' | '신약';
  bookName?: string;
}): Promise<PassageTheologicalStudyResult> {
  const { reference, scriptureText, bookName = '' } = params;
  const key = `${reference.trim()}_passage_theology`;
  const testament = params.testament || (isOldTestament(bookName || reference) ? '구약' : '신약');

  // 1. 기존 30일 보관 캐시 확인 (있으면 횟수 차감 없이 즉시 반환)
  const cached = getPassageTheologicalStudyFromStorage(reference);
  if (cached) {
    return cached;
  }

  // 2. 크레딧 확인
  if (!canUseAi()) {
    throw new Error('QUOTA_EXCEEDED');
  }

  // 3. Cloud Functions 중계 호출
  try {
    const callGenerateBible = httpsCallable<any, any>(
      functions,
      'generateBibleContent'
    );

    const response = await callGenerateBible({
      actionType: 'passage_theology',
      payload: {
        reference,
        scriptureText,
        testament
      }
    });

    const parsed = response.data;
    const now = Date.now();
    const result: PassageTheologicalStudyResult = {
      id: key,
      reference,
      scriptureText,
      testament,
      createdAt: now,
      expiresAt: now + RETENTION_30_DAYS_MS,
      ...parsed
    };

    // 30일간 로컬 기기 보관소에 저장
    savePassageTheologicalStudyToStorage(result);

    // 클라우드 영구 저장 시도
    saveToCloudIfEligible(result, 'passage');

    // 크레딧 1회 차감 (로컬 + Firestore DB 원자적 차감)
    deductCredit(`${reference}_passage_theology`);

    return result;
  } catch (err) {
    console.error('Failed to generate passage theology study via Functions:', err);
    throw err;
  }
}

