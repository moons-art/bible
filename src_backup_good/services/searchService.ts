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
          const exactRegex = new RegExp(`(^|\\s)${normalizedQuery}(\\s|$)`);
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
