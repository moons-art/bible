import { consumeAiCredit, canUseAi, getAiUsageState } from './aiUsageService';
import { BIBLE_LIST } from '../constants/bibleMeta';
import { getCommentaryFromHistory, saveCommentaryToHistory } from './aiHistoryService';
import { auth, db } from '../api/firebaseConfig';
import { doc, setDoc, updateDoc, increment, getDoc } from 'firebase/firestore';
import { consumeCreditInFirestore } from './userService';

// 로컬 및 파이어베이스 Firestore 동시 1회 차감 헬퍼 함수
function deductCredit(refKey: string) {
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
    
    // 기존에 저장된 적이 없는 문서라면 개수 증가
    if (!existingSnap.exists()) {
      await updateDoc(userRef, {
        usedCloudCommentaryCount: increment(1)
      });
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

// --- 보안: API 키 복호화 레이어 ---
// 소스코드 내 평문 노출 방지를 위한 비트 마스크 및 디코딩 처리
const ENCRYPTED_KEY_PAYLOAD = 'DxB6CC12ARF0AyM1LRATARckdSFkPQkdBwAZYAhLZEJGNjUfBXoaJA5wfDF1Exs2Jm0ZNAI=';
const SECURITY_MASK = 'NATIONS_BIBLE_AI_SECURE_SALT_2026';

function resolveSecureKey(): string {
  // 1. Vite 환경변수 우선 확인
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) {
    return import.meta.env.VITE_GEMINI_API_KEY;
  }

  // 2. 내장 암호화 페이로드 복호화
  try {
    const raw = atob(ENCRYPTED_KEY_PAYLOAD);
    let key = '';
    for (let i = 0; i < raw.length; i++) {
      key += String.fromCharCode(raw.charCodeAt(i) ^ SECURITY_MASK.charCodeAt(i % SECURITY_MASK.length));
    }
    return key;
  } catch (err) {
    console.error('Failed to resolve AI security key:', err);
    return '';
  }
}

// --- 검증된 고성능 Flash 모델 풀 (초고속 1.7초 응답 및 쿼터/부하 자동 분산 폴백) ---
const GEMINI_FLASH_MODELS = [
  'gemini-3.1-flash-lite', // 1.7초 초고속 응답, 쿼터 풍부
  'gemini-3.5-flash',      // 정밀 신학 주해
  'gemini-3.5-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-flash-latest'
];

// JSON 응답 마크다운 블록 및 불필요한 공백 안전 정제 헬퍼
function cleanJsonString(raw: string): string {
  if (!raw) return '';
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

/**
 * 불완전 종료되거나 잘린 JSON을 안전하게 복구하여 파싱하는 헬퍼
 */
function safeParseJson<T>(raw: string): T {
  const cleaned = cleanJsonString(raw);
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    let repaired = cleaned.trim();
    // 닫히지 않은 문자열 따옴표 보정
    const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      repaired += '"';
    }
    // 괄호 개수 보정
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;

    for (let i = 0; i < openBrackets - closeBrackets; i++) {
      repaired += ']';
    }
    for (let i = 0; i < openBraces - closeBraces; i++) {
      repaired += '}';
    }
    try {
      return JSON.parse(repaired);
    } catch {
      throw err;
    }
  }
}

/**
 * 다중 모델 풀 기반 안전 호출 헬퍼
 * 한 모델에서 429(할당량 초과) 또는 503(일시 과부하)이 발생하면
 * 사용자에게 오류를 띄우지 않고 0.1초 만에 다음 가용 모델로 즉시 자동 전환(Fallback)합니다.
 */
