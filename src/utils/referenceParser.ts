// NATIONS BIBLE 스마트 성경 구절 인식 및 검색 파서
import { BIBLE_BOOKS, BIBLE_LIST } from '../constants/bibleMeta';

export interface ParsedReference {
  bookId: string;          // 예: 'MAT'
  bookName: string;        // 예: '마태복음'
  chapter?: number;        // 예: 1
  verse?: number;          // 예: 6
  verseKey?: string;       // 예: 'MAT_1_6' 또는 'MAT_1'
  standardRef: string;     // 예: '마태복음 1:6' 또는 '마태복음 1장'
}

// BIBLE_BOOKS 키들을 글자 수가 긴 순서대로 정렬 (예: '마태복음' > '마태' > '마' 우선순위 매칭)
const SORTED_BOOK_KEYS = Object.keys(BIBLE_BOOKS).sort((a, b) => b.length - a.length);

/**
 * 다양한 형식의 성경 구절 입력(단축어, 공백, 콜론, 장절 한글)을 표준 형식으로 파싱
 * 예:
 * - '마 1 6', '마태 1 6', '마태복음 1 6' -> MAT, 1, 6
 * - '마 1:6', '마태 1:6', '마태복음 1:6' -> MAT, 1, 6
 * - '마 1장 6절', '마태복음 1장 6절' -> MAT, 1, 6
 * - '마 1', '마태 1장' -> MAT, 1
 * - '마태복음' -> MAT
 */
export function parseBibleReference(input: string): ParsedReference | null {
  if (!input || !input.trim()) return null;
  const trimmed = input.trim();

  // 1. 책 이름/약어 매칭
  let matchedBookKey: string | null = null;
  let remaining = '';

  for (const key of SORTED_BOOK_KEYS) {
    if (trimmed.startsWith(key)) {
      const rest = trimmed.slice(key.length);
      // 책 이름 뒤가 빈 문자열이거나, 공백, 숫자, 콜론, 구두점인 경우에만 유효한 매칭으로 인정
      if (rest === '' || /^[\s0-9:장절,-]/.test(rest)) {
        matchedBookKey = key;
        remaining = rest.trim();
        break;
      }
    }
  }

  if (!matchedBookKey) return null;

  const bookId = BIBLE_BOOKS[matchedBookKey];
  const bookInfo = BIBLE_LIST.find(b => b.id === bookId);
  const bookName = bookInfo ? bookInfo.name : matchedBookKey;

  // 2. 장 및 절 번호 파싱
  if (!remaining) {
    return {
      bookId,
      bookName,
      standardRef: bookName,
    };
  }

  // 특수문자 및 장/절 한글을 공백 또는 구분자로 정규화
  // '1장 6절' -> '1 6', '1:6' -> '1 6', '1 6' -> '1 6'
  const normalizedNumbers = remaining
    .replace(/장/g, ' ')
    .replace(/절/g, '')
    .replace(/[:.,-]/g, ' ')
    .trim();

  const numParts = normalizedNumbers.split(/\s+/).filter(Boolean);

  let chapter: number | undefined = undefined;
  let verse: number | undefined = undefined;

  if (numParts.length >= 1) {
    const parsedCh = parseInt(numParts[0], 10);
    if (!isNaN(parsedCh) && parsedCh > 0) {
      chapter = parsedCh;
    }
  }

  if (numParts.length >= 2) {
    const parsedVs = parseInt(numParts[1], 10);
    if (!isNaN(parsedVs) && parsedVs > 0) {
      verse = parsedVs;
    }
  }

  let verseKey: string | undefined = undefined;
  let standardRef = bookName;

  if (chapter !== undefined && verse !== undefined) {
    verseKey = `${bookId}_${chapter}_${verse}`;
    standardRef = `${bookName} ${chapter}:${verse}`;
  } else if (chapter !== undefined) {
    verseKey = `${bookId}_${chapter}`;
    standardRef = `${bookName} ${chapter}장`;
  }

  return {
    bookId,
    bookName,
    chapter,
    verse,
    verseKey,
    standardRef,
  };
}

/**
 * 사용자 검색어(query)가 특정 성경 구절(verseKey 또는 '마태복음 1:6' 형식 문자열)과 일치하는지 판별
 * @param query 사용자 입력 검색어 (예: '마 1 6', '마태 1:6', '마태복음 1:6')
 * @param targetReference 판별 대상 성경 구절 (예: 'MAT_1_6' 또는 '마태복음 1:6')
 */
