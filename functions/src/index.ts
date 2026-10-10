import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { GoogleGenAI } from '@google/genai';

// Firebase Admin 초기화
if (!admin.apps.length) {
  admin.initializeApp();
}

// Secret Manager에 저장된 GEMINI_API_KEY 바인딩
const geminiApiKey = defineSecret('GEMINI_API_KEY');

/**
 * 헬퍼: JSON 응답 정제
 */
function cleanJsonString(str: string): string {
  let cleaned = str.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

/**
 * 헬퍼: 구약/신약 판별
 */
function isOldTestament(bookIdOrName: string | number): boolean {
  if (typeof bookIdOrName === 'number') {
    return bookIdOrName >= 1 && bookIdOrName <= 39;
  }
  const otBooks = [
    '창세기', '출애굽기', '레위기', '민수기', '신명기', '여호수아', '사사기', '룻기',
    '사무엘상', '사무엘하', '열왕기상', '열왕기하', '역대상', '역대하', '에스라', '느헤미야',
    '에스더', '욥기', '시편', '잠언', '전도서', '아가', '이사야', '예레미야', '예레미야애가',
    '에스겔', '다니엘', '호세아', '요엘', '아모스', '오바댜', '요나', '미가', '나훔',
    '하박국', '스바냐', '학개', '스카랴', '스바냐', '스가랴', '말라기'
  ];
  return otBooks.includes(String(bookIdOrName).trim());
}

// Flash 모델 우선순위 풀 (기존 클라이언트 서비스와 동일한 모델 풀)
const GEMINI_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-flash-latest'
];

/**
 * Gemini 호출 헬퍼 (초고속 및 다중 모델 자동 폴백 지원)
 */
