import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BibleProvider } from './stores/BibleProvider';
import { useBible } from './stores/BibleContext';
import { HymnalProvider, useHymnal } from './stores/HymnalProvider';
import { FileUploader } from './components/FileUploader';
import { BibleViewer } from './components/BibleViewer';
import { HymnalModule } from './components/Hymnal/HymnalModule';
import { HymnalSidebar } from './components/Hymnal/HymnalSidebar';
import { ContiEditor } from './components/Hymnal/ContiEditor';
import { SermonSidebar, type SermonSidebarRef, type DockPosition } from './components/SermonSidebar';
import { Menu, Search, BookOpen, Settings, X, Plus, Check, ChevronLeft, ChevronRight, ChevronDown, Trash2, Edit2, Type, AlignLeft, Music, HelpCircle, FileEdit, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { searchService, type SearchRange } from './services/searchService';
import { BIBLE_BOOKS, BIBLE_LIST } from './constants/bibleMeta';
import { initGoogleApi, IS_LOCAL_DEV } from './api/gdriveWebService';

import { MobilePdfLayout } from './components/Hymnal/MobilePdfLayout';
import { TooltipIcon } from './components/TooltipIcon';

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
        // ✅ 사용자 요청: 입력 유지 (비우지 않음)
        // setLocalQuery(''); 
        return true;
      }
    }
    return false;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalQuery(val);
    
    // ✅ 사용자 요청: 엔터를 안쳐도 유효한 패턴(마 1 등)이면 즉시 이동
    const trimmed = val.trim();
    // ✅ 보강된 패턴: "창 1" 또는 "창1" 등을 인식 (절이 있어도 장까지만 우선 감지)
    const navPattern = /^([1-3]?[가-힣]{1,3})\s*(\d+)/; 
    if (navPattern.test(trimmed)) {
      handleSearch(trimmed);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-2 p-2 bg-white border-b border-slate-200 shadow-sm sticky top-0 z-20 ${side === 'right' ? 'bg-slate-50/50' : ''}`}>
      {/* 1. Quick Find Input with Search Button - Darkened for visibility */}
      <div className="relative group min-w-[140px] flex-1 sm:flex-none">
        <input 
          type="text"
          value={localQuery}
          onChange={handleChange}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="성경구절 (예: 창 1)"
          className="w-full h-9 bg-slate-100 border border-slate-300 rounded-lg pl-3 pr-8 text-xs font-black text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-red-400 focus:ring-2 focus:ring-red-500/5 transition-all outline-none"
        />
        <button 
          onClick={() => handleSearch()}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-slate-600 hover:text-red-600 transition-colors"
          title="구절 찾기"
        >
          <Search className="w-4 h-4 stroke-[2.5px]" />
        </button>
      </div>

      <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 border border-slate-200">
        {/* Book Selector */}
        <div className="relative group">
          <select 
            value={nav.bookId}
            onChange={(e) => setNav({ bookId: e.target.value, chapter: 1, verse: undefined })}
            className="bg-transparent text-[11px] font-black text-slate-800 pl-1.5 pr-4 py-1 outline-none appearance-none cursor-pointer hover:bg-white rounded-md transition-colors min-w-[50px]"
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
            className="bg-transparent text-[11px] font-black text-slate-800 pl-1.5 pr-4 py-1 outline-none appearance-none cursor-pointer hover:bg-white rounded-md transition-colors min-w-[35px]"
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
            className="bg-transparent text-[11px] font-black text-slate-800 pl-1.5 pr-4 py-1 outline-none appearance-none cursor-pointer hover:bg-white rounded-md transition-colors min-w-[35px]"
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

      {/* {showVersionSelector && availableVersions && ( ... )} */}
    </div>
  );
};

// ✅ 검색 성능 최적화를 위한 독립 입력 컴포넌트
// 타자를 치는 동안에는 MainApp 전체가 리렌더링되지 않도록 격리합니다.
const SearchInput = React.memo<{
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  className: string;
}>(({ value, onChange, placeholder, className }) => {
  const [localValue, setLocalValue] = React.useState(value);
  const lastSentValue = React.useRef(value);

  // 외부(전역) 값이 바뀌면 로컬 값도 동기화 (검색결과 클릭 이동 등 대비)
  React.useEffect(() => {
    if (value !== lastSentValue.current) {
      setLocalValue(value);
      lastSentValue.current = value;
    }
  }, [value]);

  // 입력이 멈추면 전역 상태로 전달 (0.2초 디바운싱)
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
  // PDF 인쇄 모드 확인
  const params = new URLSearchParams(window.location.search);
  const isPrintMode = params.get('mode') === 'print-pdf';

  if (isPrintMode) {
    return <MobilePdfLayout />;
  }

  // ✅ 구글 API 초기화 (최초 1회)
  const [isApiLoaded, setIsApiLoaded] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(IS_LOCAL_DEV);
  const [isSyncing, setIsSyncing] = useState(false);

  React.useEffect(() => {
    initGoogleApi(() => {
      console.log('[App] Google API successfully initialized.');
      setIsApiLoaded(true);
    });
  }, []);

  const { 
    versions, 
    selectedVersionIds, 
    toggleVersion, 
    removeVersion, 
    clearAllVersions, 
    renameVersion, 
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
  const { isEditorOpen, showAllTooltips, setShowAllTooltips } = useHymnal();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [searchFontSize, setSearchFontSize] = useState(14); // ✅ 검색결과용 글자 크기 상태
  const [currentTab, setCurrentTab] = useState<'bible' | 'hymnal'>('bible');

  // ✅ 로컬 캐시 용량 상태 및 실시간 갱신 함수
  const [cacheSize, setCacheSize] = useState<string>('계산 중...');
  const updateCacheSize = async () => {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        const usageMB = ((estimate.usage || 0) / (1024 * 1024)).toFixed(2);
        setCacheSize(`${usageMB} MB`);
      } else {
        setCacheSize('지원 불가 (브라우저 제한)');
      }
    } catch (e) {
      setCacheSize('계산 실패');
    }
  };

  useEffect(() => {
    if (showSettings) {
      updateCacheSize();
    }
  }, [showSettings]);
  
  // Editing State
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const sermonSidebarRef = useRef<SermonSidebarRef>(null);

  // Sermon Sidebar state
  const [sermonDockPosition, setSermonDockPosition] = useState<DockPosition>('right');
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

  // 듀얼 뷰 상태 추가
  const [isDualView, setIsDualView] = useState(false);
  
  // 듀얼 뷰 리사이저 상태 (너비 기억 기능 포함)
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
      
      // 최소 20%, 최대 80% 제한
      if (newPercent >= 20 && newPercent <= 80) {
        setSplitPosition(newPercent);
      }
    };

    const handleUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto'; // 드래그 종료 후 텍스트 선택 허용
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none'; // 드래그 중 텍스트 선택 방지
    }

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isResizing]);

  // Navigation State 분리
  const [leftNav, setLeftNav] = useState({ bookId: 'GEN', chapter: 1, verse: 1 });
  const [rightNav, setRightNav] = useState({ bookId: 'GEN', chapter: 1, verse: 1 });
  
  // 우측 창 전용 번역본 상태 (단일 선택)
  const [rightSelectedVersionId, setRightSelectedVersionId] = useState<string>('built-in-krv');

  const [searchQuery, setSearchQuery] = useState('');
  
  // Search Options State
  const [searchMode, setSearchMode] = useState<'standard' | 'semantic'>('standard');
  const [logicMode, setLogicMode] = useState<'AND' | 'OR'>('AND');
  const [matchMode, setMatchMode] = useState<'partial' | 'exact'>('partial');
  const [tolerance, setTolerance] = useState(1);
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

  // 퀵 서치 처리 로직 (마 1:1 등)
  const handleQuickNav = (query: string, side: 'left' | 'right') => {
    const trimmed = query.trim();
    // 1-3. 보강된 만능 패턴 (창1, 창 1, 창 1:1, 창 1 1, 창1 1 모두 지원)
    const navPattern = /^([1-3]?[가-힣]{1,3})\s*(\d+)(?:[ :.\s]+(\d+))?$/;
    const match = trimmed.match(navPattern);

    if (match) {
      const [_, bookName, chapterStr, verseStr] = match;
      
      // 약어나 전체 이름으로 책 찾기
      const bookId = BIBLE_BOOKS[bookName];
      const book = bookId ? BIBLE_LIST.find(b => b.id === bookId) : BIBLE_LIST.find(b => 
        b.name === bookName || 
        (b as any).shortName === bookName || 
        bookName === b.name.substring(0, 2) ||
        bookName === b.name.substring(0, 1)
      );

      if (book) {
        // ✅ 사용자 요청: 권만 적으면 1장 1절, 장만 적으면 1절이 나오게
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
      // 내비게이션 패턴(창 1:1 등)은 검색 작업에서 제외하여 성능 확보
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

  // ✅ 1단계: 강제 로그인 스플래시 화면
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white font-sans">
        <div className="text-center flex flex-col items-center">
          <div className="w-24 h-24 bg-indigo-500 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-indigo-500/50">
            <span className="text-4xl font-black text-white">C</span>
          </div>
          <h1 className="text-4xl font-bold mb-4 text-white">CEUM BIBLE-CCM Cloud <span className="text-indigo-400">1.5</span></h1>
          <p className="mb-6 text-slate-300 max-w-lg leading-relaxed text-sm text-left bg-slate-800/50 p-6 rounded-xl border border-slate-700">
            <span className="block mb-2 font-bold text-indigo-300">📌 클라우드 동기화 안내</span>
            • <strong>성경번역본, 악보</strong>를 추가하면 구글 드라이브에 자동 저장되고 다른 기기에 연동됩니다.<br /><br />
            <span className="block mb-2 font-bold text-indigo-300">• 앱으로 사용하기</span>
            사파리: 독에추가, 크롬:페이지를 앱으로 설치<br />
            모바일: 홈화면 추가<br /><br />
            <span className="block mb-2 font-bold text-indigo-300">• 업데이트 정보:</span> v.2026.7.11 속도 월등히 개선(로그인, 업로드, 악보편집의 저장, 삭제 반응속도)
          </p>
          <button 
            className={`px-8 py-4 bg-white text-slate-900 rounded-xl font-bold text-lg hover:bg-slate-100 transition shadow-xl ${!isApiLoaded ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-1'}`}
            disabled={!isApiLoaded || isSyncing}
            onClick={async () => {
              setIsSyncing(true);
              try {
                // 앱에서 쓸 구글 API 인증 호출
                const { gdriveWebService } = await import('./api/gdriveWebService');
                const success = await gdriveWebService.login();
                if (success) {
                  // 시스템 기본 폴더 강제 할당 (절대 덮어쓰지 않고 ID만 반환됨)
                  console.log('[System] Initializing default folders...');
                  await Promise.all([
                    gdriveWebService.getOrCreateFolder('CEUM_Bible_Data'),
                    gdriveWebService.getOrCreateFolder('CEUM_ccm_data')
                  ]);
                  console.log('[System] Folders initialized.');

                  setTimeout(() => {
                    setIsAuthenticated(true);
                    window.dispatchEvent(new Event('gdrive_authenticated'));
                  }, 500);
                } else {
                  alert('로그인 실패: 구글 인증이 완료되지 않았습니다.');
                }
              } catch (e: any) {
                console.error('[Login Fail]', e);
                alert('로그인 처리 중 오류가 발생했습니다.\n상세 정보: ' + (e?.message || e));
              } finally {
                setIsSyncing(false);
              }
            }}
          >
            {isSyncing ? '클라우드 연동 중...' : (isApiLoaded ? '구글 계정으로 시작하기' : 'API 로딩 중...')}
          </button>
          
          <div className="mt-6 text-sm text-slate-500">
            진행시 구글 드라이브 접근 권한을 요청합니다.
          </div>
          
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
            <p className="text-lg font-black text-red-400 leading-relaxed drop-shadow-md">
              계정 로그인 후, 구글 클라우드와 앱의 동기화가 진행됩니다.<br/>
              번역본과 악보가 뜰때까지 약 5-10초간 기다려 주세요 
            </p>
          </div>
          
          <div className="mt-4 p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-left max-w-lg w-full">
            <p className="text-xs text-slate-400 font-bold leading-relaxed">
              * 앱이 흰 화면이거나 업데이트가 안되었으면 아래 설정 후 새로고침<br/>
              <span className="text-indigo-300">설정 - Safari - 방문기록 및 웹사이트 데이터 지우기</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ✅ 2단계: 메인 앱 UI
  return (
    <div className="flex h-screen bg-background text-slate-200 overflow-y-auto overflow-x-hidden font-sans custom-scrollbar">
      {/* ... (sidebar content skipped for brevity in replacement) */}
      {/* Sidebar - Dynamically switch between Bible and Hymnal controls */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "fit-content", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="glass border-r border-slate-200 h-full relative z-30 bg-white shadow-xl shrink-0 group/sidebar"
          >
            {/* Sidebar Collapse Button (Floating in middle) */}
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
                  <span className="text-[10px] uppercase tracking-tighter opacity-80">ceum</span>
                  <span className="text-xl">성경CCM</span>
                </h1>
                {currentTab === 'bible' ? <BookOpen className="w-5 h-5 text-red-500" /> : <Music className="w-5 h-5 text-red-500" />}
              </div>

              {/* App Tab Selector */}
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 mb-6 shrink-0">
                 <button
                    onClick={() => setCurrentTab('bible')}
                    className={`flex-1 flex justify-center items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                      currentTab === 'bible' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                 >
                    <BookOpen className="w-3 h-3" />
                    성경
                 </button>
                 <button
                    onClick={() => setCurrentTab('hymnal')}
                    className={`flex-1 flex justify-center items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                      currentTab === 'hymnal' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                 >
                    <Music className="w-3 h-3" />
                    찬양
                 </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {currentTab === 'bible' ? (
                  /* Bible Sidebar Content */
                  <div className="space-y-6">
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
                            onClick={() => setShowUploadModal(true)}
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
                                 group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200
                                 ${selectedVersionIds.includes(v.id) ? 'bg-red-50 text-red-700 ring-1 ring-red-100' : 'hover:bg-slate-50 text-slate-600'}
                               `}
                               onClick={() => toggleVersion(v.id)}
                             >
                               <div className={`
                                 w-5 h-5 rounded-md border flex items-center justify-center transition-colors
                                 ${selectedVersionIds.includes(v.id) ? 'bg-red-500 border-red-500' : 'border-slate-200'}
                               `}>
                                 {selectedVersionIds.includes(v.id) && <Check className="w-3 h-3 text-white" />}
                               </div>
                               <span className="flex-1 text-sm font-medium truncate">{v.name}</span>
                               
                               {/* ✅ 개별 삭제 버튼 - 시스템 번역본 제외 */}
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
                ) : (
                  /* Hymnal Sidebar Content (3-Column Layout Column 1) */
                  <HymnalSidebar />
                )}
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
                  <TooltipIcon text={currentTab === 'bible' ? "성경 글자 크기, 글꼴 줄간격 수정" : "캐쉬삭제: 기기용량확보를 위해 기기에 저장된 캐쉬를 삭제하세요. 구글드라이브, 악보 목록 및 설정 어디에도 영향주지 않고 보호됩니다."} />
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
        {/* Main View Area - No Animation */}
        <div 
          className={`flex flex-col flex-1 overflow-hidden bg-white ${isSearchOpen ? 'w-2/3' : 'w-full'}`}
        >
          <main 
            className="flex-1 flex flex-col relative z-10 overflow-hidden transition-all duration-75"
            style={{
              marginRight: isSermonSidebarOpen && sermonDockPosition === 'right' && !isSermonCollapsed ? `${sermonSidebarWidth}px` : 0,
              marginBottom: isSermonSidebarOpen && sermonDockPosition === 'bottom' && !isSermonCollapsed ? `${sermonSidebarHeight}px` : 0,
            }}
          >
        {/* Header */}
        <header className="min-h-16 border-b border-slate-200 flex flex-wrap items-center px-4 md:px-6 py-2 gap-x-6 gap-y-3 bg-white sticky top-0 z-30 shadow-sm">
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center shrink-0">
              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>
              <TooltipIcon text="누르면 앨범관리 사이드바가 열립니다." />
            </div>

            {currentTab === 'bible' && (
              <div className="flex flex-wrap items-center gap-3 ml-0 sm:ml-2">
                <div className="flex items-center shrink-0">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mr-1">복사설정</span>
                  <div className="flex items-center bg-slate-100 rounded-md border border-slate-200">
                    {['default', 'niv+krv', 'all'].map((m) => (
                      <button 
                        key={m} 
                        onClick={() => setCopyMode(m as any)}
                        className={`px-1 py-0.5 rounded-[4px] text-[9px] tracking-tighter font-black transition-all ${copyMode === m ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        {m === 'default' ? '개역' : m === 'niv+krv' ? '개역+NIV' : '전체'}
                      </button>
                    ))}
                    <div className="w-px h-2.5 bg-slate-200 mx-0.5"></div>
                    <button 
                      onClick={() => setShowVersionInCopy(!showVersionInCopy)}
                      className={`px-1 py-0.5 rounded-[4px] text-[9px] tracking-tighter font-black transition-all ${!showVersionInCopy ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      번역본표시안함
                    </button>
                  </div>
                </div>
                
                <div className="hidden sm:block w-px h-6 bg-slate-200 mx-1"></div>
                
                <div className="flex flex-wrap items-center gap-2 mr-0 sm:mr-2">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowNoteSearch(true); }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-yellow-50 border border-yellow-200 hover:bg-yellow-100 text-[11px] font-bold text-yellow-700 transition-colors shadow-sm"
                  >
                    <Search className="w-3.5 h-3.5" /> 주석검색
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowSermonSearch(true); }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-[11px] font-bold text-indigo-700 transition-colors shadow-sm"
                  >
                    <Search className="w-3.5 h-3.5" /> 노트검색
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleSermonSidebar(); }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-50 border border-red-200 hover:bg-red-100 text-[11px] font-bold text-red-700 transition-colors shadow-sm"
                  >
                    <BookOpen className="w-3.5 h-3.5" /> 설교노트
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowAnnotations(!showAnnotations); }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-bold text-slate-600 transition-colors shadow-sm"
                  >
                    {showAnnotations ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-indigo-500" />}
                    주석 {showAnnotations ? '숨기기' : '보기'}
                  </button>
                </div>
                
                <div className="w-full sm:w-auto flex items-center mt-1 sm:mt-0 gap-3">
                  <button 
                    onClick={() => {
                      if (!isDualView) {
                      setRightSelectedVersionId('built-in-krv');
                      setRightNav({ ...leftNav });
                    }
                    setIsDualView(!isDualView);
                  }}
                  className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl transition-all shadow-sm active:scale-95 border ${isDualView ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100'}`}
                  title="두 개 창 보기 (설교 준비용)"
                >
                  <div className="flex gap-1">
                    <div className={`w-1.5 h-3.5 rounded-sm ${isDualView ? 'bg-white' : 'bg-indigo-400'}`} />
                    <div className={`w-1.5 h-3.5 rounded-sm ${isDualView ? 'bg-white/60' : 'bg-indigo-200'}`} />
                  </div>
                  <span className="text-xs font-black tracking-tight">본문 듀얼뷰</span>
                </button>
              </div>
            </div>
            )}
            
            {currentTab === 'hymnal' && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                   <div className="text-sm font-bold text-slate-800">찬송/CCM 관리자</div>
                   <button 
                     onClick={() => setShowAllTooltips(!showAllTooltips)}
                     className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all ${showAllTooltips ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                   >
                     말풍선 {showAllTooltips ? '끄기' : '켜기'}
                   </button>
                   <button 
                     onClick={() => setShowSettings(true)}
                     className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white rounded-xl transition-all active:scale-95 group shadow-sm border border-red-100"
                     title="도움말 및 설치 가이드"
                   >
                     <span className="text-[10px] font-black">사용법</span>
                     <Settings className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-500" />
                    </button>
                  </div>
                </div>
            )}
          </div>

            <div className="flex-1"></div>

          {/* 참조본문 닫기 버튼은 이제 위 헤더 내부로 이동되었습니다 */}

          <div className="ml-auto flex items-center gap-4">
            {currentTab === 'bible' && (
              <>
                <div className="flex -space-x-2">
                  {versions.filter(v => selectedVersionIds.includes(v.id)).map(v => (
                    <div key={v.id} className="px-2 h-8 rounded-full bg-red-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-red-600 min-w-[32px]" title={v.name}>
                      {v.name.substring(0, 2)}
                    </div>
                  ))}
                </div>
                <button 
                  onClick={() => setIsSearchOpen(!isSearchOpen)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 ${isSearchOpen ? 'bg-red-600 text-white shadow-lg' : 'bg-red-50 text-red-600 hover:bg-red-600 hover:text-white'}`}
                  title="검색 창 열기/닫기"
                >
                  <Search className={`w-5 h-5 ${isSearchOpen ? 'animate-pulse' : ''}`} />
                  <span className="text-sm font-black whitespace-nowrap">성경 검색</span>
                </button>
                <button 
                  onClick={() => setShowSettings(true)}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
                >
                  <Settings className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div ref={contentRef} className="flex-1 overflow-hidden relative bg-slate-50">
          <AnimatePresence mode="wait">
            {currentTab === 'bible' ? (
              versions.length === 0 ? (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-white"
                >
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
                </motion.div>
              ) : selectedVersionIds.length === 0 ? (
                <motion.div 
                  key="no-selection"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full flex flex-col items-center justify-center text-slate-400 p-12 italic"
                >
                  <p>왼쪽 사이드바에서 표시할 성경 번역본을 체크해 주세요.</p>
                </motion.div>
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
                        key={`left-${leftNav.bookId}-${leftNav.chapter}-${selectedVersionIds.join(',')}`}
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
                      />
                    </div>
                  </div>

                  {/* Resizer Bar (Splitter) - Only visible in dual view */}
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
                          key={`right-${rightNav.bookId}-${rightNav.chapter}-${rightSelectedVersionId}`}
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
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            ) : (
              <HymnalModule />
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>

    {/* ✅ 우측 검색 사이드 패널 (애니메이션 없는 일반 aside) */}
    {isSearchOpen && (
      <aside
        className="search-side-panel w-[350px] shrink-0"
      >
          {/* 패널 헤더: 검색 옵션 상단 배치 */}
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
              {/* 1. 검색 모드 및 범위 */}
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

              {/* 2. 상세 옵션 (Standard 모드 시 노출) */}
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

              {/* 3. 검색 입력창 */}
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

          {/* 결과 리스트 영역 혹은 가이드 문구 */}
          <div className="search-result-list custom-scrollbar">
            {searchResults.length > 0 ? (() => {
              // 성능을 위해 번역본 ID맵을 미리 생성 (1,000개 결과 대비)
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
              /* 검색 가이드 팁 - 일반 검색 모드에서만 노출 */
              <div className="p-4 space-y-3">
                <div className="space-y-3">
                   <div className="space-y-3">
                      {/* Guide 1: All Words */}
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

                      {/* Guide 2: Exact Match */}
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
                    // 구글 드라이브(appDataFolder)에 백업
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
                          onClick={() => {
                            setShowNoteSearch(false);
                            setIsDualView(true);
                            handleQuickNav(`${bId} ${chStr}:${vNum}`, 'right');
                          }}
                          className="px-4 py-3 bg-white border border-slate-200 rounded-lg hover:border-yellow-400 hover:bg-yellow-50 hover:shadow-sm cursor-pointer transition-all flex flex-col gap-1"
                        >
                          <div className="text-[11px] font-black text-yellow-600">
                            {BIBLE_LIST.find(b => b.id === bId)?.name || bId} {chStr}:{vsStr}
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
                          onClick={() => {
                            setShowSermonSearch(false);
                            setIsDualView(true);
                            handleQuickNav(`${bId} ${chStr}:${vNum}`, 'right');
                          }}
                          className="px-4 py-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 hover:shadow-sm cursor-pointer transition-all flex flex-col gap-1"
                        >
                          <div className="text-[11px] font-black text-indigo-600">
                            {BIBLE_LIST.find(b => b.id === bId)?.name || bId} {chStr}:{vsStr}
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
                   <h2 className="text-xl font-bold text-slate-800">
                     {currentTab === 'bible' ? '성경 환경 설정' : '[CEUM] 통합 도구 가이드'}
                   </h2>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-8">
                {currentTab === 'bible' ? (
                  <>
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

                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-2 mb-3">
                        <BookOpen className="w-4 h-4 text-slate-400" />
                        <h3 className="text-sm font-bold text-slate-800">성경 번역본 지원 형식 안내</h3>
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
                  </>
                ) : (
                  /* Hymnal/Unified Guide Content */
                  <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="p-5 bg-red-50 rounded-2xl border border-red-100">
                      <p className="text-xs font-bold text-red-800 leading-relaxed">목사님의 사역이 이 도구를 통해 더욱 풍성해지길 기도합니다. 🕊️🙏</p>
                    </div>

                    {/* 로컬 캐시 관리 섹션 */}
                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">로컬 캐시 관리</h4>
                        <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100/50 px-2.5 py-1 rounded-lg">
                          현재 로컬 캐쉬 용량: {cacheSize}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
                        해당 앱은 모든 악보를 구글 드라이브에 저장하여 불러옵니다. 빠른 앱의 구동을 위해 한번 읽은 악보는 기기의 캐쉬에 저장됩니다. 기기의 저장 공간을 확보하고 싶을때 로컬캐시 관리를 실행하여 삭제 하십시오. 구글 드라이브의 원본악보와 앱의 모든 앨범과 설정은 삭제되지 않고 안전하게 보호 됩니다.
                      </p>
                      <button
                        onClick={async () => {
                          if (confirm('기기에 저장된 모든 악보 캐시를 삭제하시겠습니까? \n삭제 후 악보를 열 때 구글 드라이브에서 다시 새로 다운로드합니다.')) {
                            try {
                              const { imageCache } = await import('./utils/imageCache');
                              await imageCache.clearCache();
                              alert('로컬 악보 캐시가 성공적으로 삭제되었습니다.');
                              setCacheSize('0.00 MB'); // UI 즉각 반영 (IndexedDB GC 지연 보완)
                              setTimeout(updateCacheSize, 1000); // 1초 뒤 실제 사이즈로 다시 확인
                            } catch (e: any) {
                              alert('캐시 삭제 중 오류 발생: ' + e.message);
                            }
                          }
                        }}
                        className="px-4 py-2.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white rounded-xl text-xs font-bold transition-all border border-red-100 shadow-sm"
                      >
                        로컬 악보 캐시 지우기
                      </button>
                    </div>

                    <div className="space-y-6">
                       <section>
                          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-3">
                             <div className="w-1.5 h-4 bg-red-500 rounded-full" />
                             맥(macOS) 보안 설정 안내
                          </h3>
                          <div className="bg-slate-50 p-4 rounded-xl text-[11px] text-slate-600 leading-relaxed border border-slate-100">
                             <p>앱 실행 시 "확인되지 않은 개발자" 경고가 뜨면:</p>
                             <ul className="mt-2 space-y-1.5 list-disc pl-4 font-bold">
                                <li><strong>시스템 설정</strong> &gt; <strong>개인정보 보호 및 보안</strong>으로 이동</li>
                                <li>아래쪽 <strong>확인 없이 열기 (Open Anyway)</strong> 버튼 클릭</li>
                                <li>암호 입력 후 최종 실행 승인</li>
                             </ul>
                          </div>
                       </section>

                       <section>
                          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-3">
                             <div className="w-1.5 h-4 bg-red-500 rounded-full" />
                             찬양 악보 데이터 넣는 법
                          </h3>
                          <div className="bg-slate-50 p-4 rounded-xl text-[11px] text-slate-600 leading-relaxed border border-slate-100 space-y-3">
                             <div>
                                <p className="font-black text-slate-800 mb-1">1. 데이터 빌더 실행</p>
                                <p>왼쪽 하단 <strong>[데이터 빌더 실행]</strong> 클릭 후 앨범과 PC 폴더 연결</p>
                             </div>
                             <div>
                                <p className="font-black text-slate-800 mb-1">2. 빌드 방식</p>
                                <p>• <strong>전체다시 빌드</strong>: 폴더 내 모든 곡을 새로 삽입</p>
                                <p>• <strong>새곡추가 빌드</strong>: 추가된 곡만 인식 (추천)</p>
                             </div>
                          </div>
                       </section>

                       <section>
                          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-3">
                             <div className="w-1.5 h-4 bg-red-500 rounded-full" />
                             드라이브 동기화 (모바일 연동)
                          </h3>
                          <div className="bg-white p-4 rounded-xl text-[11px] text-slate-600 leading-relaxed border-2 border-red-50 space-y-2">
                             <p>패널 왼쪽 하단 <strong>[드라이브 동기화]</strong> 버튼을 누르면 구글 드라이브에 자동으로 업로드됩니다.</p>
                             <p className="text-[10px] text-red-500 font-bold">* 곡 추가나 정보 수정 후에는 항상 동기화를 눌러주세요.</p>
                          </div>
                       </section>

                       <section>
                          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-3">
                             <div className="w-1.5 h-4 bg-red-500 rounded-full" />
                             정보 일괄 수정 (엑셀 활용)
                          </h3>
                          <div className="bg-slate-50 p-4 rounded-xl text-[11px] text-slate-600 leading-relaxed border border-slate-100">
                             <p><strong>[CSV 내보내기]</strong>로 받은 엑셀에서 수정 후, <strong>[CSV 가져오기]</strong>로 다시 올리면 한꺼번에 반영됩니다.</p>
                          </div>
                       </section>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100 text-center shrink-0">
                <p className="text-[10px] font-black text-slate-400 tracking-widest uppercase mb-1">
                  {currentTab === 'bible' ? 'CEUM BIBLE Tool V1.0.0' : 'CEUM CCM Tool V1.0.0'}
                </p>
                <p className="text-[9px] text-slate-300 font-bold tracking-tight">© 2026 CEUM ministry. All rights reserved.</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEditorOpen && <ContiEditor />}
      </AnimatePresence>
    </div>
);
};

export const App: React.FC = () => {
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <BibleProvider>
      <HymnalProvider>
        <MainApp />
      </HymnalProvider>
    </BibleProvider>
  );
};

export default App;
