import { BIBLE_BOOKS, BIBLE_LIST } from '../constants/bibleMeta';

export interface ParsedVerse {
  bookId: string;
  bookName: string;
  chapter: number;
  verse: number;
  endVerse?: number;
  rawText: string;
}

export const parseBibleReferences = (text: string): ParsedVerse[] => {
  if (!text) return [];
  const results: ParsedVerse[] = [];
  // match patterns like: 창1:1, 창 1:1, 창세기 1장 1절, 창 1:1-2
  const regex = /([가-힣]+)\s*(\d+)\s*[:장]\s*(\d+)(?:\s*절)?(?:\s*-\s*(\d+)(?:\s*절)?)?/g;
  let match;
  
  // Use a Set to avoid duplicates
  const seen = new Set<string>();

  while ((match = regex.exec(text)) !== null) {
    const rawBook = match[1];
    const bookId = BIBLE_BOOKS[rawBook];
    if (bookId) {
      const chapter = parseInt(match[2]);
      const verse = parseInt(match[3]);
      const endVerse = match[4] ? parseInt(match[4]) : undefined;
      const key = `${bookId}_${chapter}_${verse}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          bookId,
          bookName: BIBLE_LIST.find(b => b.id === bookId)?.name || rawBook,
          chapter,
          verse,
          endVerse,
          rawText: match[0]
        });
      }
    }
  }
  return results;
};

export const syncBidirectionalCrossRefs = (
  sourceKey: string, 
  sourceBookName: string, 
  sourceChapter: number, 
  sourceVerse: number, 
  newText: string, 
  oldText: string, 
  verseData: Record<string, any>
): Record<string, any> => {
  const next = { ...verseData };
  const myRefStr = `${sourceBookName} ${sourceChapter}:${sourceVerse}`;

  const oldParsed = parseBibleReferences(oldText || '');
  const newParsed = parseBibleReferences(newText || '');

  const oldKeys = new Set(oldParsed.map(p => `${p.bookId}_${p.chapter}_${p.verse}`));
  const newKeys = new Set(newParsed.map(p => `${p.bookId}_${p.chapter}_${p.verse}`));

  // Added references
  for (const newKey of newKeys) {
    if (!oldKeys.has(newKey) && newKey !== sourceKey) {
      const targetData = next[newKey] || {};
      const targetCrossRef = targetData.crossRef || '';
      if (!targetCrossRef.includes(myRefStr)) {
        next[newKey] = {
          ...targetData,
          crossRef: targetCrossRef ? `${targetCrossRef}\n${myRefStr}` : myRefStr
        };
      }
    }
  }

  // Removed references
  for (const oldKey of oldKeys) {
    if (!newKeys.has(oldKey) && oldKey !== sourceKey) {
      const targetData = next[oldKey] || {};
      let targetCrossRef = targetData.crossRef || '';
      if (targetCrossRef.includes(myRefStr)) {
        // Remove the specific reference line/string
        const lines = targetCrossRef.split('\n').filter((line: string) => !line.includes(myRefStr));
        targetCrossRef = lines.join('\n');
        next[oldKey] = {
          ...targetData,
          crossRef: targetCrossRef
        };
      }
    }
  }

  return next;
};

