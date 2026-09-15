import type { BibleVersion, Verse } from '../types/bible';
import { BIBLE_BOOKS } from '../constants/bibleMeta';

export class BibleParser {
  /**
   * Parse TXT content into BibleVersion
   */
  static async parseTxt(name: string, content: string): Promise<BibleVersion> {
    const verses: Verse[] = [];
    const normalizedContent = content.normalize('NFC');
    const lines = normalizedContent.split(/\r?\n/);
    console.log(`[Parser] ${name} 로딩 시작 - 총 ${lines.length}줄 감지됨. (NFC 정규화 완료)`);
    console.log(`[Parser] Parsing ${name} - Total lines: ${lines.length}`);
    
    // Final Strict Patterns
    // P1: Book (1-3 + Korean OR English) + Chapter + Verse
    // book group doesn't take the trailing number of chapter
    // Updated to support English abbreviations with dots like "Gen.1:1" or "Matt. 1:1"
    const patternWithBook = /^[([{(]?\s*([1-3]?(?:[가-힣]+|[a-zA-Z]+))\.?\s*(\d+)\s*[:：.,]\s*(\d+)\s*[)\]}]?\s*(?:<([^>]+)>)?\s*(.*)/;
    
    // P2: No Book (Chapter:Verse)
    const patternNoBook = /^[([{(]?\s*(\d+)\s*[:：.,]\s*(\d+)\s*[)\]}]?\s*(?:<([^>]+)>)?\s*(.*)/;

    let lastBookId = 'GEN';
    let lastBookName = '창세기';
    let currentChapter = 1;

    // Additional patterns for incomplete formats
    const chapterPattern = /^(\d+)\s*[장ch].*/i;
    const verseOnlyPattern = /^(\d+)\s+(.*)/;
    const headerPattern = /^\[?\s*([1-3]?(?:[가-힣]+|[a-zA-Z\s]+?))\s+(\d+)\s*\]?$/; // Matches [Genesis 1] or Genesis 1
    const dotVersePattern = /^(\d+)\.(.*)/; // Matches 1.In the beginning

    // 메인 스레드 프리징 방지를 위한 비동기 청크 파싱 (아이패드 튕김 완벽 해결)
    const CHUNK_SIZE = 1000;
    let currentIndex = 0;

    await new Promise<void>((resolve) => {
      const processChunk = () => {
        const chunkEnd = Math.min(currentIndex + CHUNK_SIZE, lines.length);
        
        for (let i = currentIndex; i < chunkEnd; i++) {
          const line = lines[i];
          const trimmed = line.trim();
          if (!trimmed) continue;

          let chapter, verse, title, text;

          // Try Header Pattern [Genesis 1] or Genesis 1
          const headerMatch = trimmed.match(headerPattern);
          if (headerMatch) {
            const rawBookName = headerMatch[1]?.trim();
            let bookName = rawBookName?.normalize('NFC');
            if (bookName?.endsWith('.')) bookName = bookName.slice(0, -1);
            
            const bookId = BIBLE_BOOKS[bookName] || BIBLE_BOOKS[bookName.charAt(0).toUpperCase() + bookName.slice(1).toLowerCase()] || BIBLE_BOOKS[bookName.toUpperCase()];
            if (bookId) {
              lastBookId = bookId;
              lastBookName = bookName;
            }
            currentChapter = parseInt(headerMatch[2], 10);
            continue;
          }

          const matchWith = trimmed.match(patternWithBook);
          if (matchWith) {
            const rawBookName = matchWith[1]?.trim();
            let bookName = rawBookName?.normalize('NFC');
            chapter = matchWith[2];
            verse = matchWith[3];
            title = matchWith[4];
            text = matchWith[5]?.trim();

            // Normalize book name: Gen. -> Gen
            if (bookName?.endsWith('.')) {
              bookName = bookName.slice(0, -1);
            }

            const bookId = BIBLE_BOOKS[bookName] || BIBLE_BOOKS[bookName.charAt(0).toUpperCase() + bookName.slice(1).toLowerCase()] || BIBLE_BOOKS[bookName.toUpperCase()];
            if (bookId) {
              lastBookId = bookId;
              lastBookName = bookName;
            }
            if (chapter) currentChapter = parseInt(chapter, 10);
          } else {
            const matchNo = trimmed.match(patternNoBook);
            if (matchNo) {
              chapter = matchNo[1];
              verse = matchNo[2];
              title = matchNo[3];
              text = matchNo[4]?.trim();
              if (chapter) currentChapter = parseInt(chapter, 10);
            } else {
              // Check for "1.In the beginning"
              const dotMatch = trimmed.match(dotVersePattern);
              if (dotMatch) {
                verse = dotMatch[1];
                text = dotMatch[2]?.trim();
                chapter = currentChapter.toString();
              } else {
                // Check for "1장" or similar
                const chapterMatch = trimmed.match(chapterPattern);
                if (chapterMatch) {
                  currentChapter = parseInt(chapterMatch[1], 10);
                  continue; 
                }

                // Check for "1 본문"
                const verseMatch = trimmed.match(verseOnlyPattern);
                if (verseMatch) {
                  verse = verseMatch[1];
                  text = verseMatch[2]?.trim();
                  chapter = currentChapter.toString();
                }
              }
            }
          }

          if (chapter && verse) {
            verses.push({
              bookId: lastBookId,
              bookName: lastBookName,
              chapter: parseInt(chapter, 10),
              verse: parseInt(verse, 10),
              title: title?.trim(),
              content: text || ''
            });
          }
        }

        currentIndex = chunkEnd;
        if (currentIndex < lines.length) {
          // 브라우저 렌더링 양보
          setTimeout(processChunk, 0);
        } else {
          resolve();
        }
      };

      processChunk();
    });

    return {
      id: crypto.randomUUID(),
      name,
      verses,
      metadata: {
        uploadedAt: Date.now(),
        fileType: 'txt'
      }
    };
  }

  static async parsePdf(name: string, _content: string): Promise<BibleVersion> {
    // Placeholder message for PDF support
    console.log(`PDF parse requested for: ${name}`);
    throw new Error("PDF 파싱 기능은 현재 준비 중입니다. 텍스트(.txt) 형식의 성경 파일을 이용해 주세요.");
  }
}
