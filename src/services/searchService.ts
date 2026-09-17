import type { BibleVersion, Verse } from '../types/bible';
import { OT_BOOKS, NT_BOOKS } from '../constants/bibleMeta';
import { BIBLE_SYNONYMS } from '../constants/bibleSynonyms';

export type MatchMode = 'exact' | 'partial';
export type LogicMode = 'AND' | 'OR';
export type SearchRange = 'all' | 'ot' | 'nt' | 'book';

// 한글 조사 제거 및 핵심 검색 키워드 추출
function extractKeywords(text: string): string[] {
  const clean = text.replace(/[.,/#!$%^&*;:{}=\-_`~()?"'<>]/g, ' ');
  const words = clean.split(/\s+/).filter(w => w.length > 0);
  const keywords: string[] = [];
  const particles = ['에게서', '에게', '에서', '으로', '부터', '까지', '은', '는', '이', '가', '을', '를', '에', '의', '와', '과', '도', '로', '만'];

  for (const w of words) {
    keywords.push(w);
    for (const p of particles) {
      if (w.endsWith(p) && w.length > p.length + 1) {
        const stripped = w.slice(0, -p.length);
        if (stripped.length >= 2 && !keywords.includes(stripped)) {
          keywords.push(stripped);
        }
      }
    }
  }
  return Array.from(new Set(keywords));
}

export class BibleSearchService {
  private versionsMap: Map<string, BibleVersion> = new Map();

  hasIndex(versionId: string): boolean {
    return this.versionsMap.has(versionId);
  }

  indexVersion(version: BibleVersion) {
    if (!version.verses || version.verses.length === 0) return;
    this.versionsMap.set(version.id, version);
    console.log(`[SearchService] Version added to search memory: ${version.name}`);
  }

  search(
    query: string, 
    versionIds: string[], 
    options: {
      matchMode: MatchMode,
      logicMode: LogicMode,
      range: SearchRange,
      currentBookId?: string,
      searchMode?: 'standard' | 'semantic'
    }
  ): any[] {
    const { matchMode, logicMode, range, currentBookId, searchMode = 'standard' } = options;
    if (!query.trim()) return [];

    const normalizedQuery = query.trim().normalize('NFC');
    const terms = Array.from(new Set(normalizedQuery.split(/\s+/).filter(t => t.length > 0)));
    const allResults: any[] = [];

    for (const id of versionIds) {
      const version = this.versionsMap.get(id);
      if (!version) continue;

      let versionResults: any[] = [];
      const verses = version.verses;

      if (searchMode === 'standard') {
        if (logicMode === 'AND') {
          versionResults = verses.filter(v => terms.every(t => v.content.includes(t)));
        } else {
          versionResults = verses.filter(v => terms.some(t => v.content.includes(t)));
        }

        if (matchMode === 'exact') {
          const escapedQuery = normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const exactRegex = new RegExp(`(^|\\s)${escapedQuery}(\\s|$)`);
          versionResults = versionResults.filter(r => exactRegex.test(r.content));
        }
      } else {
        // Semantic: 유사 구절 탐색 (동의어 확장 OR 검색)
        const keywords = extractKeywords(normalizedQuery);
        const expanded = [...keywords];
        keywords.forEach(t => { if (BIBLE_SYNONYMS[t]) expanded.push(...BIBLE_SYNONYMS[t]); });
        
        const searchTerms = expanded.length > 0 ? expanded : [normalizedQuery];
        versionResults = verses.filter(v => searchTerms.some(t => v.content.includes(t)));
      }

      if (range !== 'all') {
        versionResults = versionResults.filter(r => {
          if (range === 'ot') return OT_BOOKS.includes(r.bookId);
          if (range === 'nt') return NT_BOOKS.includes(r.bookId);
          if (range === 'book') return r.bookId === currentBookId;
          return true;
        });
      }
      
      allResults.push(...versionResults.map(r => ({ ...r, versionId: id })));
    }

    return allResults.slice(0, 1000);
  }
}

export const searchService = new BibleSearchService();
