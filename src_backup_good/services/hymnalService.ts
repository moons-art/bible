import type { HymnalSong } from '../types/hymnal';
import MiniSearch from 'minisearch';

class HymnalService {
  private miniSearch: MiniSearch;
  private songs: HymnalSong[] = [];

  constructor() {
    this.miniSearch = new MiniSearch({
      fields: ['number', 'title', 'lyrics', 'code', 'meter', 'category'], // 검색 대상 필드 확장
      storeFields: ['id', 'number', 'title', 'lyrics', 'filename', 'filePath', 'category', 'code', 'meter', 'albumId', 'fileId'],
      searchOptions: {
        boost: { title: 2, number: 3 },
        fuzzy: 0.1,
        prefix: true,
        combineWith: 'AND' // 모든 키워드가 포함될 때만 결과 노출
      }
    });
  }

  setSongs(songs: HymnalSong[]) {
    // 검색 엔진이 null이나 undefined 필드를 만나면 해당 문서를 무시할 수 있으므로 안전하게 정제합니다.
    // Mac 환경 자모 분리 방지를 위해 모든 텍스트를 NFC로 정규화합니다.
    const sanitizedSongs = songs.map(song => ({
      ...song,
      title: (song.title || '').normalize('NFC'),
      lyrics: (song.lyrics || '').normalize('NFC'),
      category: (song.category || '').normalize('NFC'),
      code: (song.code || '').normalize('NFC'),
      meter: (song.meter || '').normalize('NFC'),
      number: song.number || 0,
      filename: song.filename,
      filePath: song.filePath,
      albumId: song.albumId,
      fileId: song.fileId,
      searchTokens: (song.searchTokens || []).join(' ')
    }));

    this.songs = sanitizedSongs as HymnalSong[];
    this.miniSearch.removeAll();
    this.miniSearch.addAll(this.songs);
  }

  search(query: string): HymnalSong[] {
    if (!query || !query.trim()) return this.songs;
    
    const trimmedQuery = query.trim().normalize('NFC');

    // 1. 숫자 검색 (곡 번호가 일치하거나, 제목에 해당 숫자가 포함된 경우 모두 노출)
    if (/^\d+$/.test(trimmedQuery)) {
      const numStr = trimmedQuery;
      const num = parseInt(trimmedQuery, 10);
      const exactMatches = this.songs.filter(s => 
        s.number === num || 
        (s.title && s.title.includes(numStr))
      );
      const others = this.songs.filter(s => 
        s.number !== num && 
        !(s.title && s.title.includes(numStr))
      );
      return [...exactMatches, ...others.slice(0, 50)];
    }

    // 2. 텍스트 정제 함수 (특수문자, 공백 등 모두 제거하고 한글, 영문, 숫자만 남김)
    const cleanStr = (str: string) => {
      if (!str) return '';
      return str.normalize('NFC').replace(/[^a-zA-Z가-힣ㄱ-ㅎㅏ-ㅣ0-9]/g, '').toLowerCase();
    };

    // 검색어를 공백 기준으로 분리 (AND 검색용)
    const rawSearchTerms = trimmedQuery.split(/\s+/);
    const searchTerms = rawSearchTerms.map(t => cleanStr(t)).filter(t => t.length > 0);

    if (searchTerms.length === 0) return this.songs;

    // 3. Substring (포함) 검색 - 특수문자/공백 무시
    const substringMatches = this.songs.filter(song => {
      // 대상을 하나의 정제된 문자열로 뭉침 (1.많은 사람들 -> 1많은사람들)
      const targetStr = cleanStr([
        song.title || '', 
        song.lyrics || '', 
        song.category || '', 
        song.searchTokens || ''
      ].join(' '));
      
      // 분리된 모든 검색어 조각이 targetStr에 포함되어야 함 (AND 조건)
      return searchTerms.every(term => targetStr.includes(term));
    });

    // 4. MiniSearch를 통한 유사도 검색 (보조)
    const miniResults = this.miniSearch.search(trimmedQuery);

    // 5. 결과 병합 (정확한 Substring 일치 우선)
    const combined = [...substringMatches];
    const seen = new Set(substringMatches.map(s => s.id));
    
    for (const res of miniResults) {
       if (!seen.has(res.id)) {
          const originalSong = this.songs.find(s => s.id === res.id);
          if (originalSong) {
            combined.push(originalSong);
            seen.add(res.id);
          }
       }
    }

    return combined;
  }

  getSongById(id: string): HymnalSong | undefined {
    return this.songs.find(s => s.id === id);
  }
}

export const hymnalService = new HymnalService();