export function isBibleReferenceMatch(query: string, targetReference: string): boolean {
  if (!query.trim() || !targetReference.trim()) return false;

  const parsedQuery = parseBibleReference(query);
  if (!parsedQuery) return false;

  // targetReference가 'MAT_1_6' 형태인 경우
  if (targetReference.includes('_')) {
    const [bId, chStr, vsStr] = targetReference.split('_');
    if (bId !== parsedQuery.bookId) return false;

    if (parsedQuery.chapter !== undefined) {
      if (parseInt(chStr, 10) !== parsedQuery.chapter) return false;
    }

    if (parsedQuery.verse !== undefined) {
      if (parseInt(vsStr, 10) !== parsedQuery.verse) return false;
    }

    return true;
  }

  // targetReference가 '마태복음 1:6' 형태인 경우
  const parsedTarget = parseBibleReference(targetReference);
  if (!parsedTarget) return false;

  if (parsedTarget.bookId !== parsedQuery.bookId) return false;

  if (parsedQuery.chapter !== undefined) {
    if (parsedTarget.chapter !== parsedQuery.chapter) return false;
  }

  if (parsedQuery.verse !== undefined) {
    if (parsedTarget.verse !== parsedQuery.verse) return false;
  }

  return true;
}

/**
 * 설교 제목이나 텍스트 내부에서 성경 권명 및 본문 위치를 스마트 추출
 * 예:
 * - '마 1 6 참된 복' -> { bookId: 'MAT', bookName: '마태복음' }
 * - '마태 1:6-10 설교' -> { bookId: 'MAT', bookName: '마태복음' }
 * - '롬 8:28 협력하여 선을' -> { bookId: 'ROM', bookName: '로마서' }
 * - '창세기 1:1 창조의 신비' -> { bookId: 'GEN', bookName: '창세기' }
 */
export function extractBibleBookFromText(text: string): { bookId: string; bookName: string; parsedRef?: string } | null {
  if (!text || !text.trim()) return null;

  // 1. 텍스트 앞부분이나 단어들 중에서 성경 권명 패턴 탐색
  const words = text.trim().split(/\s+/);
  
  // 첫 1~3단어 조합으로 구절 파싱 시도 (대부분 설교 제목 앞부분에 본문이 위치함)
  for (let i = 1; i <= Math.min(words.length, 3); i++) {
    const candidate = words.slice(0, i).join(' ');
    const parsed = parseBibleReference(candidate);
    if (parsed && (parsed.chapter !== undefined || candidate.length >= 2)) {
      return {
        bookId: parsed.bookId,
        bookName: parsed.bookName,
        parsedRef: parsed.standardRef,
      };
    }
  }

  // 단어들 중 중간에 성경 권명이 있는지 전체 스캔
  for (const key of SORTED_BOOK_KEYS) {
    // 1글자 약어(마, 창 등)는 오탐 방지를 위해 뒤에 숫자나 장절이 올 때만 인정
    if (key.length === 1) {
      const singleLetterRegex = new RegExp(`(^|\\s)${key}\\s*([0-9]+)`, 'i');
      const match = text.match(singleLetterRegex);
      if (match) {
        const bookId = BIBLE_BOOKS[key];
        const bookInfo = BIBLE_LIST.find(b => b.id === bookId);
        return {
          bookId,
          bookName: bookInfo ? bookInfo.name : key,
          parsedRef: `${bookInfo ? bookInfo.name : key} ${match[2]}장`,
        };
      }
    } else {
      // 2글자 이상 (마태, 로마, 창세기 등)
      const multiLetterRegex = new RegExp(`(^|\\s)${key}`, 'i');
      if (multiLetterRegex.test(text)) {
        const bookId = BIBLE_BOOKS[key];
        const bookInfo = BIBLE_LIST.find(b => b.id === bookId);
        return {
          bookId,
          bookName: bookInfo ? bookInfo.name : key,
        };
      }
    }
  }

  return null;
}

/**
 * 사용자 검색어와 대상 구절 간의 매칭 점수를 계산 (정확한 장/절 일치가 최상위로 오도록 정렬에 사용)
 * 0: 매칭 없음
 * 1: 본문 텍스트에만 키워드가 포함됨
 * 2: 성경 권(Book)만 일치 (예: '마태')
 * 3: 성경 권 + 장 일치 (예: '마태 1장')
 * 4: 성경 권 + 장 + 절 완벽 일치 (예: '마 1 6', '마태 1:6' -> MAT_1_6)
 */
export function getBibleReferenceMatchScore(query: string, verseKey: string, textContent?: string): number {
  if (!query || !query.trim()) return 0;
  const trimmed = query.trim();
  const parsed = parseBibleReference(trimmed);

  if (parsed && verseKey) {
    const [bId, chStr, vsStr] = verseKey.split('_');
    const ch = parseInt(chStr, 10);
    const vs = parseInt(vsStr, 10);

    if (bId === parsed.bookId) {
      if (parsed.chapter !== undefined && parsed.verse !== undefined) {
        if (ch === parsed.chapter && vs === parsed.verse) return 4; // 권+장+절 완벽 일치
      } else if (parsed.chapter !== undefined) {
        if (ch === parsed.chapter) return 3; // 권+장 일치
      } else {
        return 2; // 권 일치
      }
    }
  }

  // 본문 텍스트 포함 여부
  if (textContent && textContent.toLowerCase().includes(trimmed.toLowerCase())) {
    return 1;
  }

  return 0;
}

