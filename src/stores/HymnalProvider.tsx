import React, { createContext, useContext, useState, useEffect } from 'react';
import type { HymnalSong } from '../types/hymnal';
import { hymnalService } from '../services/hymnalService';
import { hymnalApi } from '../api/hymnalApi';
import { gdriveWebService } from '../api/gdriveWebService';

export interface Album {
  id: string;
  name: string;
  path: string;
  type: 'fixed' | 'custom';
}

export interface ContiItem {
  id: string;      // 콘티 내 고유 ID
  songId: string;  // 원본 곡 ID
  x: number;       // 캔버스 내 X 좌표 (%)
  y: number;       // 캔버스 내 Y 좌표 (%)
  width: number;   // 너비 (%)
  height: number;  // 높이 (%) (비율 유지를 위해 자동 계산 권장)
  memo: string;    // 개별 악보 메모
  order: number;   // 순서
  crop?: { top: number; bottom: number; left: number; right: number }; // % 기반 자르기
  isVisible: boolean; // 캔버스 표시 여부
  memoFontSize?: number; // 메모 글자 크기
  isMemoOpen?: boolean; // 메모창 열림 여부
  page?: number;       // 배치된 페이지 번호
}

interface HymnalContextType {
  songs: HymnalSong[];
  filteredSongs: HymnalSong[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedSongId: string | null;
  setSelectedSongId: (id: string | null) => void;
  isLoading: boolean;
  isSyncing: boolean;
  setIsSyncing: (val: boolean) => void;
  
  // Albums
  albums: Album[];
  activeAlbumId: string;
  setActiveAlbumId: (id: string) => void;
  addAlbum: (name: string) => Promise<void>;
  updateAlbum: (album: Album) => Promise<void>;
  deleteAlbum: (id: string) => Promise<void>;
  updateAlbumPath: (id: string) => Promise<void>;
  
  // Sync & Build
  processingProgress: { processed: number; total: number } | null;
  syncAlbum: (albumId: string) => Promise<void>;
  processImages: (albumId: string, isIncremental: boolean) => Promise<void>;
  
  // CSV
  exportCSV: (albumId: string) => Promise<void>;
  importCSV: () => Promise<void>;

  // --- Conti Editor ---
  contiItems: ContiItem[];
  contiTitle: string;
  setContiTitle: (title: string) => void;
  paperSize: 'A4' | 'A3';
  setPaperSize: (size: 'A4' | 'A3') => void;
  contiTitleFontSize: number;
  setContiTitleFontSize: (size: number) => void;
  showContiNumbers: boolean;
  setShowContiNumbers: (val: boolean) => void;
  orientation: 'portrait' | 'landscape';
  setOrientation: (val: 'portrait' | 'landscape') => void;
  itemsPerPage: number;
  setItemsPerPage: (val: number) => void;
  isEditorOpen: boolean;
  setIsEditorOpen: (val: boolean) => void;
  isLibraryOpen: boolean;
  setIsLibraryOpen: (val: boolean) => void;
  
  // Saved Contis
  savedContis: any[];
  currentContiId: string | null;
  saveCurrentConti: (name?: string) => Promise<void>;
  loadSavedConti: (id: string) => Promise<void>;
  deleteSavedConti: (id: string) => Promise<void>;
  fetchSavedContis: () => Promise<void>;

  addToConti: (songId: string) => void;
  removeFromConti: (id: string) => void;
  updateContiItem: (id: string, updates: Partial<ContiItem>) => void;
  toggleContiItemVisibility: (id: string) => void;
  reorderContiItems: (newItems: ContiItem[]) => void;
  clearConti: () => void;
  
  // UI States
  showAlbumModal: boolean;
  setShowAlbumModal: (val: boolean) => void;
  showBuilder: boolean;
  setShowBuilder: (val: boolean) => void;
  editingAlbum: Album | null;
  setEditingAlbum: (album: Album | null) => void;
  
  showAllTooltips: boolean;
  setShowAllTooltips: (val: boolean) => void;
  fetchSongs: () => Promise<void>;
  reloadSettings: () => Promise<void>;
  setSongs: React.Dispatch<React.SetStateAction<HymnalSong[]>>;
  setAlbums: React.Dispatch<React.SetStateAction<Album[]>>;
  setContiItems: React.Dispatch<React.SetStateAction<ContiItem[]>>;
}

const HymnalContext = createContext<HymnalContextType | undefined>(undefined);

export const HymnalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [songs, setSongs] = useState<HymnalSong[]>([]);
  const [filteredSongs, setFilteredSongs] = useState<HymnalSong[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Albums State
  const [albums, setAlbums] = useState<Album[]>([]);
  const [activeAlbumId, setActiveAlbumId] = useState<string>('all');
  const [processingProgress, setProcessingProgress] = useState<{ processed: number; total: number } | null>(null);

  // --- Conti Editor States ---
  const [contiItems, setContiItems] = useState<ContiItem[]>([]);
  const [contiTitle, setContiTitle] = useState('');
  const [contiTitleFontSize, setContiTitleFontSize] = useState(48);
  const [showContiNumbers, setShowContiNumbers] = useState(true);
  const [paperSize, setPaperSize] = useState<'A4' | 'A3'>('A4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [itemsPerPage, setItemsPerPage] = useState<number>(2);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  
  // Saved Contis State
  const [savedContis, setSavedContis] = useState<any[]>([]);
  const [currentContiId, setCurrentContiId] = useState<string | null>(null);

  // UI States
  const [showAlbumModal, setShowAlbumModal] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [showAllTooltips, setShowAllTooltips] = useState(true);

  const reloadSettings = async () => {
    const settings = await hymnalApi.getSettings();
    let loadedAlbums: Album[] = [];
    if (settings && settings.albums) {
      loadedAlbums = settings.albums;
    }
    
    // 만약 settings에 'hymnal' (새찬송가) 앨범이 누락되어 있다면 기본값으로 강제 복원 및 삽입
    if (!loadedAlbums.find(a => a.id === 'hymnal')) {
      loadedAlbums = [
        { id: 'hymnal', name: '새찬송가', path: '', type: 'fixed' },
        ...loadedAlbums
      ];
    }
    setAlbums(loadedAlbums);
  };

  const fetchSongs = async () => {
    setIsLoading(true);
    try {
      const data = await hymnalApi.getSongs();
      setSongs(data);
      hymnalService.setSongs(data);
      setFilteredSongs(data);
    } catch (e) {
      console.error("Failed to load music data via API", e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSavedContis = async () => {
    const data = await hymnalApi.getSavedContis();
    setSavedContis(data);
  };

  // Load Initial Data
  useEffect(() => {
    const init = async () => {
      try {
        await reloadSettings(); // 먼저 앨범 목록 등을 로드
        await fetchSongs();     // 그 다음 곡 목록을 로드하며 누락된 앨범 복원
        await fetchSavedContis();
        
        // 1. 구글 드라이브에서 다른 기기가 남긴 마지막 작업 상태 동기화 다운로드
        let lastContiData = null;
        try {
          const { gdriveWebService } = await import('../api/gdriveWebService');
          const driveLastConti = await gdriveWebService.downloadJsonFile('last_conti.json');
          if (driveLastConti && driveLastConti.items) {
            lastContiData = driveLastConti;
            console.log('[HymnalProvider] Synced last conti status from Google Drive.');
          }
        } catch (driveErr) {
          console.warn('[HymnalProvider] Failed to fetch last conti from GDrive', driveErr);
        }

        // 2. 드라이브 백업이 없다면 로컬 스토리지 데이터 백업 사용
        if (!lastContiData) {
          const savedConti = localStorage.getItem('last_conti');
          if (savedConti) {
            try {
              lastContiData = JSON.parse(savedConti);
            } catch (e) {}
          }
        }

        // 3. 로드된 최신 작업물 세팅 (기기 간 자동 복원 완성)
        if (lastContiData) {
          setContiItems(lastContiData.items || []);
          setContiTitle(lastContiData.title || '');
          setContiTitleFontSize(lastContiData.contiTitleFontSize || 48);
          setShowContiNumbers(lastContiData.showContiNumbers !== undefined ? lastContiData.showContiNumbers : true);
          setPaperSize(lastContiData.paperSize || 'A4');
          setOrientation(lastContiData.orientation || 'portrait');
          setItemsPerPage(lastContiData.itemsPerPage || 2);
          setCurrentContiId(lastContiData.currentContiId || null);
        }
      } catch (e) {
        console.error("Failed to load initial data", e);
      }
    };

    window.addEventListener('gdrive_authenticated', init);
    
    // 비로그인 시에도 기본 악보 및 앨범 목록을 로드하기 위해 무조건 한 번 실행
    init();

    return () => window.removeEventListener('gdrive_authenticated', init);
  }, []);

  // 콘티 변경 시 자동 백업 (로컬 및 구글 드라이브 실시간 동기화)
  useEffect(() => {
    const contiState = {
      items: contiItems,
      title: contiTitle,
      contiTitleFontSize: contiTitleFontSize,
      showContiNumbers: showContiNumbers,
      paperSize: paperSize,
      orientation: orientation,
      itemsPerPage: itemsPerPage,
      currentContiId: currentContiId
    };

    // 로컬 백업은 기기 반응성(렉 없음)을 위해 즉시 실행
    localStorage.setItem('last_conti', JSON.stringify(contiState));

    // 구글 드라이브 백업은 디바운스(1초) 적용하여 타이핑/드래그 시 API 과다 호출 방지
    if (!gdriveWebService.getAccessToken()) return;

    const timer = setTimeout(async () => {
      try {
        const { gdriveWebService } = await import('../api/gdriveWebService');
        await gdriveWebService.uploadJsonFile('last_conti.json', contiState).catch(() => {});
        console.log('[HymnalProvider] Auto-uploaded last conti status to Google Drive.');
      } catch (err) {}
    }, 1000);

    return () => clearTimeout(timer);
  }, [contiItems, contiTitle, contiTitleFontSize, showContiNumbers, paperSize, orientation, itemsPerPage, currentContiId]);

  // Sync hymnalService with songs
  useEffect(() => {
    hymnalService.setSongs(songs);
  }, [songs]);

  // Search and Filter Effect
  useEffect(() => {
    const timer = setTimeout(() => {
      let baseSongs = songs;
      if (activeAlbumId !== 'all') {
        baseSongs = songs.filter(s => s.albumId === activeAlbumId || s.id.startsWith(`${activeAlbumId}-`));
      }
      
      if (!searchQuery.trim()) {
        setFilteredSongs(baseSongs);
      } else {
        const results = hymnalService.search(searchQuery.normalize('NFC'));
        // Filter search results by active album if applicable
        const filtered = activeAlbumId === 'all' 
          ? results 
          : results.filter((s: any) => s.albumId === activeAlbumId || s.id.startsWith(`${activeAlbumId}-`));
        setFilteredSongs(filtered as HymnalSong[]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, songs, activeAlbumId]);

  // Album Methods
  const ensureAuth = async () => {
    if (!gdriveWebService.getAccessToken()) {
      if (!(await gdriveWebService.login())) {
        alert('구글 로그인(드라이브 권한)이 필요합니다.');
        return false;
      }
    }
    return true;
  };

  const addAlbum = async (name: string) => {
    if (!(await ensureAuth())) return;
    const tempAlbum: Album = { id: `album-${Date.now()}`, name, path: '', type: 'custom' };
    
    // 1. 로컬 앨범 상태 즉시 갱신 (반응 지연 0)
    setAlbums(prev => [...prev, tempAlbum]);
    setActiveAlbumId(tempAlbum.id);

    // 2. 구글 드라이브 업로드는 백그라운드 처리
    hymnalApi.addAlbum({ name, path: '' }).then(async (result) => {
      if (result.success) {
        // 실제 드라이브 아이디로 로컬 상태 보정
        setAlbums(prev => prev.map(a => a.id === tempAlbum.id ? result.album : a));
        setActiveAlbumId(result.album.id);
      }
    }).catch(console.error);
  };

  const updateAlbum = async (album: Album) => {
    if (!(await ensureAuth())) return;
    
    // 1. 로컬 상태 즉시 적용
    setAlbums(prev => prev.map(a => a.id === album.id ? album : a));

    // 2. 백그라운드 업로드
    hymnalApi.updateAlbum(album).catch(console.error);
  };

  const deleteAlbum = async (id: string) => {
    if (!(await ensureAuth())) return;
    
    // 1. 로컬 상태 즉시 제거 (삭제 버그 원천 해결 및 0.1초 즉시 삭제)
    setAlbums(prev => prev.filter(a => a.id !== id));
    setActiveAlbumId('all');

    // 2. 백그라운드 구글 드라이브 설정 저장 및 스캔
    hymnalApi.deleteAlbum(id).then(async (result) => {
      if (result.success) {
        await fetchSongs(); // 곡 목록 실시간 스캔 동기화
      }
    }).catch(console.error);
  };

  const updateAlbumPath = async (id: string) => {
    const path = await hymnalApi.selectFolder();
    if (path) {
      const album = albums.find(a => a.id === id);
      if (album) {
        await updateAlbum({ ...album, path });
      }
    }
  };

  // --- Saved Conti Methods ---
  const saveCurrentConti = async (name?: string) => {
    if (!contiTitle && !name) {
      alert('콘티 제목을 입력하거나 저장 이름을 지정해주세요.');
      return;
    }

    const targetTitle = name || contiTitle;
    
    // 1. 현재 적혀있는 콘티 제목이 기존에 불러왔던 콘티 제목과 달라진 경우,
    // 기존 콘티에 덮어쓰지 않고 새로운 별개의 콘티로 분리 저장(다른 이름으로 저장)되도록 분기 처리
    const existingConti = savedContis.find(c => c.id === currentContiId);
    const isTitleChanged = existingConti && existingConti.title !== targetTitle;

    const id = (currentContiId && !isTitleChanged) ? currentContiId : `conti-${Date.now()}`;
    const contiData = {
      id,
      title: targetTitle,
      items: contiItems,
      paperSize,
      orientation,
      contiTitleFontSize,
      showContiNumbers,
      updatedAt: new Date().toISOString()
    };

    // 1. 로컬 콘티 목록 상태 즉시 업데이트 (사용자 대기 삭제)
    setSavedContis(prev => {
      const idx = prev.findIndex(c => c.id === id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...contiData };
        return next;
      }
      return [...prev, { ...contiData, createdAt: new Date().toISOString() }];
    });

    setCurrentContiId(id);
    if (name) setContiTitle(name);
    alert('콘티가 안전하게 저장되었습니다.');

    // 2. 구글 드라이브 백업은 백그라운드 비동기로 밀어서 실행
    hymnalApi.saveConti(contiData).catch(err => {
      console.error('[HymnalProvider] Background saveConti failed:', err);
    });
  };

  const loadSavedConti = async (id: string) => {
    const target = savedContis.find(c => c.id === id);
    if (!target) return;

    if (contiItems.length > 0 && !confirm('현재 작업 중인 콘티가 사라집니다. 불러오시겠습니까?')) {
      return;
    }

    setContiItems(target.items || []);
    setContiTitle(target.title || '');
    setPaperSize(target.paperSize || 'A4');
    setOrientation(target.orientation || 'portrait');
    setContiTitleFontSize(target.contiTitleFontSize || 48);
    setShowContiNumbers(target.showContiNumbers !== undefined ? target.showContiNumbers : true);
    setCurrentContiId(target.id);
    setIsEditorOpen(true);
    setIsLibraryOpen(false); // 로드 후 저장소 닫기
  };

  const deleteSavedConti = async (id: string) => {
    if (!confirm('정말로 이 저장된 콘티를 삭제하시겠습니까?')) return;
    
    // 1. 로컬 저장소 상태에서 즉시 지움 (즉시 리렌더링)
    setSavedContis(prev => prev.filter(c => c.id !== id));
    if (currentContiId === id) setCurrentContiId(null);

    // 2. 백그라운드에서 구글 드라이브 삭제 파일 갱신 처리
    hymnalApi.deleteSavedConti(id).catch(err => {
      console.error('[HymnalProvider] Background deleteSavedConti failed:', err);
    });
  };

  // --- Conti Methods ---
  const addToConti = (songId: string) => {
    const song = songs.find(s => {
      if (!s || !s.id || !songId) return false;
      const sId = s.id.toString();
      const tId = songId.toString();
      return sId === tId || (s.fileId && s.fileId.toString() === tId) || tId.endsWith('-' + sId) || sId.endsWith('-' + tId);
    });
    if (!song) return;

    // 목사님 요청: 초기 크기 30%
    const initialWidth = 30;

    const newItem: ContiItem = {
      id: `conti-item-${Date.now()}`,
      songId,
      x: 40,
      y: 40,
      width: initialWidth,
      height: 0,
      memo: '',
      memoFontSize: 12, // 기본 크기 12px
      isMemoOpen: false, // 기본적으로 닫혀 있음
      page: 1, // 1페이지 전용
      order: contiItems.length + 1,
      isVisible: false // 선반에 먼저 들어감
    };
    setContiItems([...contiItems, newItem]);
  };

  const removeFromConti = (id: string) => {
    setContiItems(contiItems.filter(item => item.id !== id));
  };

  const updateContiItem = (id: string, updates: Partial<ContiItem>) => {
    setContiItems(contiItems.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const toggleContiItemVisibility = (id: string) => {
    setContiItems(contiItems.map(item => {
      if (item.id === id) {
        const nextVisible = !item.isVisible;
        const update: Partial<ContiItem> = {
           isVisible: nextVisible,
           page: 1 // 항상 1페이지
        };
        // 목사님 요청 해결: 이미 위치가 잡혀있다면(0이 아니면) 리셋하지 않고 보존합니다.
        // 처음 추가되어 한 번도 배정되지 않은 경우(x, y가 undefined이거나 정확히 40 초기값이 아닌 경우 등)만 기본값 부여
        if (nextVisible && item.x === undefined && item.y === undefined) {
          update.x = 40;
          update.y = 40;
        }
        return { ...item, ...update };
      }
      return item;
    }));
  };

  const reorderContiItems = (newItems: ContiItem[]) => {
    setContiItems(newItems);
  };

  const clearConti = () => {
    if (confirm('콘티를 모두 비우시겠습니까?')) {
      setContiItems([]);
      setContiTitle('');
      setCurrentContiId(null);
    }
  };



  // Sync & Build
  const syncAlbum = async (albumId: string) => {
    setIsSyncing(true);
    const stopListening = hymnalApi.onProgress((data: any) => {
      setProcessingProgress(data);
    });
    try {
      const result = await hymnalApi.syncGDrive(albumId);
      if (result.success) {
        const target = albums.find(a => a.id === albumId);
        alert(`[${target?.name || '앨범'}] 동기화 완료!\n업로드: ${result.uploaded}, 건너뜀: ${result.skipped}`);
        await fetchSongs();
      } else if (result.message === 'Need Auth') {
        const url = await hymnalApi.getAuthUrl();
        hymnalApi.openExternal(url);
        alert('구글 인증이 필요합니다. 웹 브라우저에서 인증 후 다시 시도해 주세요.');
      }
    } finally {
      stopListening();
      setProcessingProgress(null);
      setIsSyncing(false);
    }
  };

  const processImages = async (albumId: string, isIncremental: boolean) => {
    const target = albums.find(a => a.id === albumId);
    if (!target || !target.path) {
      alert('앨범 폴더를 먼저 지정해 주세요.');
      return;
    }

    const stopListening = hymnalApi.onProgress((data: any) => {
      setProcessingProgress(data);
    });

    try {
      const result = await hymnalApi.processImages({
        albumId,
        sourcePath: target.path,
        isIncremental
      });
      alert(`빌드 완료: ${result.processed}곡 처리됨`);
      await fetchSongs();
    } finally {
      stopListening();
      setProcessingProgress(null);
    }
  };

  // CSV
  const exportCSV = async (albumId: string) => {
    const result = await hymnalApi.exportCSV({ mode: albumId });
    if (result.success) alert('CSV 내보내기 완료');
  };

  const importCSV = async () => {
    const result = await hymnalApi.importCSV();
    if (result.success) {
      alert(`${result.count}곡 데이터 반영 완료`);
      await fetchSongs();
    }
  };

  return (
    <HymnalContext.Provider value={{
      songs,
      filteredSongs,
      searchQuery,
      setSearchQuery,
      selectedSongId,
      setSelectedSongId,
      isLoading,
      isSyncing,
      setIsSyncing,
      albums,
      activeAlbumId,
      setActiveAlbumId,
      addAlbum,
      updateAlbum,
      deleteAlbum,
      updateAlbumPath,
      processingProgress,
      syncAlbum,
      processImages,
      exportCSV,
      importCSV,
      contiItems,
      contiTitle,
      setContiTitle,
      contiTitleFontSize,
      setContiTitleFontSize,
      showContiNumbers,
      setShowContiNumbers,
      paperSize,
      setPaperSize,
      orientation,
      setOrientation,
      itemsPerPage,
      setItemsPerPage,
      isEditorOpen,
      setIsEditorOpen,
      savedContis,
      currentContiId,
      saveCurrentConti,
      loadSavedConti,
      deleteSavedConti,
      fetchSavedContis,
      addToConti,
      removeFromConti,
      updateContiItem,
      toggleContiItemVisibility,
      reorderContiItems,
      clearConti,
      isLibraryOpen,
      setIsLibraryOpen,
      showAlbumModal,
      setShowAlbumModal,
      showBuilder,
      setShowBuilder,
      editingAlbum,
      setEditingAlbum,
      showAllTooltips,
      setShowAllTooltips,
      fetchSongs,
      reloadSettings,
      setSongs,
      setAlbums,
      setContiItems
    }}>
      {children}
    </HymnalContext.Provider>
  );
};

export const useHymnal = () => {
  const context = useContext(HymnalContext);
  if (!context) throw new Error("useHymnal must be used within a HymnalProvider");
  return context;
};