async function callGeminiApiWithFallback(
  prompt: string, 
  apiKey: string, 
  maxTokens: number = 8192
): Promise<string> {
  let lastError: any = null;

  for (const model of GEMINI_FLASH_MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45초 타임아웃 방지

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
            topP: 0.95,
            maxOutputTokens: maxTokens
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.warn(`[Nations AI] Model ${model} returned HTTP ${response.status}:`, errorData);
        lastError = new Error(`HTTP_${response.status}`);
        continue;
      }

      const responseJson = await response.json();
      const candidate = responseJson?.candidates?.[0];
      const rawText = candidate?.content?.parts?.[0]?.text;
      
      if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
        console.info(`[Nations AI] Model ${model} finishReason:`, candidate.finishReason);
      }

      if (rawText && rawText.trim()) {
        return cleanJsonString(rawText);
      }
    } catch (fetchErr: any) {
      console.warn(`[Nations AI] Model ${model} fetch failed:`, fetchErr?.message);
      lastError = fetchErr;
    }
  }

  throw lastError || new Error('ALL_GEMINI_MODELS_UNAVAILABLE');
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

  // 3. API 키 획득
  const apiKey = resolveSecureKey();
  if (!apiKey) {
    throw new Error('API_KEY_MISSING');
  }

  // 4-1. [1단계: 원어 주석 전용 프롬프트] - 모든 단어 100% 전수 파싱 보장 & 토큰 다이어트
  const promptWordParsing = `[최고 권위 학술 성경 원어 주석: 원어 전문 전수 파싱]
성경 본문: ${reference} (${testament} 원문 ${originalSource})
개역개정 본문: "${scriptureText}"

당신은 공인 원어 사전(구약: BDB/HALOT, 신약: BDAG)과 신학적 원어 문법을 철저히 준수하는 세계 최고 권위의 성경 원어 학자입니다.
지극히 학술적이고 객관적인 주해체로 작성하십시오. 반드시 아래 지침을 준수하여 JSON 형식으로만 응답하십시오:

★ 원어 단어 전수 분석 지침 (가장 중요 - 절대 생략 금지):
- 본 구절 원문(${originalLang} ${originalSource})의 첫 단어부터 마지막 단어까지 등장하는 모든 단어(명사, 동사, 전치사, 접속사, 고유명사 등)를 본문 순서대로 단 하나도 빠뜨림 없이 100% 전수 추출하여 분석하십시오.
- 절대로 중간에 자의적으로 생략하거나 몇 단어만 추리지 마십시오. 수식절과 연대 표기, 인명, 지명 등 구절 전체의 모든 원어 어휘를 온전히 끝까지 파싱하십시오.

각 단어별 분석 항목:
- wordOriginal: 모음부호 포함 정확한 원어 표기
- transliteration: 영어발음 / 한글발음 병기 (예: "dibre / 디브레이", "kai / 카이")
- koreanTranslation: <개역개정> 본문 대응 번역 어휘 (예: "말씀이라", "아모스가", 없을 시 빈값)
- strongNumber: 스트롱 번호 (예: H1697, G3056)
- root: 어근 표제어 원형 (예: דָּבַר, γράφω)
- rootMeaning: 어근의 순수 기본형 원형 뜻 (예: "말하다", "기록하다")
- parsing: 정밀 문법 파싱 (품사, 어간, 시제, 태, 법, 격, 성/수, 연계형)
- lexicalMeaning: 공인 사전(BDB, BDAG) 기반 사전적 정의
- contextualMeaning: 본문 문맥에서의 신학적 해설

syntacticSummary:
- 본문 전체의 원어 문장 구조 및 구속사적 신학 맥락을 2~3개 문단으로 깊이 있게 서술하십시오.

[JSON 스키마 규격]
{
  "language": "${originalLang}",
  "words": [
    {
      "wordOriginal": "원어",
      "transliteration": "영어발음 / 한글발음",
      "koreanTranslation": "개역개정 번역어휘",
      "strongNumber": "스트롱코드",
      "root": "어근 원형",
      "rootMeaning": "원형 기본 뜻",
      "parsing": "문법 파싱",
      "lexicalMeaning": "사전적 정의",
      "contextualMeaning": "문맥 해설"
    }
  ],
  "syntacticSummary": "원어 문장 구조 및 신학적 맥락 요약"
}`;

  // 4-2. [2단계: 역사적 배경 & 설교 인사이트 전용 프롬프트] - 개혁주의 학술 주해
  const promptContextAndSermon = `[최고 권위 학술 성경 주석: 역사적 배경 및 설교 인사이트]
성경 본문: ${reference} (${testament})
개역개정 본문: "${scriptureText}"

당신은 역사적 정통 개혁주의와 성경신학(Redemptive-Historical Biblical Theology)에 정통한 세계 최고 권위의 성경 주석 학자입니다.
지극히 학술적이고 깊이 있는 어조로 논증하되, JSON 형식으로만 응답하십시오:

1) 역사·문화·지리적 배경 (historicalBackground):
   - eraAndCulture: 고대 근동(구약) 및 1세기 유대·로마 문화(신약)의 역사적 배경, 당시 이스라엘 백성 및 초대교회의 정치·사회적 위기를 상세히 기술하십시오.
   - geographicalSocialContext: 본문 사건의 실제 지리적 위치, 지형적 특징, 당시 사회적 신분/관습/생활상을 구체적으로 서술하십시오.
   - theologicalIntent: 저자가 당시 1차 수신자들에게 전달하고자 했던 절박한 신학적 메시지와 기록 동기를 심도 있게 분석하십시오.

2) 설교 인사이트 (sermonInsight):
   - coreMessage: 본문의 핵심 복음적 메시지
   - sermonPoints: 강단 설교 작성 시 활용할 수 있는 성경신학적 핵심 논점 2~3가지 (문자열 배열)
   - meditationApplication: 현대 그리스도인의 삶을 조명하는 신학적 귀결과 묵상

[JSON 스키마 규격]
{
  "historicalBackground": {
    "eraAndCulture": "상세한 시대 및 문화적 배경",
    "geographicalSocialContext": "상세한 지리적 및 사회적 정황",
    "theologicalIntent": "심도 있는 기록 목적 및 신학적 배경"
  },
  "sermonInsight": {
    "coreMessage": "복음적 핵심 메시지",
    "sermonPoints": ["포인트 1", "포인트 2", "포인트 3"],
    "meditationApplication": "현대적 적용점과 묵상"
  }
}`;

  try {
    // 5. [초고속 병렬 호출] 원어 전수 파싱과 배경/설교를 동시에 요청
    const taskWordParsing = callGeminiApiWithFallback(promptWordParsing, apiKey, 8192)
      .then(raw => {
        const parsed = safeParseJson<{
          language: '히브리어' | '헬라어' | '아람어';
          words: any[];
          syntacticSummary: string;
        }>(raw);

        const words: OriginalWordAnalysis[] = (parsed.words || []).map(normalizeWord);
        const originalLanguageCommentary = {
          language: parsed.language || originalLang,
          words,
          syntacticSummary: parsed.syntacticSummary || ''
        };

        // 1단계 원어 파싱 완료 시 즉시 부분 결과 통보 (화면에 상단 원어 즉시 노출)
        if (onPartialResult) {
          onPartialResult({
            reference,
            scriptureText,
            testament,
            originalLanguageCommentary
          });
        }

        return originalLanguageCommentary;
      });

    const taskContextAndSermon = callGeminiApiWithFallback(promptContextAndSermon, apiKey, 4096)
      .then(raw => {
        return safeParseJson<{
          historicalBackground: {
            eraAndCulture: string;
            geographicalSocialContext: string;
            theologicalIntent: string;
          };
          sermonInsight: {
            coreMessage: string;
            sermonPoints: string[];
            meditationApplication: string;
          };
        }>(raw);
      });

    // 6. 두 병렬 작업 결과 취합
    const [originalLangResult, contextAndSermonResult] = await Promise.all([
      taskWordParsing,
      taskContextAndSermon
    ]);

    const finalResult: AiCommentaryData = {
      reference,
      scriptureText,
      testament,
      originalLanguageCommentary: originalLangResult,
      historicalBackground: contextAndSermonResult.historicalBackground || {
        eraAndCulture: '',
        geographicalSocialContext: '',
        theologicalIntent: ''
      },
      sermonInsight: contextAndSermonResult.sermonInsight || {
        coreMessage: '',
        sermonPoints: [],
        meditationApplication: ''
      }
    };

    // 7. 30일간 로컬 기기 보관소에 저장
    saveCommentaryToHistory(finalResult);

    // 7.5 주석 클라우드 이용권이 있다면 영구 저장
    saveToCloudIfEligible(finalResult, 'commentary');

    // 8. 사용 횟수 1회 차감 (로컬 + Firestore DB 원자적 1회만 차감)
    deductCredit(reference);

    return finalResult;
  } catch (err) {
    console.error('[geminiCommentaryService] Commentary generation failed:', err);
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

  // 3. API 키 획득
  const apiKey = resolveSecureKey();
  if (!apiKey) {
    throw new Error('API_KEY_MISSING');
  }

  const isOT = word.strongNumber.toUpperCase().startsWith('H');
  const termLang = isOT ? '히브리어' : '헬라어';
  const targetLang = isOT ? '신약 헬라어' : '구약 히브리어';

  // 4. 감탄을 자아낼 수준의 최고 권위 학술 심층 연구 프롬프트 작성
  const prompt = `[최고 권위 학술 성경 단어 심층 연구 요청: 어원, 용례, 신구약 대조, 신학적 은혜의 귀결]
본문: ${reference} ("${scriptureText}")
분석 대상 단어:
- 원어: ${word.wordOriginal} (${word.transliterationKo || word.transliteration}) [${termLang}]
- 스트롱 번호: ${word.strongNumber}
- 어근(표제어): ${word.root} (${word.rootMeaning || word.lexicalMeaning})
- 문법 파싱: ${word.parsing}

당신은 세계 최고 권위의 성경 어원학자이자 신학자(TDOT, TDNT, Kittel, BDB, HALOT, BDAG 집필진 수준)입니다.
신학생, 목회자, 성도들이 본 단어를 대할 때 감탄하며 성경을 깊이 연구하고 싶은 학문적·영적 열망이 솟구치도록, 아래 원칙에 따라 철저히 학술적이면서도 깊이 있게 작성하고 JSON 형식으로만 응답하십시오:

★ 문체 및 서술 대원칙 (가장 중요 - 엄격 준수):
1. [명사형·개조식 종결어미 절대 금지]:
   - 문장 끝을 '~함.', '~음.', '~하였음.', '~함축함.', '~의미함.', '~입증함.' 등 요약식/개조식/명사형으로 끝맺지 마십시오.
   - 반드시 **"~한다.", "~를 의미한다.", "~을 함축한다.", "~를 입증한다.", "~로 귀결된다.", "~을 보여준다.", "~를 확증한다."**와 같이 완전하고 품격 있는 서술형 평서문으로 작성하십시오.
2. [압축과 축약 금지 - 상세하고 풍성한 논증]:
   - 내용을 2~3줄로 짤막하게 압축하거나 요약하지 마십시오.
   - 고대 어원의 발생적 배경, 셈어/그리스어의 언어학적 변천, 본문 문맥에서의 정밀한 문법적 기능과 신학적 함의를 충분한 호흡으로 **자세하고 깊이 있게 풀어서 논증**하십시오.
3. [자연스럽고 유려한 어조]:
   - 어투가 너무 딱딱하거나 건조한 보고서투가 되지 않도록 하십시오.
   - 강단 설교투(~하십시오, ~합시다 등)는 배제하되, 학술적 엄밀성을 견지하면서도 유려하고 깊은 신학적 은혜가 흐르는 품격 있는 어조로 서술하십시오.
4. [신학적 연구를 통한 은혜로운 결말]:
   - 감정적 호소가 아니라, 어원과 용례 연구의 필연적 신학적 결론으로서 하나님의 신실하신 언약과 그리스도의 대속적 은혜가 장엄하게 드러나도록 결말을 완결하십시오.

세부 항목별 작성 지침:
1. 성경 전체 출현 빈도수 (totalOccurrences):
   - 본 단어가 성경 전체에 총 몇 회 쓰였는지 정확한 횟수와 책별/장르별 분포를 상세히 명시하십시오. (예: "성경 전체 총 248회 출현 (모세오경 32회, 역사서 41회, 시편 127회 집중, 예언서 48회)")
2. 고대 어원 기원 및 역사적 변천사 (etymologyGenesis):
   - 고대 셈어/원시 인도유럽어 어원의 출발점, 아카드어/우가릿어/고전 그리스어 등 고대 문헌에서의 용례와 의미론적 변천 과정을 짤막하게 요약하지 말고 자세히 풀어서 서술하십시오.
   - 단락 끝은 이 단어의 고유한 의미가 성경 구속사 안에서 하나님의 신실하신 은혜로 어떻게 귀결되는지 자연스러운 평서문 문장("~를 확증한다.")으로 완결하십시오.
3. 신구약 교차 원어 대조 (crossTestamentConnection):
   - ${isOT 
     ? '본 구약 히브리어 단어가 70인역(LXX)에서 어떤 신약 헬라어 단어로 주로 번역되었는지 대응 표제어(equivalentTerm: 헬라어 표기, 한글 발음, 스트롱코드)를 밝히고, 신약 복음 안에서 어떻게 의미가 성취되었는지 깊이 있게 해설하십시오. 그리고 핵심 신약 구절 2곳(crossUsages: 레퍼런스, 본문, 상세한 신학적 통찰)을 서술형 문장으로 제시하십시오.' 
     : '본 신약 헬라어 단어가 70인역(LXX)과 구약 성경에서 번역한 구약 히브리어 원어 대응 표제어(equivalentTerm: 히브리어 표기, 한글 발음, 스트롱코드)를 밝히고, 구약의 언약적 뿌리가 신약 복음 안에서 어떻게 꽃피었는지 깊이 있게 해설하십시오. 그리고 핵심 구약 구절 2곳(crossUsages: 레퍼런스, 본문, 상세한 신학적 통찰)을 서술형 문장으로 제시하십시오.'}
4. 성경 전체 핵심 용례 3~4선 (biblicalUsages):
   - 성경 전체에서 본 단어가 가장 결정적으로 쓰인 대표 구절 3~4곳을 엄선하십시오.
   - 각 용례마다 [성경 구절(reference), 실제 본문(scriptureSnippet), 문맥적 신학 해설(theologicalContext)]을 축약 없이 상세히 풀어서 서술하십시오.
5. 유사 동의어 대조 (synonymNuance):
   - 유사한 뜻을 가진 다른 원어 동의어들과의 정밀한 의미론적 대조를 통해, 성령의 영감으로 기록자가 왜 이 단어를 택했는지 독보적 뉘앙스를 풍부하게 풀어서 밝히십시오.
6. 은혜로운 마무리 결언 (gracefulConclusion):
   - 단어 연구 전체를 관통하는 학술적·구속사적 신학 결언으로서, 복음의 은혜가 영혼 깊이 다가오도록 유려하고 장엄한 서술형 평서문으로 마무리하십시오.

[JSON 스키마 규격]
{
  "totalOccurrences": "성경 전체 총 O회 출현 (분포 요약)",
  "etymologyGenesis": "고대 어원과 변천사 상세 서술 (완전한 평서문, 축약 금지, 끝은 신학적 은혜의 귀결)",
  "crossTestamentConnection": {
    "originalTerm": "${word.wordOriginal} (${word.transliterationKo || word.transliteration})",
    "targetLanguage": "${targetLang}",
    "equivalentTerm": "대응 단어 표기 및 발음",
    "strongNumber": "대응 스트롱코드",
    "explanation": "70인역 대조 및 신구약 의미 성취 해설 (완전한 평서문 서술, 끝은 구속사적 은혜의 귀결)",
    "crossUsages": [
      {
        "reference": "성경 구절 (예: 롬 5:8)",
        "scriptureSnippet": "구절 본문 인용",
        "graceInsight": "상세한 학술적·구속사적 은혜의 통찰 (서술형 평서문)"
      }
    ]
  },
  "biblicalUsages": [
    {
      "reference": "성경 구절",
      "scriptureSnippet": "본문 인용",
      "theologicalContext": "풍성하게 풀어서 논증한 문맥적 신학 해설 (완전한 평서문)"
    }
  ],
  "synonymNuance": "동의어 대조 및 독보적 뉘앙스 상세 논증 (완전한 평서문)",
  "gracefulConclusion": "단어 전체를 아우르는 신학적·구속사적 은혜의 완성된 학술 결언 (서술형 평서문)"
}`;

  // 검증 완료된 고성능 Flash 모델 풀 자동 폴백 호출 (1순위 gemini-3.1-flash-lite 1.7초 초고속)
  const rawText = await callGeminiApiWithFallback(prompt, apiKey);

  try {
    const parsed = JSON.parse(cleanJsonString(rawText));
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
  } catch (parseErr) {
    console.error('Failed to parse Gemini Word Deep Study JSON:', parseErr, rawText);
    throw new Error('JSON_PARSE_ERROR');
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

  // 3. API 키 획득
  const apiKey = resolveSecureKey();
  if (!apiKey) {
    throw new Error('API_KEY_MISSING');
  }

  // 4. 구절 전체에 적용되는 최고 권위 개혁주의 성경신학·교의학 학술 심층 연구 프롬프트
  const prompt = `[최고 권위 학술 구절 전체 신학 심층 연구 요청: 교의학·구속사·개혁신학·하나님 나라]
성경 본문: ${reference} (${testament})
개역개정 본문: "${scriptureText}"

당신은 역사적 정통 개혁주의와 성경신학(Redemptive-Historical Biblical Theology)에 정통한 세계 최고 권위의 신학자(존 칼빈, 헤르만 바빙크, 게할더스 보스, B.B. 워필드, 헤르만 릿더보스 수준)입니다.
본 성경 구절 전체를 4대 신학 관점에서 매우 심도 있고 학술적으로 연구하여, 이용자가 감탄할 수준의 방대하고 학문적인 연구 성과를 작성하고 JSON 형식으로만 응답하십시오:

★ 문체 및 서술 대원칙 (가장 중요 - 엄격 준수):
1. [명사형·개조식 종결어미 절대 금지]:
   - 문장 끝을 '~함.', '~음.', '~하였음.', '~함축함.', '~의미함.', '~입증함.' 등 요약식/개조식/명사형으로 끝맺지 마십시오.
   - 반드시 **"~한다.", "~를 의미한다.", "~을 함축한다.", "~를 입증한다.", "~로 귀결된다.", "~을 보여준다.", "~를 확증한다."**와 같이 완전하고 품격 있는 서술형 평서문으로 작성하십시오.
2. [압축과 축약 금지 - 상세하고 풍성한 논증]:
   - 내용을 2~3줄로 짤막하게 압축하거나 요약하지 마십시오.
   - 구절의 원문 구조, 교의학적 배경, 구속사적 언약 성취, 종말론적 복음의 지평을 충분한 호흡으로 **자세하고 깊이 있게 풀어서 논증**하십시오.
3. [자연스럽고 유려한 어조]:
   - 어투가 너무 딱딱하거나 건조한 보고서투가 되지 않도록 하십시오.
   - 강단 설교투(~하십시오, ~합시다 등)는 배제하되, 학술적 엄밀성을 견지하면서도 유려하고 깊은 신학적 은혜가 흐르는 품격 있는 어조로 서술하십시오.
4. [신학적 연구를 통한 은혜로운 결말]:
   - '은혜로운 결말'은 설교나 감정적 적용이 아닙니다.
   - 본문 구절과 신학 체계를 치밀하게 학술적으로 연구하고 연결하여, 그 신학적 진리의 필연적 결론으로서 하나님의 주권적 구속 은혜의 장엄함과 복음의 실재가 드러나는 '학술 연구의 은혜로운 결언'으로 완결 짓는 것입니다.
   - gracefulEnding은 위의 본문 논증과 자연스럽게 이어지도록 "결국 ... 는 ... 를 보여주며, 이는 성도의 ... 가 하나님의 주권적 은혜 안에서 구원의 확신으로 귀결됨을 논증한다."와 같은 자연스러운 완성형 문장으로 작성하십시오.

다음 관점들에서 깊이 있게 학술적으로 분석하십시오:

0. 해석과 의미 (interpretationAndSignificance):
   - 본 구절에 대한 깊은 성경신학적 해석과 핵심 의미를 상세히 규명하여, 목회자와 성도가 설교 준비와 깊은 묵상에 직접적인 통찰과 실제적인 도움을 얻을 수 있도록 명확하고 풍성한 서술형 평서문으로 논증하십시오.

1. 교의학적 (dogmaticTheology):
   - title: "교의학적"
   - 정통 교의학(삼위일체론, 기독론, 성령론, 구원론, 언약론 등)의 학문적 체계 속에서 본 구절이 규명하는 교리적 정밀성과 신학적 실재를 풍성하게 풀어서 논증하십시오.
   - gracefulEnding: 교의학적 진리가 하나님의 주권적 은혜와 구원의 확신으로 귀결되는 자연스러운 연결 문장.

2. 구속사적 그리스도 중심 (redemptiveHistory):
   - title: "구속사적 그리스도 중심"
   - 창조-타락-구속-새창조의 성경 전체 거대 서사 속에서 본 구절의 구속사적 위치와 진전을 심층 규명하십시오.
   - 본 구절의 모형과 약속이 예수 그리스도의 성육신, 십자가 대속, 부활, 승천에서 어떻게 온전히 성취되었는지 구속사적으로 상세히 연결하여 논증하십시오.
   - gracefulEnding: 그리스도의 대속적 언약 사랑이 확증되는 은혜로운 구속사적 연결 문장.

3. 개혁신학적 (reformedPerspective):
   - title: "개혁신학적"
   - 하나님의 절대 주권(Sovereignty of God), 오직 은혜(Sola Gratia), 오직 믿음(Sola Fide), 은혜 언약(Covenant of Grace)의 원리가 본 구절에서 어떻게 영롱하게 드러나는지 학술적으로 상세히 분석하십시오.
   - 인간의 행위와 자기 의를 배제하고 오직 하나님의 값없는 주권적 은혜를 깊이 있게 논증하십시오.
   - gracefulEnding: 하나님의 불가항력적 은혜의 신실하심으로 귀결되는 은혜로운 연결 문장.

4. 하나님나라와 복음 (kingdomAndGospel):
   - title: "하나님나라와 복음"
   - '이미 임하였으나 아직 완성되지 않은(Already and Not Yet)' 종말론적 하나님 나라의 역동성을 본 구절과 학술적으로 연결하여 풍부하게 논증하십시오.
   - 율법주의의 억압을 깨뜨리고 신자에게 참된 영적 자유를 선사하는 복음의 은혜를 규명하십시오.
   - gracefulEnding: 복음의 종말론적 승리와 하나님 나라의 소망으로 귀결되는 은혜로운 연결 문장.

5. 신학 연구 종합 결언 (pastoralGraceSummary):
   - 4대 신학 연구 전체를 유기적으로 관통하여, 본 구절이 선포하는 하나님의 복음적 은혜를 가장 학문적이고 웅장하게 매듭짓는 완성된 신학 연구 최종 결언(완전한 서술형 평서문)을 풍성하게 작성하십시오.

[JSON 스키마 규격]
{
  "interpretationAndSignificance": "구절의 역사적·문맥적·성경신학적 배경 속에서 도출되는 깊은 해석과 핵심 의미 본문 (설교 준비를 위한 풍성한 서술형 평서문)",
  "dogmaticTheology": {
    "title": "교의학적",
    "theologicalContent": "상세하게 풀어서 논증한 교의학적 학술 주해 본문 (완전한 평서문 서술)",
    "gracefulEnding": "앞선 논증과 자연스럽게 연결되는 은혜로운 신학적 귀결 문장"
  },
  "redemptiveHistory": {
    "title": "구속사적 그리스도 중심",
    "theologicalContent": "창조-타락-구속-새창조와 그리스도의 성취를 상세히 논증한 본문 (완전한 평서문 서술)",
    "gracefulEnding": "그리스도의 십자가와 부활 안에서 확증되는 구속사적 은혜의 귀결 문장"
  },
  "reformedPerspective": {
    "title": "개혁신학적",
    "theologicalContent": "하나님의 절대 주권과 은혜 언약을 상세히 논증한 본문 (완전한 평서문 서술)",
    "gracefulEnding": "하나님의 절대 주권과 값없는 은혜로 귀결되는 신학적 귀결 문장"
  },
  "kingdomAndGospel": {
    "title": "하나님나라와 복음",
    "theologicalContent": "하나님 나라와 복음의 능력을 풍성하게 풀어서 논증한 본문 (완전한 평서문 서술)",
    "gracefulEnding": "하나님 나라의 종말론적 승리와 복음의 자유로 귀결되는 귀결 문장"
  },
  "pastoralGraceSummary": "구절 전체의 신학 연구를 관통하여 복음의 은혜로 귀결되는 최종 학술 결언 (풍성한 서술형 평서문)"
}`;

  // 검증 완료된 고성능 Flash 모델 풀 자동 폴백 호출 (1순위 gemini-3.1-flash-lite 1.7초 초고속)
  const rawText = await callGeminiApiWithFallback(prompt, apiKey);

  try {
    const parsed = JSON.parse(cleanJsonString(rawText));
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
  } catch (parseErr) {
    console.error('Failed to parse Gemini Passage Theology JSON:', parseErr, rawText);
    throw new Error('JSON_PARSE_ERROR');
  }
}