async function callGemini(
  apiKey: string,
  prompt: string,
  maxOutputTokens: number = 8192
): Promise<string> {
  let lastError: any = null;

  for (const model of GEMINI_MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
            topP: 0.95,
            maxOutputTokens
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.warn(`[Functions Gemini] Model ${model} HTTP ${response.status}:`, errorData);
        lastError = new Error(`HTTP_${response.status}`);
        continue;
      }

      const responseJson = await response.json();
      const rawText = responseJson?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        return rawText;
      }
    } catch (err: any) {
      console.warn(`[Functions Gemini] Model ${model} failed:`, err?.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error('ALL_GEMINI_MODELS_UNAVAILABLE');
}

// ============================================================================
// 1. AI 중계 함수 (generateBibleContent)
// ============================================================================
export const generateBibleContent = onCall(
  {
    secrets: [geminiApiKey],
    region: 'asia-northeast3', // 서울 리전 (또는 us-central1)
    timeoutSeconds: 60,
    memory: '512MiB'
  },
  async (request) => {
    // 1-1. 인증 가드: 로그인된 사용자만 호출 가능
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '로그인이 필요한 서비스입니다.');
    }

    const apiKey = geminiApiKey.value() || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new HttpsError('internal', 'GEMINI_API_KEY 설정이 누락되었습니다.');
    }

    const { actionType = 'verse_commentary', payload } = request.data || {};

    // 1-2. actionType 분기 (추후 설교문 분석, 2차 자료 생성 등 확장용 스켈레톤)
    switch (actionType) {
      case 'verse_commentary': {
        const { bookName, bookId = 1, chapter, verse, scriptureText } = payload || {};
        if (!bookName || !chapter || !verse || !scriptureText) {
          throw new HttpsError('invalid-argument', '필수 입력 항목(bookName, chapter, verse, scriptureText)이 누락되었습니다.');
        }

        const reference = `${bookName} ${chapter}:${verse}`;
        const testament = isOldTestament(bookId || bookName) ? '구약' : '신약';
        const originalLang = testament === '구약' ? '히브리어' : '헬라어';
        const originalSource = testament === '구약' ? '히브리어 BHS' : '헬라어 NA28/UBS5';

        // 1) 원어 주석 전용 프롬프트
        const promptWordParsing = `[최고 권위 학술 성경 원어 주석: 원어 전문 전수 파싱]
성경 본문: ${reference} (${testament} 원문 ${originalSource})
개역개정 본문: "${scriptureText}"

당신은 공인 원어 사전(구약: BDB/HALOT, 신약: BDAG)과 신학적 원어 문법을 철저히 준수하는 세계 최고 권위의 성경 원어 학자입니다.
지극히 학술적이고 객관적인 주해체로 작성하십시오. 반드시 아래 지침을 준수하여 JSON 형식으로만 응답하십시오:

★ 원어 단어 전수 분석 지침 (가장 중요 - 절대 생략 금지):
- 본 구절 원문(${originalLang} ${originalSource})의 첫 단어부터 마지막 단어까지 등장하는 모든 단어(명사, 동사, 전치사, 접속사, 고유명사 등)를 본문 순서대로 단 하나도 빠뜨림 없이 100% 전수 추출하여 분석하십시오.
- 절대로 중간에 자의적으로 생략하거나 몇 단어만 추리지 마십시오. 수식절과 연대 표기, 인명, 지명 등 구절 전체의 모든 원어 어휘를 온전히 끝까지 파싱하십시오.
- 성경 구절 인용 시 반드시 <개역개정> 기준을 엄격히 준수하십시오.

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

        // 2) 역사적 배경 및 설교 인사이트 프롬프트
        const promptContextAndSermon = `[최고 권위 학술 성경 주석: 역사적 배경 및 설교 인사이트]
성경 본문: ${reference} (${testament})
개역개정 본문: "${scriptureText}"

당신은 역사적 정통 개혁주의와 성경신학(Redemptive-Historical Biblical Theology)에 정통한 세계 최고 권위의 성경 주석 학자입니다.
성경 구절 인용 시 반드시 <개역개정> 기준을 엄격히 준수하며 지극히 학술적이고 깊이 있는 어조로 논증하되, JSON 형식으로만 응답하십시오:

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
          const [rawWord, rawContext] = await Promise.all([
            callGemini(apiKey, promptWordParsing, 8192),
            callGemini(apiKey, promptContextAndSermon, 4096)
          ]);

          const wordParsed = JSON.parse(cleanJsonString(rawWord));
          const contextParsed = JSON.parse(cleanJsonString(rawContext));

          return {
            reference,
            scriptureText,
            testament,
            originalLanguageCommentary: {
              language: wordParsed.language || originalLang,
              words: wordParsed.words || [],
              syntacticSummary: wordParsed.syntacticSummary || ''
            },
            historicalBackground: contextParsed.historicalBackground || {
              eraAndCulture: '',
              geographicalSocialContext: '',
              theologicalIntent: ''
            },
            sermonInsight: contextParsed.sermonInsight || {
              coreMessage: '',
              sermonPoints: [],
              meditationApplication: ''
            }
          };
        } catch (err: any) {
          console.error('[generateBibleContent:verse_commentary] Error:', err);
          throw new HttpsError('internal', `주석 생성 실패: ${err?.message || 'Gemini API 호출 오류'}`);
        }
      }

      case 'word_deep_study': {
        const { reference, scriptureText, word } = payload || {};
        if (!reference || !scriptureText || !word) {
          throw new HttpsError('invalid-argument', '필수 입력 항목(reference, scriptureText, word)이 누락되었습니다.');
        }

        const isOT = String(word.strongNumber || '').toUpperCase().startsWith('H');
        const termLang = isOT ? '히브리어' : '헬라어';
        const targetLang = isOT ? '신약 헬라어' : '구약 히브리어';

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
1. 성경 전체 출현 빈도수 (totalOccurrences): 정확한 횟수와 책별/장르별 분포를 상세히 명시하십시오.
2. 고대 어원 기원 및 역사적 변천사 (etymologyGenesis): 상세 서술 (축약 금지, 끝은 신학적 은혜의 귀결).
3. 신구약 교차 원어 대조 (crossTestamentConnection): 70인역(LXX) 대조 및 의미 성취 해설, 핵심 교차 구절 2곳.
4. 성경 전체 핵심 용례 3~4선 (biblicalUsages): reference, scriptureSnippet, theologicalContext 상세 서술.
5. 유사 동의어 대조 (synonymNuance): 성령의 영감으로 기록자가 왜 이 단어를 택했는지 독보적 뉘앙스 서술.
6. 은혜로운 마무리 결언 (gracefulConclusion): 복음의 은혜가 영혼 깊이 다가오도록 유려하고 장엄한 서술형 평서문으로 마무리.

[JSON 스키마 규격]
{
  "totalOccurrences": "성경 전체 총 O회 출현 (분포 요약)",
  "etymologyGenesis": "고대 어원과 변천사 상세 서술",
  "crossTestamentConnection": {
    "originalTerm": "${word.wordOriginal}",
    "targetLanguage": "${targetLang}",
    "equivalentTerm": "대응 단어 표기 및 발음",
    "strongNumber": "대응 스트롱코드",
    "explanation": "70인역 대조 및 해설",
    "crossUsages": [
      {
        "reference": "성경 구절",
        "scriptureSnippet": "구절 본문 인용",
        "graceInsight": "상세한 학술적·구속사적 은혜의 통찰"
      }
    ]
  },
  "biblicalUsages": [
    {
      "reference": "성경 구절",
      "scriptureSnippet": "본문 인용",
      "theologicalContext": "문맥적 신학 해설"
    }
  ],
  "synonymNuance": "동의어 대조 및 독보적 뉘앙스 논증",
  "gracefulConclusion": "단어 전체를 아우르는 신학적 은혜의 완성된 결언"
}`;

        try {
          const rawText = await callGemini(apiKey, prompt, 8192);
          const parsed = JSON.parse(cleanJsonString(rawText));
          return parsed;
        } catch (err: any) {
          console.error('[generateBibleContent:word_deep_study] Error:', err);
          throw new HttpsError('internal', `단어 심층 연구 생성 실패: ${err?.message || 'Gemini API 호출 오류'}`);
        }
      }

      case 'passage_theology': {
        const { reference, scriptureText, testament = '신약' } = payload || {};
        if (!reference || !scriptureText) {
          throw new HttpsError('invalid-argument', '필수 입력 항목(reference, scriptureText)이 누락되었습니다.');
        }

        const prompt = `[최고 권위 학술 구절 전체 신학 심층 연구 요청: 교의학·구속사·개혁신학·하나님 나라]
성경 본문: ${reference} (${testament})
개역개정 본문: "${scriptureText}"

당신은 역사적 정통 개혁주의와 성경신학(Redemptive-Historical Biblical Theology)에 정통한 세계 최고 권위의 신학자입니다.
본 성경 구절 전체를 4대 신학 관점에서 매우 심도 있고 학술적으로 연구하여, 이용자가 감탄할 수준의 방대하고 학문적인 연구 성과를 작성하고 JSON 형식으로만 응답하십시오:

[JSON 스키마 규격]
{
  "interpretationAndSignificance": "구절의 역사적·문맥적·성경신학적 배경 속에서 도출되는 깊은 해석과 핵심 의미 본문",
  "dogmaticTheology": {
    "title": "교의학적",
    "theologicalContent": "상세하게 풀어서 논증한 교의학적 학술 주해 본문",
    "gracefulEnding": "자연스럽게 연결되는 은혜로운 신학적 귀결 문장"
  },
  "redemptiveHistory": {
    "title": "구속사적 그리스도 중심",
    "theologicalContent": "창조-타락-구속-새창조와 그리스도의 성취를 상세히 논증한 본문",
    "gracefulEnding": "그리스도의 십자가와 부활 안에서 확증되는 구속사적 은혜의 귀결 문장"
  },
  "reformedPerspective": {
    "title": "개혁신학적",
    "theologicalContent": "하나님의 절대 주권과 은혜 언약을 상세히 논증한 본문",
    "gracefulEnding": "하나님의 절대 주권과 값없는 은혜로 귀결되는 신학적 귀결 문장"
  },
  "kingdomAndGospel": {
    "title": "하나님나라와 복음",
    "theologicalContent": "하나님 나라와 복음의 능력을 풍성하게 풀어서 논증한 본문",
    "gracefulEnding": "하나님 나라의 종말론적 승리와 복음의 자유로 귀결되는 귀결 문장"
  },
  "pastoralGraceSummary": "구절 전체의 신학 연구를 관통하여 복음의 은혜로 귀결되는 최종 학술 결언"
}`;

        try {
          const rawText = await callGemini(apiKey, prompt, 8192);
          const parsed = JSON.parse(cleanJsonString(rawText));
          return parsed;
        } catch (err: any) {
          console.error('[generateBibleContent:passage_theology] Error:', err);
          throw new HttpsError('internal', `구절 신학 연구 생성 실패: ${err?.message || 'Gemini API 호출 오류'}`);
        }
      }

      case 'sermon_analysis': {
        // [스켈레톤]: 향후 추가될 설교문 분석 로직 자리
        return {
          status: 'success',
          actionType,
          message: '설교문 분석 기능 준비 중입니다.'
        };
      }

      case 'secondary_content': {
        // [스켈레톤]: 향후 추가될 2차 자료 생성 로직 자리
        return {
          status: 'success',
          actionType,
          message: '2차 자료 생성 기능 준비 중입니다.'
        };
      }

      default:
        throw new HttpsError('invalid-argument', `지원하지 않는 actionType입니다: ${actionType}`);
    }
  }
);

// ============================================================================
// 2. PG 결제 검증 및 승인 중계 함수 틀 (confirmPayment)
// ============================================================================
const tossSecretKey = defineSecret('TOSS_SECRET_KEY');

export const confirmPayment = onCall(
  {
    secrets: [tossSecretKey],
    region: 'asia-northeast3',
    timeoutSeconds: 30
  },
  async (request) => {
    // 2-1. 인증 가드
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '로그인이 필요한 서비스입니다.');
    }

    const { paymentKey, orderId, amount } = request.data || {};
    if (!paymentKey || !orderId || !amount) {
      throw new HttpsError('invalid-argument', '결제 검증에 필요한 파라미터가 누락되었습니다.');
    }

    const secretKey = tossSecretKey.value() || process.env.TOSS_SECRET_KEY;
    console.log(`[confirmPayment] 요청 접수 - OrderID: ${orderId}, Amount: ${amount}, User: ${request.auth.uid}`);

    // [뼈대 스켈레톤] 추후 PG사 승인 API 연동 시 아래 로직 활성화
    /*
    const encodedAuth = Buffer.from(`${secretKey}:`).toString('base64');
    const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${encodedAuth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ paymentKey, orderId, amount })
    });
    if (!response.ok) {
      const errorJson = await response.json();
      throw new HttpsError('invalid-argument', errorJson.message || '결제 승인 실패');
    }
    const paymentResult = await response.json();
    */

    return {
      success: true,
      orderId,
      amount,
      message: '결제 승인 검증 뼈대 함수가 정상 동작했습니다.'
    };
  }
);

// ============================================================================
// 3. 관리자 대시보드 보안 및 데이터 조회 (getAdminDashboardData)
// ============================================================================
export const getAdminDashboardData = onCall(
  {
    region: 'asia-northeast3',
    timeoutSeconds: 30
  },
  async (request) => {
    // 3-1. 인증 가드
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '인증되지 않은 사용자입니다.');
    }

    // 3-2. Custom Claims 관리자 권한 검증
    const isAdmin = request.auth.token.admin === true;
    if (!isAdmin) {
      throw new HttpsError('permission-denied', '관리자 권한이 없습니다.');
    }

    try {
      const db = admin.firestore();

      // 전체 회원 수 조회 (Firestore count aggregation)
      const usersCollection = db.collection('users');
      const countSnapshot = await usersCollection.count().get();
      const totalUsers = countSnapshot.data().count;

      // 주석 히스토리 총 건수 조회
      const commentaryCountSnapshot = await db.collectionGroup('commentary_history').count().get().catch(() => null);
      const totalCommentaries = commentaryCountSnapshot ? commentaryCountSnapshot.data().count : 0;

      return {
        timestamp: Date.now(),
        metrics: {
          totalUsers,
          totalCommentaries
        },
        message: '관리자 대시보드 통계 조회 성공'
      };
    } catch (err: any) {
      console.error('[getAdminDashboardData] Error:', err);
      throw new HttpsError('internal', `관리자 데이터 조회 중 오류가 발생했습니다: ${err?.message}`);
    }
  }
);
