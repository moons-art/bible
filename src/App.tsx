import React, { useState, useEffect, useRef } from 'react';
import { BibleProvider } from './stores/BibleProvider';
import { useBible } from './stores/BibleContext';
import { FileUploader } from './components/FileUploader';
import { BibleViewer } from './components/BibleViewer';
import { SermonSidebar, type SermonSidebarRef, type DockPosition } from './components/SermonSidebar';
import { 
  Menu, Search, BookOpen, Settings, X, Plus, Check, 
  ChevronLeft, ChevronRight, ChevronDown, Trash2, 
  FileEdit, Eye, EyeOff, WifiOff 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { searchService, type SearchRange } from './services/searchService';
import { BIBLE_BOOKS, BIBLE_LIST } from './constants/bibleMeta';
import { initGoogleApi, IS_LOCAL_DEV } from './api/gdriveWebService';
import { TooltipIcon } from './components/TooltipIcon';

const AdminModal = React.lazy(() => import('./components/AdminModal').then(m => ({ default: m.AdminModal })));

// --- Bible Navigation Bar Component ---
interface BibleNavBarProps {
  side: 'left' | 'right';
  nav: { bookId: string; chapter: number; verse?: number };
  setNav: (update: any) => void;
  onPrev: () => void;
  onNext: () => void;
  onQuickNav: (query: string) => boolean;
  // 좌측 전용
  showCopySettings?: boolean;
  copyMode?: any;
  setCopyMode?: (m: any) => void;
  showVersionInCopy?: boolean;
  setShowVersionInCopy?: (v: boolean) => void;
  // 우측 전용
  showVersionSelector?: boolean;
  availableVersions?: any[];
  currentVersionId?: string;
  onVersionChange?: (id: string) => void;
}

const BibleNavBar: React.FC<BibleNavBarProps> = ({
  side, nav, setNav, onPrev, onNext, onQuickNav,
  showCopySettings, copyMode, setCopyMode, showVersionInCopy, setShowVersionInCopy,
  showVersionSelector, availableVersions, currentVersionId, onVersionChange
}) => {
  const [localQuery, setLocalQuery] = useState('');

  const handleSearch = (val?: string) => {
    const query = val !== undefined ? val : localQuery;
    if (query.trim()) {
      const success = onQuickNav(query);
      if (success) {
        return true;
      }
    }
    return false;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalQuery(val);
    
    const trimmed = val.trim();
    const navPattern = /^([1-3]?[가-힣]{1,3})\s*(\d+)/; 
    if (navPattern.test(trimmed)) {
      handleSearch(trimmed);
    }
  };

  return (
    <div className={`flex flex-nowrap items-center gap-x-1.5 p-1.5 bg-white border-b border-slate-200 shadow-sm sticky top-0 z-20 overflow-x-auto custom-scrollbar ${side === 'right' ? 'bg-slate-50/50' : ''}`}>
      {/* 1. Quick Find Input with Search Button */}
      <div className="relative group w-28 sm:w-32 shrink-0">
        <input 
          type="text"
          value={localQuery}
          onChange={handleChange}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="성경구절(창 1)"
          className="w-full h-8 bg-slate-100 border border-slate-300 rounded-md pl-2 pr-6 text-[10px] font-black text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-red-400 focus:ring-1 focus:ring-red-500/5 transition-all outline-none"
        />
        <button 
          onClick={() => handleSearch()}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-slate-600 hover:text-red-600 transition-colors"
          title="구절 찾기"
        >
          <Search className="w-4 h-4 stroke-[2.5px]" />
        </button>
      </div>

      <div className="flex items-center gap-0.5 bg-slate-100 rounded-md p-0.5 border border-slate-200 shrink-0">
        {/* Book Selector */}
        <div className="relative group">
          <select 
            value={nav.bookId}
            onChange={(e) => setNav({ bookId: e.target.value, chapter: 1, verse: undefined })}
            className="bg-transparent text-[11px] font-black text-slate-800 pl-1.5 pr-4 py-1 outline-none appearance-none cursor-pointer hover:bg-white rounded-md transition-colors min-w-[45px]"
          >
            {BIBLE_LIST.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" />
        </div>
        
        <div className="w-px h-3 bg-slate-200"></div>

        {/* Chapter Selector */}
        <div className="relative group">
          <select 
            value={nav.chapter}
            onChange={(e) => setNav({ ...nav, chapter: parseInt(e.target.value, 10), verse: undefined })}
            className="bg-transparent text-[11px] font-black text-slate-800 pl-1.5 pr-4 py-1 outline-none appearance-none cursor-pointer hover:bg-white rounded-md transition-colors min-w-[32px]"
          >
            {Array.from({ length: BIBLE_LIST.find(b => b.id === nav.bookId)?.chapters || 1 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}장</option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" />
        </div>

        <div className="w-px h-3 bg-slate-200"></div>

        {/* Verse Selector */}
        <div className="relative group">
          <select 
            value={nav.verse || ''}
            onChange={(e) => setNav({ ...nav, verse: e.target.value ? parseInt(e.target.value, 10) : undefined })}
            className="bg-transparent text-[11px] font-black text-slate-800 pl-1.5 pr-4 py-1 outline-none appearance-none cursor-pointer hover:bg-white rounded-md transition-colors min-w-[32px]"
          >
            <option value="">절</option>
            {Array.from({ length: 150 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}절</option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" />
        </div>

        <div className="w-px h-3 bg-slate-200"></div>

        {/* Navigation Buttons */}
        <div className="flex items-center px-0.5">
          <button onClick={onPrev} className="p-1 hover:bg-white rounded text-slate-400 hover:text-red-600 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={onNext} className="p-1 hover:bg-white rounded text-slate-400 hover:text-red-600 transition-colors"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
};

// 검색 성능 최적화를 위한 독립 입력 컴포넌트
const SearchInput = React.memo<{
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  className: string;
}>(({ value, onChange, placeholder, className }) => {
  const [localValue, setLocalValue] = React.useState(value);
  const lastSentValue = React.useRef(value);

  React.useEffect(() => {
    if (value !== lastSentValue.current) {
      setLocalValue(value);
      lastSentValue.current = value;
    }
  }, [value]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        lastSentValue.current = localValue;
        onChange(localValue);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [localValue, value, onChange]);

  return (
    <input 
      type="text"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );
});

const MainApp: React.FC = () => {
  // 구글 API 초기화
  const [, setIsApiLoaded] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(IS_LOCAL_DEV);
  const [userProfile, setUserProfile] = useState<{name: string, email: string, picture: string} | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showAdminModal, setShowAdminModal] = useState(false);

  React.useEffect(() => {
    initGoogleApi(() => {
      console.log('[App] Google API successfully initialized.');
      setIsApiLoaded(true);
    });

    const handleAuth = async () => {
      setIsAuthenticated(true);
      const { gdriveWebService, fetchUserProfile } = await import('./api/gdriveWebService');
      const token = gdriveWebService.getAccessToken();
      if (token && token !== 'mock_local_token_123') {
        const profile = await fetchUserProfile(token);
        if (profile) {
          setUserProfile(profile);
          const { logActivity } = await import('./utils/logger');
          logActivity('로그인');
        }
      }
    };
    
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('gdrive_authenticated', handleAuth);
    
    return () => {
      window.removeEventListener('gdrive_authenticated', handleAuth);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const { 
    versions, 
    selectedVersionIds, 
    toggleVersion, 
    removeVersion, 
    clearAllVersions, 
    addVersion,
    copyMode,
    setCopyMode,
    showVersionInCopy,
    setShowVersionInCopy,
    lineHeight,
    setLineHeight,
    verseData,
    showAnnotations,
    setShowAnnotations
  } = useBible();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [searchFontSize, setSearchFontSize] = useState(14);

  const sermonSidebarRef = useRef<SermonSidebarRef>(null);

  // Sermon Sidebar state
  const [sermonDockPosition, setSermonDockPosition] = useState<DockPosition>(() => {
    const saved = localStorage.getItem('bible-app-sermon-dock');
    return (saved as DockPosition) || 'right';
  });

  useEffect(() => {
    localStorage.setItem('bible-app-sermon-dock', sermonDockPosition);
  }, [sermonDockPosition]);

  const [isSermonCollapsed, setIsSermonCollapsed] = useState(false);
  const [sermonSidebarWidth, setSermonSidebarWidth] = useState(360);
  const [sermonSidebarHeight, setSermonSidebarHeight] = useState(350);

  const toggleSermonSidebar = () => {
    if (isSermonSidebarOpen) {
      if (sermonSidebarRef.current && !sermonSidebarRef.current.isFullyOpenOnRight()) {
        sermonSidebarRef.current.resetToRightAndOpen();
      } else {
        if (window.confirm("작성 중인 내용을 임시 저장하고 닫으시겠습니까?")) {
          setIsSermonSidebarOpen(false);
        }
      }
    } else {
      setIsSermonSidebarOpen(true);
      setTimeout(() => {
        sermonSidebarRef.current?.resetToRightAndOpen();
      }, 50);
    }
  };
  
  // Search popovers
  const [showNoteSearch, setShowNoteSearch] = useState(false);
  const [showSermonSearch, setShowSermonSearch] = useState(false);
  const [noteSearchQuery, setNoteSearchQuery] = useState('');
  const [sermonSearchQuery, setSermonSearchQuery] = useState('');
  
  const [isSermonSidebarOpen, setIsSermonSidebarOpen] = useState(false);
  const [clipboardSermonText, setClipboardSermonText] = useState<string | null>(null);

  // 듀얼 뷰 상태
  const [isDualView, setIsDualView] = useState(false);
  
  // 듀얼 뷰 리사이저 상태
  const [splitPosition, setSplitPosition] = useState<number>(() => {
    const saved = localStorage.getItem('bibleSplitPosition');
    return saved ? parseFloat(saved) : 50;
  });
  const [isResizing, setIsResizing] = useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    localStorage.setItem('bibleSplitPosition', splitPosition.toString());
  }, [splitPosition]);

  // 마우스/터치 드래그 이벤트 핸들러
  React.useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isResizing || !contentRef.current) return;
      
      const containerRect = contentRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const newX = clientX - containerRect.left;
      const newPercent = (newX / containerRect.width) * 100;
      
      if (newPercent >= 20 && newPercent <= 80) {
        setSplitPosition(newPercent);
      }
    };

    const handleUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isResizing]);

  // Navigation State
  const [leftNav, setLeftNav] = useState({ bookId: 'GEN', chapter: 1, verse: 1, scrollTrigger: 0 });
  const [rightNav, setRightNav] = useState({ bookId: 'GEN', chapter: 1, verse: 1, scrollTrigger: 0 });
  
  // 우측 창 전용 번역본 상태 (단일 선택)
  const [rightSelectedVersionId, setRightSelectedVersionId] = useState<string>('built-in-krv');

  const [searchQuery, setSearchQuery] = useState('');
  
  // Search Options State
  const [searchMode, setSearchMode] = useState<'standard' | 'semantic'>('standard');
  const [logicMode, setLogicMode] = useState<'AND' | 'OR'>('AND');
  const [matchMode, setMatchMode] = useState<'partial' | 'exact'>('partial');
  const [searchRange, setSearchRange] = useState<SearchRange>('all');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    const handleOpenCrossRef = (e: any) => {
      const query = e.detail?.query;
      if (query) {
        setIsDualView(true);
        handleQuickNav(query, 'right');
      }
    };
    window.addEventListener('open_cross_reference', handleOpenCrossRef);
    return () => window.removeEventListener('open_cross_reference', handleOpenCrossRef);
  }, []);

  // 퀵 서치 처리 로직
  const handleQuickNav = (query: string, side: 'left' | 'right') => {
    const trimmed = query.trim();
    const navPattern = /^([1-3]?[가-힣]{1,3})\s*(\d+)(?:[ :.\s]+(\d+))?$/;
    const match = trimmed.match(navPattern);

    if (match) {
      const [, bookName, chapterStr, verseStr] = match;
      
      const bookId = BIBLE_BOOKS[bookName];
      const book = bookId ? BIBLE_LIST.find(b => b.id === bookId) : BIBLE_LIST.find(b => 
        b.name === bookName || 
        (b as any).shortName === bookName || 
        bookName === b.name.substring(0, 2) ||
        bookName === b.name.substring(0, 1)
      );

      if (book) {
        const ch = chapterStr ? parseInt(chapterStr, 10) : 1;
        const vs = verseStr ? parseInt(verseStr, 10) : 1;
        
        const update = { bookId: book.id, chapter: ch, verse: vs };
        if (side === 'left') setLeftNav(update);
        else setRightNav(update);
        return true;
      }
    }
    return false;
  };

  // Unified Search Logic - Side Search Panel
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchQuery.trim();
      const isNavPattern = /^([1-3]?[가-힣]{1,3})\s*(\d+)(?:[ :.\s]+(\d+))?$/.test(trimmed);
      
      if (!isNavPattern && trimmed.length >= 2) {
        const normalizedQuery = trimmed.normalize('NFC');
        const results = searchService.search(normalizedQuery, selectedVersionIds, {
          matchMode: searchMode === 'semantic' ? 'partial' : matchMode,
          logicMode: searchMode === 'semantic' ? 'OR' : logicMode,
          range: searchRange,
          currentBookId: leftNav.bookId,
          searchMode: searchMode
        });
        setSearchResults(results);
      } else if (!isNavPattern) {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedVersionIds, searchRange, leftNav.bookId, searchMode, logicMode, matchMode]);

  const handlePrevChapter = (side: 'left' | 'right') => {
    const nav = side === 'left' ? leftNav : rightNav;
    const setNav = side === 'left' ? setLeftNav : setRightNav;

    if (nav.chapter > 1) {
      setNav({ ...nav, chapter: nav.chapter - 1, verse: undefined });
    } else {
      const currentIndex = BIBLE_LIST.findIndex(b => b.id === nav.bookId);
      if (currentIndex > 0) {
        const prevBook = BIBLE_LIST[currentIndex - 1];
        setNav({ bookId: prevBook.id, chapter: prevBook.chapters, verse: undefined });
      }
    }
  };

  const handleNextChapter = (side: 'left' | 'right') => {
    const nav = side === 'left' ? leftNav : rightNav;
    const setNav = side === 'left' ? setLeftNav : setRightNav;
    const currentBook = BIBLE_LIST.find(b => b.id === nav.bookId);

    if (currentBook && nav.chapter < currentBook.chapters) {
      setNav({ ...nav, chapter: nav.chapter + 1, verse: undefined });
    } else {
      const currentIndex = BIBLE_LIST.findIndex(b => b.id === nav.bookId);
      if (currentIndex < BIBLE_LIST.length - 1) {
        const nextBook = BIBLE_LIST[currentIndex + 1];
        setNav({ bookId: nextBook.id, chapter: 1, verse: undefined });
      }
    }
  };

  return (
    <div className="flex h-screen bg-background text-slate-200 overflow-y-auto overflow-x-hidden font-sans custom-scrollbar">
      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "fit-content", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="glass border-r border-slate-200 h-full relative z-30 bg-white shadow-xl shrink-0 group/sidebar"
          >
            {/* Sidebar Collapse Button */}
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-12 bg-white border border-slate-200 rounded-full shadow-md flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-slate-50 transition-all z-40 opacity-0 group-hover/sidebar:opacity-100"
              title="사이드바 접기"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="p-5 h-full flex flex-col w-[16vw] min-w-[180px] max-w-[260px]">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h1 className="font-bold bg-gradient-to-r from-red-600 to-red-400 bg-clip-text text-transparent flex items-baseline gap-1.5">
                  <span className="text-[10px] uppercase tracking-tighter opacity-80">nations</span>
                  <span className="text-xl">바이블</span>
                </h1>
                <BookOpen className="w-5 h-5 text-red-500" />
              </div>

              {/* Auth (Login / Profile) Section */}
              <div className="mb-6 relative z-10">
                {!isAuthenticated ? (
                  <div className="relative">
                    <button
                      onClick={async () => {
                        const { gdriveWebService } = await import('./api/gdriveWebService');
                        const success = await gdriveWebService.login();
                        if (success) {
                          await gdriveWebService.getOrCreateFolder('CEUM_Bible_Data');
                          setTimeout(() => window.dispatchEvent(new Event('gdrive_authenticated')), 500);
                        } else {
                          alert('로그인 실패: 구글 인증이 완료되지 않았습니다.');
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2.5 py-3 px-3 bg-white border border-slate-200 text-slate-700 rounded-xl shadow-sm hover:shadow-md hover:border-slate-300 hover:bg-slate-50 transition-all active:scale-[0.97] group relative overflow-hidden"
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      <div className="flex flex-col items-start leading-tight">
                        <span className="text-[13px] font-extrabold tracking-tight">Google</span>
                        <span className="text-[13px] font-extrabold tracking-tight">로그인</span>
                      </div>
                    </button>
                    
                    <div className="absolute top-2 right-2">
                      <TooltipIcon text="개인사용자화를 위해 구글 계정으로 로그인하세요. 모든 기기에서 노트와 설정이 실시간 연동됩니다." />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col bg-slate-50 border border-slate-200 p-3 rounded-2xl gap-3 shadow-sm">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      {userProfile?.picture ? (
                        <img src={userProfile.picture} alt="Profile" className="w-9 h-9 rounded-full shadow-sm shrink-0 border border-slate-200" />
                      ) : (
                        <div className="w-9 h-9 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm font-black shrink-0 border border-indigo-200">
                          {userProfile?.name?.charAt(0) || 'U'}
                        </div>
                      )}
                      
                      <div className="flex flex-col flex-1 min-w-0 pr-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-black text-slate-800 truncate">{userProfile?.name || '사용자'}</span>
                          {isOffline && (
                            <div className="shrink-0 p-0.5 bg-red-100 rounded-full" title="오프라인 모드">
                              <WifiOff className="w-3 h-3 text-red-500" />
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] font-medium text-slate-500 truncate leading-tight">{userProfile?.email || ''}</span>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => {
                        if (confirm('로그아웃 하시겠습니까?')) {
                          localStorage.removeItem('gdrive_token');
                          localStorage.removeItem('gdrive_token_expires_at');
                          window.location.reload();
                        }
                      }}
                      className="w-full flex items-center justify-center py-2 text-xs font-black text-red-600 bg-white hover:bg-red-50 hover:text-red-700 rounded-xl transition-all border border-red-100 shadow-sm"
                    >
                      로그아웃
                    </button>
                  </div>
                )}
              </div>

              {/* Bible Sidebar Content */}
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-3 px-2">
                    <div className="flex items-center">
                      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">번역본 목록</h2>
                      <TooltipIcon text="번역본을 업로드 하면 구글드라이브에 저장되어 사용자가 로그인하면 항상 표시 됩니다." />
                    </div>
                    <div className="flex items-center gap-1">
                      {versions.length > 0 && (
                        <button 
                          onClick={() => {
                            if (confirm('모든 번역본을 삭제하시겠습니까?')) {
                              clearAllVersions();
                            }
                          }}
                          className="p-1 hover:bg-red-500/10 rounded-md transition-colors text-red-400/60 hover:text-red-400"
                          title="모든 번역본 삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <button 
                        onClick={() => {
                          if (!isAuthenticated) {
                            alert('번역본을 추가하려면 먼저 구글 계정으로 로그인해 주세요.');
                            return;
                          }
                          setShowUploadModal(true);
                        }}
                        className="p-1 hover:bg-slate-100 rounded-md transition-colors text-red-500"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    {versions.length === 0 ? (
                      <p className="text-xs text-slate-400 px-2 italic">번역본을 추가해주세요.</p>
                    ) : (
                      versions.map((v) => (
                        <div
                          key={v.id}
                          className={`
                            group flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-all duration-200
                            ${selectedVersionIds.includes(v.id) ? 'bg-red-50 text-red-700 ring-1 ring-red-100' : 'hover:bg-slate-50 text-slate-600'}
                          `}
                          onClick={() => toggleVersion(v.id)}
                        >
                          <div className={`
                            w-4 h-4 shrink-0 rounded-md border flex items-center justify-center transition-colors
                            ${selectedVersionIds.includes(v.id) ? 'bg-red-500 border-red-500' : 'border-slate-200'}
                          `}>
                            {selectedVersionIds.includes(v.id) && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <span className="flex-1 text-[13px] font-bold tracking-tighter truncate leading-tight">{v.name}</span>
                          
                          {!v.isSystem && !v.isBuiltIn && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`'${v.name}' 번역본을 삭제하시겠습니까?`)) {
                                  removeVersion(v.id);
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-100 rounded-md transition-all opacity-0 group-hover:opacity-100"
                              title="이 번역본 삭제"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Footer Settings */}
              <div className="mt-auto pt-6 border-t border-slate-100">
                <div className="flex items-center gap-2 px-4 py-3 w-full hover:bg-slate-50 rounded-xl transition-colors text-slate-500 hover:text-red-600">
                  <button 
                    onClick={() => setShowSettings(true)}
                    className="flex items-center gap-3 flex-1"
                  >
                    <Settings className="w-5 h-5" />
                    <span className="text-sm font-medium">설정</span>
                  </button>
                  <TooltipIcon text="성경 글자 크기, 글꼴 줄간격 수정" />
                </div>
                <div className="mt-4 px-4 text-center">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">제작: CEUM ministry</p>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="flex-1 flex overflow-hidden">
        <div className={`flex flex-col flex-1 overflow-hidden bg-white ${isSearchOpen ? 'w-2/3' : 'w-full'}`}>
          <main 
            className="flex-1 flex flex-col relative z-10 overflow-hidden transition-all duration-75"
            style={{
              marginRight: isSermonSidebarOpen && sermonDockPosition === 'right' && !isSermonCollapsed && !isSearchOpen ? `${sermonSidebarWidth}px` : 0,
              marginBottom: isSermonSidebarOpen && sermonDockPosition === 'bottom' && !isSermonCollapsed ? `${sermonSidebarHeight}px` : 0,
            }}
          >
            {/* Header */}
            <header className="min-h-16 border-b border-slate-200 flex items-center px-4 md:px-6 py-3 gap-4 bg-white sticky top-0 z-30 shadow-sm overflow-x-auto custom-scrollbar flex-col xl:flex-row">
              
              {/* Row 1: Sidebar Toggle, Copy Menu, Search Note/Annotation */}
              <div className="flex items-center gap-3 shrink-0 flex-nowrap w-full xl:w-auto">
                <div className="flex items-center shrink-0">
                  <button 
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="p-2.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-600 shrink-0 shadow-sm border border-transparent hover:border-slate-200"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex items-center gap-3 shrink-0 flex-nowrap">
                  {/* 복사 메뉴 */}
                  <div className="flex items-center bg-slate-100 rounded-lg border border-slate-200 p-1 shadow-inner shrink-0 whitespace-nowrap">
                    {['default', 'niv+krv', 'all'].map((m) => (
                      <button 
                        key={m} 
                        onClick={() => setCopyMode(m as any)}
                        className={`px-3 py-1.5 rounded-md text-xs tracking-tight font-black transition-all ${copyMode === m ? 'bg-white text-indigo-600 shadow-md ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                      >
                        {m === 'default' ? '개역' : m === 'niv+krv' ? '개역+NIV' : '전체 복사'}
                      </button>
                    ))}
                    <div className="w-px h-4 bg-slate-300 mx-1.5"></div>
                    <button 
                      onClick={() => setShowVersionInCopy(!showVersionInCopy)}
                      className={`px-3 py-1.5 rounded-md text-xs tracking-tight font-black transition-all ${!showVersionInCopy ? 'bg-white text-red-600 shadow-md ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                    >
                      번역본 숨기기
                    </button>
                  </div>

                  <div className="hidden sm:block w-px h-6 bg-slate-200 mx-1 shrink-0"></div>

                  {/* 검색 및 주석보기 */}
                  <div className="flex items-center gap-2 shrink-0 flex-nowrap">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowNoteSearch(true); }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-50 border border-yellow-200 hover:bg-yellow-100 text-xs font-extrabold text-yellow-700 transition-colors shadow-sm whitespace-nowrap"
                    >
                      <Search className="w-4 h-4" /> 주석검색
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowSermonSearch(true); }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-xs font-extrabold text-emerald-700 transition-colors shadow-sm whitespace-nowrap"
                    >
                      <Search className="w-4 h-4" /> 노트검색
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowAnnotations(!showAnnotations); }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-xs font-extrabold text-slate-600 transition-colors shadow-sm whitespace-nowrap"
                    >
                      {showAnnotations ? <EyeOff className="w-4 h-4 text-slate-400" /> : <Eye className="w-4 h-4 text-indigo-500" />}
                      주석 {showAnnotations ? '숨기기' : '보기'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 2: Dual View, Sermon Note, Bible Search, Settings */}
              <div className="flex flex-nowrap items-center gap-3 w-full xl:w-auto xl:ml-auto border-t xl:border-t-0 border-slate-100 pt-3 xl:pt-0 shrink-0">
                <button 
                  onClick={() => {
                    if (!isDualView) {
                      setRightSelectedVersionId('built-in-krv');
                      setRightNav({ ...leftNav });
                    }
                    setIsDualView(!isDualView);
                  }}
                  className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl transition-all shadow-sm active:scale-95 border ${isDualView ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100'} whitespace-nowrap shrink-0`}
                >
                  <div className="flex gap-1 shrink-0">
                    <div className={`w-1.5 h-4 rounded-sm ${isDualView ? 'bg-white' : 'bg-indigo-400'}`} />
                    <div className={`w-1.5 h-4 rounded-sm ${isDualView ? 'bg-white/60' : 'bg-indigo-200'}`} />
                  </div>
                  <span className="text-sm font-black tracking-tight shrink-0">본문 듀얼뷰</span>
                </button>

                <button 
                  onClick={(e) => { e.stopPropagation(); toggleSermonSidebar(); }}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-extrabold transition-all shadow-md hover:shadow-lg active:scale-95 border border-indigo-700 whitespace-nowrap shrink-0"
                >
                  <FileEdit className="w-4 h-4 shrink-0" /> 
                  설교노트
                </button>

                <div className="ml-auto flex items-center gap-3 shrink-0">
                  <button 
                    onClick={() => setIsSearchOpen(!isSearchOpen)}
                    className={`flex items-center gap-2 px-5 py-2 rounded-xl transition-all duration-300 shadow-sm border ${isSearchOpen ? 'bg-red-600 text-white border-red-700' : 'bg-red-50 text-red-600 hover:bg-red-100 border-red-200'} whitespace-nowrap shrink-0`}
                  >
                    <Search className={`w-4 h-4 shrink-0 ${isSearchOpen ? 'animate-pulse' : ''}`} />
                    <span className="text-sm font-black whitespace-nowrap shrink-0">성경 검색</span>
                  </button>
                  <button 
                    onClick={() => setShowSettings(true)}
                    className="p-2.5 bg-slate-50 hover:bg-slate-200 rounded-xl text-slate-500 transition-colors border border-slate-200 shrink-0"
                  >
                    <Settings className="w-5 h-5 shrink-0" />
                  </button>
                </div>
              </div>
            </header>

            {/* Content Area */}
            <div ref={contentRef} className="flex-1 overflow-hidden relative bg-slate-50">
              {versions.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-white">
                  <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-8 border border-slate-100">
                    <BookOpen className="w-10 h-10 text-slate-300" />
                  </div>
                  <h2 className="text-2xl font-bold mb-4 text-slate-900">시작하기</h2>
                  <p className="text-slate-500 text-center max-w-md mb-8">
                    PC에 있는 성경 PDF 또는 TXT 파일을 업로드하여 사용하세요. <br/>
                    여러 번역본을 동시에 비교하며 볼 수 있습니다.
                  </p>
                  <button 
                    onClick={() => setShowUploadModal(true)}
                    className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-all shadow-lg shadow-red-200 hover:scale-105"
                  >
                    성경 파일 업로드하기
                  </button>
                </div>
              ) : selectedVersionIds.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 p-12 italic">
                  <p>왼쪽 사이드바에서 표시할 성경 번역본을 체크해 주세요.</p>
                </div>
              ) : (
                <div className="flex h-full overflow-hidden bg-slate-100 relative">
                  {/* Left Pane (Main) */}
                  <div 
                    className={`flex flex-col bg-white shadow-inner relative z-10 ${isDualView ? 'border-r border-slate-200' : 'w-full'}`}
                    style={{ width: isDualView ? `${splitPosition}%` : '100%' }}
                  >
                    <BibleNavBar 
                      side="left"
                      nav={leftNav}
                      setNav={setLeftNav}
                      onPrev={() => handlePrevChapter('left')}
                      onNext={() => handleNextChapter('left')}
                      onQuickNav={(q) => handleQuickNav(q, 'left')}
                      showCopySettings={true}
                      copyMode={copyMode}
                      setCopyMode={setCopyMode}
                      showVersionInCopy={showVersionInCopy}
                      setShowVersionInCopy={setShowVersionInCopy}
                    />
                    <div className="flex-1 overflow-hidden">
                       <BibleViewer 
                        key={`left-${leftNav.bookId}-${leftNav.chapter}-${leftNav.verse}-${leftNav.scrollTrigger}-${selectedVersionIds.join(',')}`}
                        selectedVersions={versions.filter(v => selectedVersionIds.includes(v.id))} 
                        currentBookId={leftNav.bookId}
                        currentChapter={leftNav.chapter}
                        highlightVerse={leftNav.verse}
                        fontSize={fontSize}
                        lineHeight={lineHeight}
                        isMainPane={true}
                        onCopyToSermon={(text) => {
                          setClipboardSermonText(text);
                          setIsSermonSidebarOpen(true);
                        }}
                        onNavigateToDualView={(bId, chapter, verse) => {
                          setIsDualView(true);
                          setRightNav({ bookId: bId, chapter, verse, scrollTrigger: Date.now() });
                        }}
                      />
                    </div>
                  </div>

                  {/* Resizer Bar */}
                  {isDualView && (
                    <div 
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setIsResizing(true);
                      }}
                      onTouchStart={() => {
                        setIsResizing(true);
                      }}
                      className="absolute top-0 bottom-0 z-30 w-8 -ml-4 cursor-col-resize group flex items-center justify-center transition-all hover:bg-red-500/10 active:bg-red-500/20 touch-none"
                      style={{ left: `${splitPosition}%` }}
                    >
                      <div className="w-1.5 h-full bg-slate-400 group-hover:bg-red-50 transition-colors opacity-50 group-hover:opacity-100" />
                    </div>
                  )}

                  {/* Right Pane (Reference) */}
                  {isDualView && (
                    <div 
                      className="flex flex-col bg-white relative z-0 border-l border-slate-200"
                      style={{ width: `${100 - splitPosition}%` }}
                    >
                      <BibleNavBar 
                        side="right"
                        nav={rightNav}
                        setNav={setRightNav}
                        onPrev={() => handlePrevChapter('right')}
                        onNext={() => handleNextChapter('right')}
                        onQuickNav={(q) => handleQuickNav(q, 'right')}
                        showVersionSelector={true}
                        availableVersions={versions}
                        currentVersionId={rightSelectedVersionId}
                        onVersionChange={setRightSelectedVersionId}
                      />
                      <div className="flex-1 overflow-hidden bg-slate-50/30">
                        <BibleViewer 
                          key={`right-${rightNav.bookId}-${rightNav.chapter}-${rightNav.verse}-${rightNav.scrollTrigger}-${rightSelectedVersionId}`}
                          selectedVersions={versions.filter(v => v.id === rightSelectedVersionId)} 
                          currentBookId={rightNav.bookId}
                          currentChapter={rightNav.chapter}
                          highlightVerse={rightNav.verse}
                          fontSize={fontSize}
                          lineHeight={lineHeight}
                          isMainPane={false}
                          headerRightNode={
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">참고번역</span>
                              <select 
                                value={rightSelectedVersionId}
                                onChange={(e) => setRightSelectedVersionId(e.target.value)}
                                className="bg-red-50 text-[10px] font-black text-red-600 px-2 py-1 rounded-md border border-red-100 outline-none cursor-pointer hover:bg-red-100 transition-colors"
                              >
                                {versions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                              </select>
                            </div>
                          }
                          onCopyToSermon={(text) => {
                            setClipboardSermonText(text);
                            setIsSermonSidebarOpen(true);
                          }}
                          onNavigateToDualView={(bId, chapter, verse) => {
                            setIsDualView(true);
                            setRightNav({ bookId: bId, chapter, verse, scrollTrigger: Date.now() });
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </main>
        </div>

        {/* Search Side Panel */}
        {isSearchOpen && (
          <aside className="search-side-panel w-[350px] shrink-0">
            <div className="search-panel-header">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Search className="w-5 h-5 text-red-600" />
                  성경 검색
                </h2>
                <button 
                  onClick={() => setIsSearchOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 shadow-inner w-3/5">
                    <button
                      onClick={() => setSearchMode('standard')}
                      className={`flex-1 py-1.5 rounded-md text-[10px] font-black transition-all ${searchMode === 'standard' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500'}`}
                    >
                      일반 검색
                    </button>
                    <button
                      onClick={() => setSearchMode('semantic')}
                      className={`flex-1 py-1.5 rounded-md text-[10px] font-black transition-all ${searchMode === 'semantic' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500'}`}
                    >
                      유사 구절
                    </button>
                  </div>
                  <select 
                    value={searchRange}
                    onChange={(e) => setSearchRange(e.target.value as SearchRange)}
                    className="flex-1 bg-slate-100 border border-slate-200 text-[11px] font-bold px-3 py-1.5 rounded-lg text-slate-700 outline-none h-full"
                  >
                    <option value="all">전체 범위</option>
                    <option value="ot">구약 전체</option>
                    <option value="nt">신약 전체</option>
                    <option value="book">현재 (해당 권만)</option>
                  </select>
                </div>

                {searchMode === 'standard' && (
                  <div className="search-options-grid">
                    <div className="col-span-2 flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">검색 옵션</span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" checked={logicMode === 'AND'} onChange={() => setLogicMode(logicMode === 'AND' ? 'OR' : 'AND')} className="accent-red-600" />
                      <span className="text-xs font-bold text-slate-600 group-hover:text-red-600">모든 단어 (AND)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" checked={matchMode === 'exact'} onChange={() => setMatchMode(matchMode === 'exact' ? 'partial' : 'exact')} className="accent-red-600" />
                      <span className="text-xs font-bold text-slate-600 group-hover:text-red-600">완전 일치</span>
                    </label>
                  </div>
                )}

                <div className="relative group">
                  <SearchInput 
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder={searchMode === 'standard' ? "검색어 입력 (예: 아브라함 이삭 야곱)" : "비슷한 표현 늬앙스 검색"}
                    className="w-full h-11 bg-slate-50 border-2 border-slate-100 rounded-xl pl-4 pr-10 text-sm focus:outline-none focus:bg-white focus:border-red-400 focus:ring-4 focus:ring-red-500/5 transition-all font-medium text-slate-800"
                  />
                  <Search className="w-5 h-5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-red-500 transition-colors" />
                </div>
              </div>
            </div>

            <div className="search-result-list custom-scrollbar">
              {searchResults.length > 0 ? (() => {
                const versionMap = new Map(versions.map(v => [v.id, v.name]));
                return searchResults.map((res, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      const targetSide = isDualView ? 'right' : 'left';
                      const setNav = targetSide === 'left' ? setLeftNav : setRightNav;
                      setNav({
                        bookId: res.bookId,
                        chapter: res.chapter,
                        verse: res.verse
                      });
                    }}
                    className="search-result-item group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-extrabold text-red-600 bg-red-50 px-2 py-0.5 rounded-lg">{res.bookName} {res.chapter}:{res.verse}</span>
                      <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-600">
                        {versionMap.get(res.versionId) || 'Unknown'}
                      </span>
                    </div>
                    <p 
                      className="text-slate-700 leading-relaxed font-medium"
                      style={{ fontSize: `${searchFontSize}px` }}
                    >
                      {res.content}
                    </p>
                  </div>
                ));
              })() : searchQuery.length < 2 && searchMode === 'standard' ? (
                <div className="p-4 space-y-3">
                  <div className="space-y-3">
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100/50">
                      <p className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                        <span className="text-red-500">1.</span> 모든단어 (AND)
                      </p>
                      <div className="space-y-1.5 pl-4 border-l-2 border-slate-200">
                        <p className="text-[11px] text-slate-600 leading-tight">
                          <span className="font-black text-red-600">● 체크 시:</span> 모든 단어 조건이 맞아야 검색
                        </p>
                        <p className="text-[11px] text-slate-400 leading-tight">
                          <span className="font-bold">● 해제 시:</span> 한 단어만 맞아도 검색
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100/50">
                      <p className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                        <span className="text-red-500">2.</span> 완전일치 (Exact Match)
                      </p>
                      <div className="space-y-1.5 pl-4 border-l-2 border-slate-200">
                        <p className="text-[11px] text-slate-600 leading-tight">
                          <span className="font-black text-red-600">● 체크 시:</span> 조사까지 일치 (예: '아브라함의')
                        </p>
                        <p className="text-[11px] text-slate-400 leading-tight">
                          <span className="font-bold">● 해제 시:</span> 단어만 들어가면 모두 검색 (예: '아브라함')
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-red-50/30 rounded-2xl border border-red-100/50">
                    <p className="text-[10px] text-red-700 leading-relaxed font-medium">
                      * 검색어 사이에 띄어쓰기를 입력하여 여러 단어를 검색할 수 있습니다.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-slate-300">
                  <Search className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-sm font-bold">검색 결과가 없습니다.</p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Upload Modal */}
      <AnimatePresence>
        {showUploadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUploadModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between p-6 border-b border-white/5">
                <h2 className="text-xl font-bold">성경 번역본 추가</h2>
                <button 
                  onClick={() => setShowUploadModal(false)}
                  className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-8">
                <FileUploader 
                  onUploadSuccess={async (v, rawContent) => {
                    addVersion(v);
                    setShowUploadModal(false);
                    if (rawContent) {
                      try {
                        console.log(`[Bible Sync] Uploading ${v.name}.txt to Google Drive...`);
                        const { gdriveWebService } = await import('./api/gdriveWebService');
                        await gdriveWebService.uploadBibleFile(`${v.name}.txt`, rawContent);
                        console.log(`[Bible Sync] Upload complete`);
                        alert('성경번역본이 구글 드라이브(CEUM_Bible_Data)에 안전하게 보관되었습니다!');
                      } catch (e: any) {
                        console.error('Failed to backup bible to drive', e);
                        alert(`구글 드라이브 업로드 실패: ${e?.message || e}`);
                      }
                    }
                  }} 
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sermon Sidebar */}
      <SermonSidebar 
        ref={sermonSidebarRef}
        isOpen={isSermonSidebarOpen}
        onClose={() => setIsSermonSidebarOpen(false)}
        clipboardText={clipboardSermonText}
        onClipboardTextProcessed={() => setClipboardSermonText(null)}
        dockPosition={sermonDockPosition}
        onDockPositionChange={setSermonDockPosition}
        isCollapsed={isSermonCollapsed}
        onCollapseChange={setIsSermonCollapsed}
        sidebarWidth={sermonSidebarWidth}
        onSidebarWidthChange={setSermonSidebarWidth}
        sidebarHeight={sermonSidebarHeight}
        onSidebarHeightChange={setSermonSidebarHeight}
      />

      {/* Note Search Modal */}
      <AnimatePresence>
        {showNoteSearch && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNoteSearch(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh]"
            >
              <div className="p-6 border-b border-slate-100 bg-yellow-50/50">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
                    <Search className="w-5 h-5 text-yellow-600" />
                    주석 검색
                  </h2>
                  <button onClick={() => setShowNoteSearch(false)} className="p-1.5 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <input 
                  type="text" 
                  autoFocus
                  placeholder="작성한 주석 내용을 검색하세요..."
                  value={noteSearchQuery}
                  onChange={e => setNoteSearchQuery(e.target.value)}
                  className="w-full bg-white border-2 border-yellow-200 focus:border-yellow-400 focus:ring-4 focus:ring-yellow-400/10 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400"
                />
              </div>
              <div className="flex-1 overflow-y-auto p-4 bg-slate-50 custom-scrollbar flex flex-col gap-2">
                {Object.entries(verseData)
                  .filter(([_, data]) => data.note && data.note.includes(noteSearchQuery))
                  .map(([verseKey, data]) => {
                    const [bId, chStr, vsStr] = verseKey.split('_');
                    const vNum = parseInt(vsStr, 10);
                    return (
                      <div 
                        key={verseKey} 
                        className="px-3 py-2 bg-white border border-slate-200 rounded-lg hover:border-yellow-400 hover:bg-yellow-50 transition-all flex flex-col gap-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] font-black text-yellow-600 shrink-0">
                            {BIBLE_LIST.find(b => b.id === bId)?.name || bId} {chStr}:{vsStr}
                          </div>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowNoteSearch(false);
                                setLeftNav({ bookId: bId, chapter: parseInt(chStr, 10), verse: vNum, scrollTrigger: Date.now() });
                              }}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 rounded-md text-[11px] font-bold transition-colors cursor-pointer border border-slate-200"
                            >
                              본문
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowNoteSearch(false);
                                setIsDualView(true);
                                setRightNav({ bookId: bId, chapter: parseInt(chStr, 10), verse: vNum, scrollTrigger: Date.now() });
                              }}
                              className="px-2.5 py-1 bg-yellow-100 hover:bg-yellow-200 active:bg-yellow-300 text-yellow-800 rounded-md text-[11px] font-bold transition-colors cursor-pointer border border-yellow-200"
                            >
                              듀얼뷰
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-slate-600 truncate whitespace-nowrap overflow-hidden">
                          {data.note}
                        </p>
                      </div>
                    );
                  })}
                {noteSearchQuery && Object.entries(verseData).filter(([_, data]) => data.note && data.note.includes(noteSearchQuery)).length === 0 && (
                  <div className="text-center py-6 text-slate-400 text-xs font-bold">
                    검색 결과가 없습니다.
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sermon Search Modal */}
      <AnimatePresence>
        {showSermonSearch && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSermonSearch(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh]"
            >
              <div className="p-4 border-b border-slate-100 bg-indigo-50/50">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                    <Search className="w-4 h-4 text-indigo-600" />
                    노트 검색
                  </h2>
                  <button onClick={() => setShowSermonSearch(false)} className="p-1 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <input 
                  type="text" 
                  autoFocus
                  placeholder="작성한 구절노트 내용을 검색하세요..."
                  value={sermonSearchQuery}
                  onChange={e => setSermonSearchQuery(e.target.value)}
                  className="w-full bg-white border-2 border-indigo-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/10 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400"
                />
              </div>
              <div className="flex-1 overflow-y-auto p-4 bg-slate-50 custom-scrollbar flex flex-col gap-2">
                {Object.entries(verseData)
                  .filter(([_, data]) => data.sermon && data.sermon.includes(sermonSearchQuery))
                  .map(([verseKey, data]) => {
                    const [bId, chStr, vsStr] = verseKey.split('_');
                    const vNum = parseInt(vsStr, 10);
                    return (
                      <div 
                        key={verseKey} 
                        className="px-3 py-2 bg-white border border-slate-200 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-all flex flex-col gap-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] font-black text-indigo-600 shrink-0">
                            {BIBLE_LIST.find(b => b.id === bId)?.name || bId} {chStr}:{vsStr}
                          </div>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowSermonSearch(false);
                                setLeftNav({ bookId: bId, chapter: parseInt(chStr, 10), verse: vNum, scrollTrigger: Date.now() });
                              }}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 rounded-md text-[11px] font-bold transition-colors cursor-pointer border border-slate-200"
                            >
                              본문
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowSermonSearch(false);
                                setIsDualView(true);
                                setRightNav({ bookId: bId, chapter: parseInt(chStr, 10), verse: vNum, scrollTrigger: Date.now() });
                              }}
                              className="px-2.5 py-1 bg-indigo-100 hover:bg-indigo-200 active:bg-indigo-300 text-indigo-800 rounded-md text-[11px] font-bold transition-colors cursor-pointer border border-indigo-200"
                            >
                              듀얼뷰
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-slate-600 truncate whitespace-nowrap overflow-hidden">
                          {data.sermon}
                        </p>
                      </div>
                    );
                  })}
                {sermonSearchQuery && Object.entries(verseData).filter(([_, data]) => data.sermon && data.sermon.includes(sermonSearchQuery)).length === 0 && (
                  <div className="text-center py-6 text-slate-400 text-xs font-bold">
                    검색 결과가 없습니다.
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white border border-slate-100 rounded-2xl shadow-2xl p-8 max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between mb-8 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-50 rounded-xl">
                    <Settings className="w-6 h-6 text-red-600" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-800">성경 환경 설정</h2>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-8">
                <div className="space-y-6 mb-8">
                  <section>
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-3">
                      <div className="w-1.5 h-4 bg-red-500 rounded-full" />
                      성경앱 기능
                    </h3>
                    <div className="bg-slate-50 p-4 rounded-xl text-[11px] text-slate-600 leading-relaxed border border-slate-100 space-y-2 font-medium">
                      <p>• <strong>모든 기기 연동:</strong> 모든 기능은 실시간으로 저장되어 로그인 한 모든 기기에 연동되며, 인터넷 연결이 안된 상태에서 사용해도 기기에 저장되었다가, 인터넷이 연결되면 자동으로 서버에 저장 및 연동됩니다.</p>
                      <p>• <strong>번역본 보기:</strong> 검색, 설교준비 위한 멀티뷰</p>
                      <p>• <strong>복사하기:</strong> 복사 방법 선택하기</p>
                      <p>• <strong>구절기능:</strong> 주석, 관주달기, 구절에 노트 기록하기</p>
                      <p>• <strong>설교문 작성하기</strong></p>
                    </div>
                  </section>
                </div>

                <div className="space-y-8">
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-bold text-slate-700">본문 글꼴 크기</span>
                      <span className="text-red-600 font-black px-3 py-1 bg-red-50 rounded-lg">{fontSize}px</span>
                    </div>
                    <input 
                      type="range" 
                      min="12" 
                      max="40" 
                      value={fontSize}
                      onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-500"
                    />
                    <div className="flex justify-between mt-2 text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                      <span>12px</span>
                      <span>본문 크게 (최대 40px)</span>
                    </div>
                  </div>

                  <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-bold text-indigo-900">검색 결과 글꼴 크기</span>
                      <span className="text-indigo-600 font-black px-3 py-1 bg-white rounded-lg border border-indigo-200">{searchFontSize}px</span>
                    </div>
                    <input 
                      type="range" 
                      min="10" 
                      max="24" 
                      value={searchFontSize}
                      onChange={(e) => setSearchFontSize(parseInt(e.target.value, 10))}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                    <div className="flex justify-between mt-2 text-[10px] font-black text-indigo-400 uppercase tracking-tighter">
                      <span>10px</span>
                      <span>검색결과 크게</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="font-bold text-slate-700">본문 줄 간격</span>
                    <span className="text-red-600 font-black px-3 py-1 bg-red-50 rounded-lg">{lineHeight.toFixed(1)}</span>
                  </div>
                  <input 
                    type="range" 
                    min="1.3" 
                    max="3" 
                    step="0.1"
                    value={lineHeight}
                    onChange={(e) => setLineHeight(parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-500"
                  />
                  <div className="flex justify-between mt-2 text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                    <span>가장 촘촘히 (1.3)</span>
                    <span>넓게 (3.0)</span>
                  </div>
                </div>

                <div className="p-4 bg-red-50 rounded-xl border border-red-100 mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="w-4 h-4 text-red-500" />
                    <h3 className="text-sm font-bold text-red-800">성경번역본 지원 안내</h3>
                  </div>
                  <div className="text-[11px] text-red-700 font-bold">
                    <p>- 성경번역본은 관리자에게 문의하여 다운로드 받으세요.</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="w-4 h-4 text-slate-400" />
                    <h3 className="text-sm font-bold text-slate-800">지원 형식 안내</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <p className="text-[11px] font-bold text-slate-700">1. 표준 형식 (매 줄에 정보 포함)</p>
                      <ul className="text-[10px] text-slate-500 space-y-0.5 pl-3">
                        <li>• 예: <code className="bg-white px-1 rounded border">창세기 1:1</code>, <code className="bg-white px-1 rounded border">창 1:1</code>, <code className="bg-white px-1 rounded border">Genesis 1:1</code>, <code className="bg-white px-1 rounded border">Gen 1:1</code></li>
                      </ul>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[11px] font-bold text-slate-700">2. 헤더 구분 형식 (권/장이 상단에 위치)</p>
                      <ul className="text-[10px] text-slate-500 space-y-0.5 pl-3">
                        <li>• 헤더: <code className="bg-white px-1 rounded border">[Genesis 1]</code>, <code className="bg-white px-1 rounded border">창세기 1</code>, <code className="bg-white px-1 rounded border">Genesis 1</code></li>
                        <li>• 본문: <code className="bg-white px-1 rounded border">1.Text...</code> 또는 <code className="bg-white px-1 rounded border">1 본문...</code></li>
                      </ul>
                    </div>

                    <div className="pt-2 border-t border-slate-200">
                      <p className="text-[11px] font-bold text-red-600 leading-tight mb-2">
                        * 번역본 텍스트를 제미나이ai를 사용해 아래 형식으로 변환 후 사용하세요.
                      </p>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        * 권장 사양: UTF-8 (BOM 없음), LF (\n), .txt 파일
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100 text-center shrink-0">
                <p className="text-[10px] font-black text-slate-400 tracking-widest uppercase mb-1">
                  NATIONS BIBLE V1.0.0
                </p>
                <p className="text-[9px] text-slate-300 font-bold tracking-tight">
                  © 2026 CEUM ministry. All rights reserved.
                  <button 
                    onClick={() => {
                      setShowSettings(false);
                      setShowAdminModal(true);
                    }}
                    className="ml-2 w-2.5 h-2.5 bg-slate-200 rounded-full opacity-20 hover:opacity-100 hover:bg-indigo-500 transition-all"
                    title="관리자 모드"
                  />
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAdminModal && (
          <React.Suspense fallback={null}>
            <AdminModal onClose={() => setShowAdminModal(false)} />
          </React.Suspense>
        )}
      </AnimatePresence>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <BibleProvider>
      <MainApp />
    </BibleProvider>
  );
};

export default App;
