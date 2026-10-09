// src/services/localBibleService.ts
// 로컬 IndexedDB(bibleDB) 전용 성경 구절 조회 및 에디터 칩/인용 카드 유틸리티
import { bibleDB } from '../utils/indexedDB';
import { BIBLE_BOOKS, BIBLE_LIST } from '../constants/bibleMeta';
import type { Verse } from '../types/bible';

// 메모리 캐시 (한번 로드된 구절 데이터는 즉시 0ms 반환)
let cachedVerses: Verse[] | null = null;
let cachedVersionName: string = '개역개정';

/**
 * 로컬 IndexedDB에서 성경 구절 데이터를 가져와 메모리에 캐싱
 * (외부 API나 Firestore 컬렉션 조회 절대 없음)
 */
async function ensureLocalBibleLoaded(): Promise<Verse[]> {
  if (cachedVerses && cachedVerses.length > 0) {
    return cachedVerses;
  }

  try {
    // 1. 기본 개역개정(built-in-krv) 확인
    const krv = await bibleDB.getVersion('built-in-krv');
    if (krv && krv.verses && krv.verses.length > 0) {
      cachedVerses = krv.verses;
      cachedVersionName = krv.name || '개역개정';
      return cachedVerses;
    }

    // 2. 다른 저장된 버전 검색
    const all = await bibleDB.getAllVersions();
    if (all && all.length > 0) {
      // 한국어 버전 우선
      const kor = all.find(v => v.name && (v.name.includes('개역') || v.name.includes('한') || v.id.includes('krv')));
      const target = kor || all[0];
      if (target && target.verses && target.verses.length > 0) {
        cachedVerses = target.verses;
        cachedVersionName = target.name || '성경';
        return cachedVerses;
      }
    }
  } catch (err) {
    console.warn('[localBibleService] IndexedDB 구절 로드 실패:', err);
  }

  return [];
}

export interface FetchedVerseResult {
  versionName: string;
  bookName: string;
  chapter: number;
  startVerse: number;
  endVerse: number;
  verses: { verse: number; text: string }[];
}

/**
 * 성경 구절 범위 본문을 로컬 DB에서 검색
 */
export async function getVersesFromLocalDB(
  bookId: string,
  chapter: number,
  startVerse: number,
  endVerse?: number
): Promise<FetchedVerseResult | null> {
  const versesData = await ensureLocalBibleLoaded();
  const bookInfo = BIBLE_LIST.find(b => b.id === bookId);
  const bookName = bookInfo ? bookInfo.name : bookId;
  const actualEndVerse = endVerse && endVerse >= startVerse ? endVerse : startVerse;

  if (!versesData || versesData.length === 0) {
    return null;
  }

  const matched = versesData.filter(v => 
    v.bookId === bookId && 
    v.chapter === chapter && 
    v.verse >= startVerse && 
    v.verse <= actualEndVerse
  );

  matched.sort((a, b) => a.verse - b.verse);

  return {
    versionName: cachedVersionName,
    bookName,
    chapter,
    startVerse,
    endVerse: actualEndVerse,
    verses: matched.map(m => ({ verse: m.verse, text: m.content })),
  };
}

export interface ParsedVerseRefMatch {
  rawMatch: string;
  bookId: string;
  bookName: string;
  chapter: number;
  startVerse: number;
  endVerse?: number;
  standardLabel: string;
}

/**
 * 성경 구절 패턴 정규식
 * 예: "창 1:1", "창세기 1:1~3", "창 1:1-3", "요 3:16", "롬 8:28", "고전 13:4-7"
 */
export const BIBLE_VERSE_REGEX = /(?:([가-힣]{1,8})\s*(\d{1,3})\s*:\s*(\d{1,3})(?:\s*[~-]\s*(\d{1,3}))?)/g;

/**
 * 텍스트 내에서 유효한 성경 구절들을 파싱 (성경 66권에 부합하는 경우만 추출)
 */
export function matchBibleReferences(text: string): ParsedVerseRefMatch[] {
  if (!text) return [];

  const results: ParsedVerseRefMatch[] = [];
  const regex = new RegExp(BIBLE_VERSE_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const rawMatch = match[0];
    const bookWord = match[1];
    const chapter = parseInt(match[2], 10);
    const startVerse = parseInt(match[3], 10);
    const endVerse = match[4] ? parseInt(match[4], 10) : undefined;

    // 성경 권명 유효성 검증
    const bookId = BIBLE_BOOKS[bookWord];
    if (!bookId) continue; // 성경 목록에 없으면 제외

    const bookInfo = BIBLE_LIST.find(b => b.id === bookId);
    const fullBookName = bookInfo ? bookInfo.name : bookWord;

    const standardLabel = endVerse && endVerse !== startVerse
      ? `${fullBookName} ${chapter}:${startVerse}~${endVerse}`
      : `${fullBookName} ${chapter}:${startVerse}`;

    results.push({
      rawMatch,
      bookId,
      bookName: fullBookName,
      chapter,
      startVerse,
      endVerse,
      standardLabel,
    });
  }

  return results;
}

/**
 * 인라인 구절 칩 HTML 생성
 */
export function createVerseChipHtml(ref: ParsedVerseRefMatch): string {
  const endVsAttr = ref.endVerse ? ` data-end-verse="${ref.endVerse}"` : '';
  return `&#8203;<span class="bible-verse-chip inline-flex items-center px-1.5 py-0.5 my-0.5 mx-1 bg-white text-[#2C2B29] hover:bg-[#F5F3ED] active:bg-[#EAE8E3] border border-black/20 hover:border-black/35 rounded-md text-xs font-semibold cursor-pointer transition-all shadow-2xs align-middle" contenteditable="false" data-book-id="${ref.bookId}" data-chapter="${ref.chapter}" data-start-verse="${ref.startVerse}"${endVsAttr} data-ref-text="${ref.standardLabel}" title="클릭하여 성경 본문 펼치기">${ref.standardLabel}</span>&nbsp;`;
}

/**
 * 본문 인용 카드 HTML 생성 (배경 흰색, 제목 헤더 및 x 삭제, 본문만 표시)
 */
export function createVerseQuoteHtml(result: FetchedVerseResult): string {
  const verseListHtml = result.verses.length > 0
    ? result.verses.map(v => `
      <div class="bible-quote-line flex items-baseline gap-1.5 py-0.5" style="font-size: 0.85em;">
        <span class="font-bold text-[#C96442] shrink-0" style="font-size: 0.9em;">${v.verse}절</span>
        <span class="text-[#2C2B29] leading-relaxed font-serif" style="font-size: 1em;">${v.text}</span>
      </div>
    `).join('')
    : `<div class="text-[#8C877D] text-xs py-0.5">해당 구절 본문을 로컬 데이터베이스에서 찾을 수 없습니다.</div>`;

  const titleRange = result.endVerse !== result.startVerse
    ? `${result.bookName} ${result.chapter}:${result.startVerse}~${result.endVerse}`
    : `${result.bookName} ${result.chapter}:${result.startVerse}`;

  return `
    <div class="bible-verse-quote-card my-1 py-1.5 px-3 bg-white border border-[#E5E0D8] rounded-lg shadow-2xs text-left" data-for-ref="${titleRange}" style="font-size: 0.85em;">
      <div class="space-y-0.5">
        ${verseListHtml}
      </div>
    </div>
  `;
}
