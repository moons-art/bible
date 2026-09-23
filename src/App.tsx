import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BibleProvider } from './stores/BibleProvider';
import { useBible } from './stores/BibleContext';
import { FileUploader } from './components/FileUploader';
import { BibleViewer } from './components/BibleViewer';
import { SermonSidebar, type SermonSidebarRef, type DockPosition } from './components/SermonSidebar';
import { InstallPromptBanner } from './components/InstallPromptBanner';
import { 
  Menu, Search, BookOpen, Settings, X, Plus, Check, 
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Trash2, 
  FileEdit, Eye, EyeOff, WifiOff, Sparkles, PanelLeft, ChevronsLeftRight, Copy, Columns,
  MoreVertical, ArrowUp, ArrowDown, SlidersHorizontal, GripVertical, ArrowLeft,
  CreditCard, History, AlertCircle, LogOut, ExternalLink, Clock, HardDrive, Database, Folder, FolderOpen,
  Gift, MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { searchService, type SearchRange } from './services/searchService';
import { BIBLE_BOOKS, BIBLE_LIST } from './constants/bibleMeta';
import { initGoogleApi, IS_LOCAL_DEV } from './api/gdriveWebService';
import { TooltipIcon } from './components/TooltipIcon';
import { SettingsPage } from './components/SettingsPage';
import { AiCommentaryPanel, ClaudeSparkleIcon, type AiTabType } from './components/AiCommentaryPanel';
import { useAiUsage } from './hooks/useAiUsage';
import { getCommentaryHistory, getCloudCommentaryCount, getTotalMergedCommentaryCount } from './services/aiHistoryService';
import { getBibleReferenceMatchScore, parseBibleReference, isBibleReferenceMatch } from './utils/referenceParser';
import { AuthModal } from './components/AuthModal';
import { AdminDashboardModal } from './components/AdminDashboardModal';
import { PolicyViewModal, type PolicyModalType } from './components/PolicyViewModal';
import { getSitePolicy, subscribeSitePolicy, type SitePolicy, DEFAULT_SITE_POLICY } from './services/policyService';
import { isAdminUser, syncUserProfile } from './services/userService';
import { auth } from './api/firebaseConfig';
import { signOut } from 'firebase/auth';

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
    const parsed = parseBibleReference(trimmed);
    if (parsed && parsed.chapter !== undefined) {
      handleSearch(trimmed);
    } else {
      const navPattern = /^([1-3]?[가-힣]{1,3})\s*(\d+)/; 
      if (navPattern.test(trimmed)) {
        handleSearch(trimmed);
      }
    }
  };

  return (
    <div className={`flex flex-nowrap items-center gap-x-2 px-3 py-2 bg-[#FAF9F5] border-b border-[#E7E5DF] sticky top-0 z-20 overflow-x-auto custom-scrollbar ${side === 'right' ? 'bg-[#F5F3ED]/40' : ''}`}>
      {/* 1. Quick Find Input with Search Button */}
      <div className="relative group w-32 sm:w-36 shrink-0">
        <input 
          type="text"
          value={localQuery}
          onChange={handleChange}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="성경구절 (창 1)"
          className="w-full h-8 bg-white border border-[#E7E5DF] rounded-xl pl-3 pr-7 text-xs font-semibold text-[#2C2B29] placeholder:text-[#A3A19B] focus:bg-white focus:border-[#C96442] focus:ring-2 focus:ring-[#C96442]/10 transition-all outline-none shadow-2xs"
        />
        <button 
          onClick={() => handleSearch()}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-[#A3A19B] hover:text-[#C96442] transition-colors"
          title="구절 찾기"
        >
          <Search className="w-3.5 h-3.5 stroke-[1.5px]" />
        </button>
      </div>

      <div className="flex items-center gap-0.5 bg-[#F5F3ED] rounded-xl p-0.5 border border-[#E7E5DF] shrink-0 shadow-2xs">
        {/* Book Selector */}
        <div className="relative group">
          <select 
            value={nav.bookId}
            onChange={(e) => setNav({ bookId: e.target.value, chapter: 1, verse: undefined })}
            className="bg-transparent text-xs font-semibold text-[#2C2B29] pl-2 pr-5 py-1 outline-none appearance-none cursor-pointer hover:bg-white rounded-lg transition-colors min-w-[52px]"
          >
            {BIBLE_LIST.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#A3A19B]" />
        </div>
        
        <div className="w-px h-3.5 bg-[#E7E5DF]"></div>

        {/* Chapter Selector */}
        <div className="relative group">
          <select 
            value={nav.chapter}
            onChange={(e) => setNav({ ...nav, chapter: parseInt(e.target.value, 10), verse: undefined })}
            className="bg-transparent text-xs font-semibold text-[#2C2B29] pl-2 pr-5 py-1 outline-none appearance-none cursor-pointer hover:bg-white rounded-lg transition-colors min-w-[40px]"
          >
            {Array.from({ length: BIBLE_LIST.find(b => b.id === nav.bookId)?.chapters || 1 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}장</option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#A3A19B]" />
        </div>

        <div className="w-px h-3.5 bg-[#E7E5DF]"></div>

        {/* Verse Selector */}
        <div className="relative group">
          <select 
            value={nav.verse || ''}
            onChange={(e) => setNav({ ...nav, verse: e.target.value ? parseInt(e.target.value, 10) : undefined })}
            className="bg-transparent text-xs font-semibold text-[#2C2B29] pl-2 pr-5 py-1 outline-none appearance-none cursor-pointer hover:bg-white rounded-lg transition-colors min-w-[36px]"
          >
            <option value="">전체</option>
            {Array.from({ length: 176 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}절</option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#A3A19B]" />
        </div>

        <div className="w-px h-3.5 bg-[#E7E5DF]"></div>

        {/* Navigation Buttons */}
        <div className="flex items-center px-0.5">
          <button onClick={onPrev} className="p-1 hover:bg-white rounded-lg text-[#6A6864] hover:text-[#C96442] transition-colors" title="이전 장"><ChevronLeft className="w-3.5 h-3.5 stroke-[1.5px]" /></button>
          <button onClick={onNext} className="p-1 hover:bg-white rounded-lg text-[#6A6864] hover:text-[#C96442] transition-colors" title="다음 장"><ChevronRight className="w-3.5 h-3.5 stroke-[1.5px]" /></button>
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
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (IS_LOCAL_DEV) return true;
    try {
      return !!localStorage.getItem('cached_auth_user');
    } catch {
      return false;
    }
  });
  const [userProfile, setUserProfile] = useState<{name: string, email: string, picture: string} | null>(() => {
    try {
      const cached = localStorage.getItem('cached_auth_user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAdminDashboardModal, setShowAdminDashboardModal] = useState(false);
  const [promoSettings, setPromoSettings] = useState<{ enabled: boolean; bonusCredits: number; name: string; description?: string } | null>(null);
  const [welcomeModalInfo, setWelcomeModalInfo] = useState<{
    isOpen: boolean;
    bonusCredits: number;
    totalCredits: number;
  } | null>(null);

  // 서비스 정책, 사업자 정보 및 약관 모달 상태
  const [policyData, setPolicyData] = useState<SitePolicy>(DEFAULT_SITE_POLICY);
  const [policyModal, setPolicyModal] = useState<{ isOpen: boolean; tab: PolicyModalType }>({
    isOpen: false,
    tab: 'terms'
  });

  React.useEffect(() => {
    getSitePolicy().then(setPolicyData).catch(() => {});
    const unsubPolicy = subscribeSitePolicy(setPolicyData);
    return () => unsubPolicy();
  }, []);

  React.useEffect(() => {
    import('./services/promotionService').then(({ getPromotionSettings }) => {
      getPromotionSettings().then(setPromoSettings).catch(() => {});
    });
    if (typeof window !== 'undefined' && window.location.pathname.includes('/admin')) {
      setShowAdminDashboardModal(true);
    }
  }, []);

  // Firebase Auth 통합 리스너 (구글 + 일반 이메일 간편가입 지원)
  React.useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setIsAuthenticated(true);
        const profile = {
          name: user.displayName || user.email?.split('@')[0] || '사용자',
          email: user.email || '',
          picture: user.photoURL || '',
        };
        setUserProfile(profile);
        try {
          localStorage.setItem('cached_auth_user', JSON.stringify(profile));
        } catch (e) {}

        // 클라우드 주석 개수 0초 동기화 (순수 성경 구절 주석 6개로 일치)
        getCloudCommentaryCount(user.uid).then(count => {
          setSavedHistoryCount(count);
        }).catch(err => console.warn('[App] getCloudCommentaryCount error:', err));

        // syncUserProfile: 실패 시 최대 3회 재시도
        let retries = 3;
        while (retries > 0) {
          try {
            const syncedProfile = await syncUserProfile(user);
            console.log('[App] ✅ syncUserProfile 성공 uid:', user.uid);

            // 신규 가입자 환영 팝업 체크 (기존 가입자는 절대 중복 노출 안 됨)
            if (syncedProfile) {
              const paidBonus = syncedProfile.aiCredits?.paidRemaining || 0;
              const seenKey = `welcome_bonus_seen_${user.uid}`;
              const alreadySeen = localStorage.getItem(seenKey) === 'true';
              const hasSeenInDb = syncedProfile.hasSeenWelcome === true;
              const isNewSignUp = syncedProfile.isNewSignUp === true;
              const isFirstLogin = (syncedProfile.loginCount || 1) <= 1;

              if (paidBonus > 0 && isNewSignUp && isFirstLogin && !hasSeenInDb && !alreadySeen) {
                setWelcomeModalInfo({
                  isOpen: true,
                  bonusCredits: paidBonus,
                  totalCredits: (syncedProfile.aiCredits?.freeRemaining || 10) + paidBonus,
                });
              }
            }

            try {
              const { logActivity } = await import('./utils/logger');
              logActivity('로그인');
            } catch (logErr) {
              console.warn('[App] logActivity error:', logErr);
            }
            break;
          } catch (e: any) {
            retries--;
            console.warn(`[App] syncUserProfile 실패 (남은 재시도: ${retries})`, e?.code || e);
            if (retries > 0) {
              await new Promise(res => setTimeout(res, 1500));
            }
          }
        }
      } else {
        setIsAuthenticated(IS_LOCAL_DEV);
        setUserProfile(null);
        try {
          localStorage.removeItem('cached_auth_user');
        } catch (e) {}
      }
    });

    return () => unsubAuth();
  }, []);

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
          // Firestore users 컬렉션에도 프로필 즉각 동기화/저장
          try {
            await syncUserProfile({
              uid: profile.id,
              email: profile.email,
              displayName: profile.name,
              photoURL: profile.picture
            });
          } catch (syncErr) {
            console.warn('[App] Google drive user profile sync non-fatal:', syncErr);
          }
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
    copyMultiOption,
    setCopyMultiOption,
    mainKrVersionId,
    setMainKrVersionId,
    mainEnVersionId,
    setMainEnVersionId,
    lineHeight,
    setLineHeight,
    verseData,
    showAnnotations,
    setShowAnnotations,
    moveVersion,
    reorderVersions
  } = useBible();

  // 복사 설정 중앙 화면 모달 상태
  const [showCopySettingsModal, setShowCopySettingsModal] = useState(false);
  // 번역본 항목 우측 삼점(...) 메뉴 열림 상태
  const [activeDropdownVersionId, setActiveDropdownVersionId] = useState<string | null>(null);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    if (!activeDropdownVersionId) return;
    const handleOutsideClick = () => setActiveDropdownVersionId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [activeDropdownVersionId]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const DEFAULT_SIDEBAR_WIDTH = 260;
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('bible-left-sidebar-width');
    if (!saved) return DEFAULT_SIDEBAR_WIDTH;
    const parsed = parseInt(saved, 10);
    // 기존에 250 미만으로 너무 좁게 저장되어 있던 경우에도 최적 너비로 자연스럽게 상향
    return (parsed > 380 || parsed < 250) ? DEFAULT_SIDEBAR_WIDTH : parsed;
  });
  const [isResizingLeftSidebar, setIsResizingLeftSidebar] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingLeftSidebar) return;
      const newWidth = e.clientX;
      if (newWidth < 140) {
        setIsSidebarOpen(false);
        setIsSidebarPinned(false);
        setIsResizingLeftSidebar(false);
      } else {
        const clampedWidth = Math.min(Math.max(newWidth, 210), 380);
        setLeftSidebarWidth(clampedWidth);
        localStorage.setItem('bible-left-sidebar-width', clampedWidth.toString());
      }
    };

    const handleMouseUp = () => {
      if (isResizingLeftSidebar) {
        setIsResizingLeftSidebar(false);
      }
    };

    if (isResizingLeftSidebar) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingLeftSidebar]);

  // 앱 전역 인앱 확인 다이얼로그 상태 (브라우저 confirm 팝업 차단 및 사이드바 깜빡임 완전 해결)
  interface AppConfirmDialogState {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    theme?: 'danger' | 'warning' | 'primary' | 'claude';
    onConfirm: () => void;
  }
  const [appConfirmDialog, setAppConfirmDialog] = useState<AppConfirmDialogState | null>(null);

  // 사이드바 Hover 자동 열림/닫힘 및 외부 클릭 처리
  const sidebarCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leftSidebarRef = useRef<HTMLDivElement>(null);
  const sidebarToggleBtnRef = useRef<HTMLButtonElement>(null);

  const openSidebarWithHover = () => {
    if (sidebarCloseTimerRef.current) {
      clearTimeout(sidebarCloseTimerRef.current);
      sidebarCloseTimerRef.current = null;
    }
    setIsSidebarOpen(true);
  };

  const closeSidebarWithHover = () => {
    // 사용자가 클릭으로 고정(Pinned)해두었거나 확인 모달/리사이징 중일 때는 마우스가 벗어나도 절대 닫지 않음
    if (isSidebarPinned || isResizingLeftSidebar || appConfirmDialog?.isOpen) return;
    if (sidebarCloseTimerRef.current) {
      clearTimeout(sidebarCloseTimerRef.current);
    }
    sidebarCloseTimerRef.current = setTimeout(() => {
      setIsSidebarOpen(false);
    }, 280);
  };

  useEffect(() => {
    return () => {
      if (sidebarCloseTimerRef.current) {
        clearTimeout(sidebarCloseTimerRef.current);
      }
    };
  }, []);

  // 사이드바 외부 클릭 시 닫기 (확인 모달 상호작용 중에는 닫히지 않도록 완벽 가드)
  useEffect(() => {
    if (!isSidebarOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (appConfirmDialog?.isOpen) return;
      if (
        leftSidebarRef.current &&
        leftSidebarRef.current.contains(e.target as Node)
      ) {
        return;
      }
      if (
        sidebarToggleBtnRef.current &&
        sidebarToggleBtnRef.current.contains(e.target as Node)
      ) {
        return;
      }
      setIsSidebarOpen(false);
      setIsSidebarPinned(false);
    };

    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [isSidebarOpen, appConfirmDialog]);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isSettingsPageOpen, setIsSettingsPageOpen] = useState(false);
  
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('bible-font-size');
    return saved ? parseInt(saved, 10) : 16;
  });
  const [verseSpacing, setVerseSpacing] = useState(() => {
    const saved = localStorage.getItem('bible-verse-spacing');
    return saved ? Math.min(parseInt(saved, 10), 3) : 3;
  });
  const [searchFontSize, setSearchFontSize] = useState(() => {
    const saved = localStorage.getItem('bible-search-font-size');
    return saved ? parseInt(saved, 10) : 14;
  });

  useEffect(() => {
    localStorage.setItem('bible-font-size', fontSize.toString());
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('bible-verse-spacing', verseSpacing.toString());
  }, [verseSpacing]);

  useEffect(() => {
    localStorage.setItem('bible-search-font-size', searchFontSize.toString());
  }, [searchFontSize]);

  // 복사 설정 서브 아코디언 상태
  const [showCopySettingsAccordion, setShowCopySettingsAccordion] = useState(false);

  // 번역본 한글 / 영어 자동 분류
  const krVersions = React.useMemo(() => versions.filter(v => /[가-힣]/.test(v.name) || !/[a-zA-Z]/.test(v.name)), [versions]);
  const enVersions = React.useMemo(() => versions.filter(v => /[a-zA-Z]/.test(v.name)), [versions]);

  React.useEffect(() => {
    if (krVersions.length > 0 && (!mainKrVersionId || !krVersions.some(v => v.id === mainKrVersionId))) {
      setMainKrVersionId(krVersions[0].id);
    }
    if (enVersions.length > 0 && (!mainEnVersionId || !enVersions.some(v => v.id === mainEnVersionId))) {
      setMainEnVersionId(enVersions[0].id);
    }
  }, [krVersions, enVersions, mainKrVersionId, mainEnVersionId, setMainKrVersionId, setMainEnVersionId]);

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
  const [isSermonOverlay, setIsSermonOverlay] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('bible-sermon-overlay');
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const handleSermonOverlayChange = (overlay: boolean) => {
    setIsSermonOverlay(overlay);
    try {
      localStorage.setItem('bible-sermon-overlay', JSON.stringify(overlay));
    } catch {}
  };
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
  
  // Search popovers (주석 검색 및 구절노트 메모 검색)
  const [showNoteSearch, setShowNoteSearch] = useState(false);
  const [noteSearchTab, setNoteSearchTab] = useState<'recent' | 'byBook'>('recent');
  const [noteSearchQuery, setNoteSearchQuery] = useState('');
  const [noteExpandedBooks, setNoteExpandedBooks] = useState<Record<string, boolean>>({});

  const [showSermonSearch, setShowSermonSearch] = useState(false);
  const [sermonSearchTab, setSermonSearchTab] = useState<'recent' | 'byBook'>('recent');
  const [sermonSearchQuery, setSermonSearchQuery] = useState('');
  const [sermonExpandedBooks, setSermonExpandedBooks] = useState<Record<string, boolean>>({});

  // 1) 주석 검색 필터링 (스마트 성경 구절 인식 '마 1 6', '마태 1:6' 등 최상위 0초 정렬)
  const filteredNoteEntries = React.useMemo(() => {
    const entries = Object.entries(verseData).filter(([_, data]) => data.note && data.note.trim());
    if (!noteSearchQuery.trim()) {
      return entries.map(([verseKey, data]) => ({ verseKey, data, score: 1 }));
    }
    const q = noteSearchQuery.trim();
    return entries
      .map(([verseKey, data]) => {
        const score = getBibleReferenceMatchScore(q, verseKey, data.note);
        return { verseKey, data, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [verseData, noteSearchQuery]);

  // 주석 성경 66권 그룹화
  const noteBookGroups = React.useMemo(() => {
    const map: Record<string, typeof filteredNoteEntries> = {};
    filteredNoteEntries.forEach(item => {
      const bId = item.verseKey.split('_')[0];
      if (!map[bId]) map[bId] = [];
      map[bId].push(item);
    });
    return map;
  }, [filteredNoteEntries]);

  // 2) 구절노트(메모) 검색 필터링 (스마트 성경 구절 인식 '마 1 6', '롬 8:28' 등 최상위 0초 정렬)
  const filteredSermonEntries = React.useMemo(() => {
    const entries = Object.entries(verseData).filter(([_, data]) => data.sermon && data.sermon.trim());
    if (!sermonSearchQuery.trim()) {
      return entries.map(([verseKey, data]) => ({ verseKey, data, score: 1 }));
    }
    const q = sermonSearchQuery.trim();
    return entries
      .map(([verseKey, data]) => {
        const score = getBibleReferenceMatchScore(q, verseKey, data.sermon);
        return { verseKey, data, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [verseData, sermonSearchQuery]);

  // 구절노트(메모) 성경 66권 그룹화
  const sermonBookGroups = React.useMemo(() => {
    const map: Record<string, typeof filteredSermonEntries> = {};
    filteredSermonEntries.forEach(item => {
      const bId = item.verseKey.split('_')[0];
      if (!map[bId]) map[bId] = [];
      map[bId].push(item);
    });
    return map;
  }, [filteredSermonEntries]);
  
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

  // AI 주석 상태
  const { totalRemaining, totalCapacity, remainingDaysText, cloudCommentaryLimit, usedCloudCommentaryCount } = useAiUsage();
  const [isAiCommentaryOpen, setIsAiCommentaryOpen] = useState(false);
  const [aiPanelTab, setAiPanelTab] = useState<AiTabType>('all');
  const [aiRechargeTrigger, setAiRechargeTrigger] = useState(0);
  const [aiSelectedVerse, setAiSelectedVerse] = useState<{
    verse: number;
    text: string;
  } | null>(null);
  const [aiSplitPosition, setAiSplitPosition] = useState<number>(() => {
    const saved = localStorage.getItem('bibleAiSplitPosition');
    return saved ? parseFloat(saved) : 45; // AI 주석창 기본 45% 너비
  });
  const [isAiResizing, setIsAiResizing] = useState(false);

  // 저장된 주석 목록 수 실시간 상태 (AI 패널의 기록 수와 100% 동일하게 일치)
  const [savedHistoryCount, setSavedHistoryCount] = useState<number>(() => {
    try {
      return getCommentaryHistory().length;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    const updateCount = async () => {
      try {
        const { auth } = await import('./api/firebaseConfig');
        const count = await getTotalMergedCommentaryCount(auth.currentUser?.uid || null);
        setSavedHistoryCount(count);
      } catch {
        setSavedHistoryCount(getCommentaryHistory().length);
      }
    };

    // 초기 마운트 시 즉시 실행
    updateCount();

    // Firebase Auth 상태 변경 시에도 카운트 즉시 재계산
    let unsubAuth: (() => void) | undefined;
    import('./api/firebaseConfig').then(({ auth }) => {
      unsubAuth = auth.onAuthStateChanged(() => {
        updateCount();
      });
    }).catch(() => {});

    window.addEventListener('ai-history-updated', updateCount);
    window.addEventListener('storage', updateCount);
    return () => {
      if (unsubAuth) unsubAuth();
      window.removeEventListener('ai-history-updated', updateCount);
      window.removeEventListener('storage', updateCount);
    };
  }, []);

  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    localStorage.setItem('bibleSplitPosition', splitPosition.toString());
  }, [splitPosition]);

  React.useEffect(() => {
    localStorage.setItem('bibleAiSplitPosition', aiSplitPosition.toString());
  }, [aiSplitPosition]);

  // 마우스/터치 드래그 이벤트 핸들러
  React.useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!contentRef.current) return;
      const containerRect = contentRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;

      if (isResizing) {
        const newX = clientX - containerRect.left;
        const newPercent = (newX / containerRect.width) * 100;
        if (newPercent >= 20 && newPercent <= 80) {
          setSplitPosition(newPercent);
        }
      } else if (isAiResizing) {
        const newX = clientX - containerRect.left;
        const newPercent = 100 - ((newX / containerRect.width) * 100);
        if (newPercent >= 25 && newPercent <= 70) {
          setAiSplitPosition(newPercent);
        }
      }
    };

    const handleUp = () => {
      setIsResizing(false);
      setIsAiResizing(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (isResizing || isAiResizing) {
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
  }, [isResizing, isAiResizing]);

  // Navigation State
  const [leftNav, setLeftNav] = useState({ bookId: 'GEN', chapter: 1, verse: 1, scrollTrigger: 0 });
  const [rightNav, setRightNav] = useState({ bookId: 'GEN', chapter: 1, verse: 1, scrollTrigger: 0 });
  
  // 우측 창 전용 번역본 상태 (단일 선택)
  const [rightSelectedVersionId, setRightSelectedVersionId] = useState<string>('built-in-kor-revised');

  // 우측 창 선택 번역본이 유효하지 않은 경우 기본 'built-in-kor-revised' 또는 첫 번째 번역본으로 자동 복구
  React.useEffect(() => {
    if (versions.length > 0) {
      const isValid = versions.some(v => v.id === rightSelectedVersionId);
      if (!isValid) {
        const defaultId = versions.find(v => v.id === 'built-in-kor-revised')?.id || versions[0].id;
        setRightSelectedVersionId(defaultId);
      }
    }
  }, [versions, rightSelectedVersionId]);

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

  // 퀵 서치 처리 로직 (스마트 구절 파서 연동 및 scrollTrigger로 자동 스크롤 보장)
  const handleQuickNav = (query: string, side: 'left' | 'right') => {
    const trimmed = query.trim();
    if (!trimmed) return false;

    // 1) 스마트 성경 구절 인식 파서 우선 시도 (마 1 20, 마 1:20, 마태 1:20, 롬 8:28 등 100% 인식)
    const parsed = parseBibleReference(trimmed);
    if (parsed && parsed.chapter !== undefined) {
      const ch = parsed.chapter;
      const vs = parsed.verse || 1;
      const update = { bookId: parsed.bookId, chapter: ch, verse: vs, scrollTrigger: Date.now() };
      if (side === 'left') setLeftNav(update);
      else setRightNav(update);
      return true;
    }

    // 2) 기존 정규식 fallback
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
        
        const update = { bookId: book.id, chapter: ch, verse: vs, scrollTrigger: Date.now() };
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
    <div className="flex h-screen bg-[#FAF9F5] text-[#2C2B29] overflow-y-auto overflow-x-hidden font-sans custom-scrollbar">
      {/* PWA Smart Install Prompt Banner */}
      <InstallPromptBanner />

      {/* Sidebar - Claude Aesthetic */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside
            ref={leftSidebarRef}
            initial={{ x: -leftSidebarWidth, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -leftSidebarWidth, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            style={{ width: `${leftSidebarWidth}px` }}
            onMouseEnter={openSidebarWithHover}
            onMouseLeave={closeSidebarWithHover}
            className="fixed left-0 top-0 bottom-0 z-50 border-r border-[#EBE6DF] bg-[#FBF9F7] shadow-2xl shadow-black/10 select-none flex flex-col group/sidebar"
          >
            {/* Claude Style Resize Border Handle (화살표 카드 제거, 얇은 샌드 드래그 라인만 유지) */}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsResizingLeftSidebar(true);
              }}
              className={`
                absolute -right-2 top-0 bottom-0 w-4 z-50 cursor-col-resize flex items-center justify-center group/resizer transition-all
                ${isResizingLeftSidebar ? 'opacity-100' : 'opacity-0 hover:opacity-100'}
              `}
              title="드래그하여 너비 조절 (왼쪽으로 밀면 닫힘)"
            >
              {/* Hover/Drag Highlight Line */}
              <div className={`w-0.5 h-full transition-colors ${isResizingLeftSidebar ? 'bg-[#D97757]' : 'bg-[#D97757]/70 group-hover/resizer:bg-[#D97757]'}`} />
            </div>

            <div className="p-3.5 h-full flex flex-col w-full overflow-x-hidden text-[#4A4741]">
              {/* Header: NATIONS BIBLE AI 영문 2줄 표시 + 사이드바 닫기 버튼 */}
              <div className="flex items-center justify-between mb-3 px-1.5 pt-1 pb-2 border-b border-[#F0EBE1]">
                <div className="flex flex-col">
                  <span className="font-serif font-bold text-base text-[#2B2927] tracking-tight leading-tight">NATIONS</span>
                  <span className="font-serif font-bold text-base text-[#2B2927] tracking-tight leading-tight">
                    BIBLE <span className="text-[#C46A40]">AI</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsSidebarOpen(false);
                    setIsSidebarPinned(false);
                  }}
                  className="p-1.5 text-[#8C877D] hover:text-[#2B2927] hover:bg-[#EBE5DC] rounded-lg transition-colors cursor-pointer"
                  title="사이드바 닫기"
                >
                  <PanelLeft className="w-4 h-4 stroke-[1.6px]" />
                </button>
              </div>

              {/* 사이드바 메뉴 컨텐츠 영역 */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden pr-1 no-scrollbar space-y-0.5">

                {/* 복사설정 -> 누르면 메인 화면(중앙) 모달 열림 */}
                <button
                  onClick={() => setShowCopySettingsModal(true)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-normal transition-all whitespace-nowrap ${
                    showCopySettingsModal ? 'bg-[#EBE5DC] text-[#2B2927]' : 'text-[#4A4741] hover:bg-[#F3EFE9]'
                  }`}
                >
                  <Copy className="w-4 h-4 text-[#6E6A63] stroke-[1.5px] shrink-0" />
                  <span>복사설정</span>
                </button>

                {/* 주석검색 */}
                <button
                  onClick={() => setShowNoteSearch(!showNoteSearch)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-normal transition-all whitespace-nowrap ${
                    showNoteSearch ? 'bg-[#EBE5DC] text-[#2B2927]' : 'text-[#4A4741] hover:bg-[#F3EFE9]'
                  }`}
                >
                  <Search className="w-4 h-4 text-[#6E6A63] stroke-[1.5px] shrink-0" />
                  <span>주석검색</span>
                </button>

                {/* 노트검색 */}
                <button
                  onClick={() => setShowSermonSearch(!showSermonSearch)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-normal transition-all whitespace-nowrap ${
                    showSermonSearch ? 'bg-[#EBE5DC] text-[#2B2927]' : 'text-[#4A4741] hover:bg-[#F3EFE9]'
                  }`}
                >
                  <FileEdit className="w-4 h-4 text-[#6E6A63] stroke-[1.5px] shrink-0" />
                  <span>노트검색</span>
                </button>

                {/* 주석 숨기기 / 보이기 (ON/OFF 뱃지 삭제, 텍스트 전환) */}
                <button
                  onClick={() => setShowAnnotations(!showAnnotations)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-normal text-[#4A4741] hover:bg-[#F3EFE9] transition-all whitespace-nowrap"
                >
                  {showAnnotations ? <Eye className="w-4 h-4 text-[#6E6A63] stroke-[1.5px] shrink-0" /> : <EyeOff className="w-4 h-4 text-[#6E6A63] stroke-[1.5px] shrink-0" />}
                  <span>{showAnnotations ? '주석 숨기기' : '주석 보이기'}</span>
                </button>

                {/* 번역본 섹션 (번역본 추가 버튼이 목록 바로 위로 배치) */}
                <div className="pt-3">
                  {/* 번역본 목록 헤더 (아이콘 삭제, 심플 텍스트만) */}
                  <div className="text-[11px] font-medium text-[#8C877D] px-1 mb-1.5">
                    번역본 목록
                  </div>

                  {/* + 번역본 추가 (우측 끝에 삼선 아이콘 및 마우스 오버 시 '방법: 카톡무료문의' 툴팁) */}
                  <div className="w-full flex items-center justify-between px-2.5 py-1 mb-1 rounded-xl hover:bg-[#F3EFE9] transition-all group">
                    <button
                      onClick={() => {
                        if (!isAuthenticated) {
                          alert('번역본을 추가하려면 먼저 구글 계정으로 로그인해 주세요.');
                          return;
                        }
                        setShowUploadModal(true);
                      }}
                      className="flex-1 flex items-center gap-2 py-1 text-xs font-normal text-[#4A4741] cursor-pointer text-left"
                    >
                      <Plus className="w-4 h-4 text-[#6E6A63] stroke-[1.8px] shrink-0" />
                      <span>번역본 추가</span>
                    </button>

                    <a
                      href={policyData.kakaoChatUrl || 'http://pf.kakao.com/_cxjBxaX/chat'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative p-1 text-[#8C877D] hover:text-[#2B2927] hover:bg-[#DED8CE]/60 rounded-md transition-all opacity-40 group-hover:opacity-100 cursor-pointer group/menu shrink-0"
                      title="방법: 카톡무료문의"
                    >
                      <MoreVertical className="w-3.5 h-3.5 stroke-[1.8px]" />
                      
                      {/* 마우스 호버 시 뜨는 플로팅 툴팁 */}
                      <span className="absolute right-0 top-full mt-1 hidden group-hover/menu:flex items-center gap-1 px-2 py-1 bg-[#2C2B29] text-[#FAF9F5] text-[10px] rounded-lg shadow-md whitespace-nowrap z-50 pointer-events-none">
                        방법: 카톡무료문의
                      </span>
                    </a>
                  </div>
                  
                  {/* 번역본 아이템 목록 (드래그로 잡고 이동 가능한 Reorder 목록) */}
                  {versions.length === 0 ? (
                    <p className="text-xs text-[#8C877D] px-2 italic">번역본을 추가해주세요.</p>
                  ) : (
                    <Reorder.Group
                      axis="y"
                      values={versions}
                      onReorder={reorderVersions}
                      className="space-y-0.5 relative no-scrollbar"
                    >
                      {versions.map((v) => (
                        <Reorder.Item
                          key={v.id}
                          value={v}
                          className={`
                            group relative flex items-center gap-1.5 px-2 py-2 rounded-xl cursor-grab active:cursor-grabbing select-none transition-colors duration-150 hover:bg-[#F3EFE9]
                            ${selectedVersionIds.includes(v.id) 
                              ? 'text-[#2B2927] font-medium' 
                              : 'text-[#4A4741]'}
                          `}
                          onClick={() => toggleVersion(v.id)}
                        >
                          {/* 드래그 힌트 그립 아이콘 */}
                          <div 
                            className="text-[#A3A19B] opacity-30 group-hover:opacity-100 transition-opacity shrink-0 cursor-grab active:cursor-grabbing"
                            title="잡고 드래그하여 순서 변경"
                          >
                            <GripVertical className="w-3.5 h-3.5 stroke-[1.8px]" />
                          </div>

                          {/* 원형 체크 동그라미 (글자색 #2B2927과 동일하게 변경) */}
                          <div className={`
                            w-4 h-4 shrink-0 rounded-full border flex items-center justify-center transition-colors
                            ${selectedVersionIds.includes(v.id) ? 'bg-[#2B2927] border-[#2B2927]' : 'border-[#C2BBB0] bg-white'}
                          `}>
                            {selectedVersionIds.includes(v.id) && <Check className="w-2.5 h-2.5 text-white stroke-[2.2px]" />}
                          </div>
                          
                          <span className="flex-1 text-xs tracking-tight truncate leading-tight pointer-events-none select-none whitespace-nowrap">
                            {v.name}
                          </span>
                          
                          {/* 우측 관리 메뉴: 시스템 번역본(개역한글, NRSV)은 삭제 불가 보호 배지, 사용자 번역본만 삭제 메뉴 제공 */}
                          {v.isSystem ? (
                            <div 
                              className="px-1.5 py-0.5 text-[9px] text-[#A3A19B] bg-[#F5F3ED] border border-[#EAE4DA] rounded font-medium select-none shrink-0" 
                              title="기본 제공 번역본 (삭제 불가, 선택 해제 가능)"
                            >
                              기본
                            </div>
                          ) : (
                            <div 
                              className="relative shrink-0" 
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => setActiveDropdownVersionId(activeDropdownVersionId === v.id ? null : v.id)}
                                className="p-1 text-[#8C877D] hover:text-[#2B2927] hover:bg-[#DED8CE]/60 rounded-md transition-all opacity-40 group-hover:opacity-100 cursor-pointer"
                                title="더보기 (삭제)"
                              >
                                <MoreVertical className="w-3.5 h-3.5 stroke-[1.8px]" />
                              </button>

                              {/* 삼점 클릭 시 나오는 삭제 팝오버 메뉴 */}
                              {activeDropdownVersionId === v.id && (
                                <div className="absolute right-0 top-6 w-24 bg-white border border-[#E5E0D8] rounded-xl shadow-lg py-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      setActiveDropdownVersionId(null);
                                      setAppConfirmDialog({
                                        isOpen: true,
                                        title: '번역본 목록에서 삭제',
                                        message: `'${v.name}' 번역본을 목록에서 삭제하시겠습니까?\n(언제든지 상단 + 버튼에서 다시 추가할 수 있습니다.)`,
                                        confirmText: '삭제',
                                        theme: 'danger',
                                        onConfirm: () => {
                                          removeVersion(v.id);
                                        }
                                      });
                                    }}
                                    className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left text-[#D97757] hover:bg-[#F7EEE9] cursor-pointer font-medium"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 stroke-[1.8px]" /> 삭제
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </Reorder.Item>
                      ))}
                    </Reorder.Group>
                  )}
                </div>

                {/* 번역본 목록 아래 구분선 */}
                <div className="my-2.5 border-t border-[#EAE4DA]" />

                {/* AI 주석 메뉴 섹션 */}
                <div className="space-y-0.5">
                  {/* 1. AI 주석 (활성화 되어도 색상 변경 없이 그대로 유지) */}
                  <button
                    onClick={() => {
                      setAiRechargeTrigger(0);
                      setAiPanelTab('all');
                      setIsAiCommentaryOpen(true);
                      setIsSidebarOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-normal text-[#4A4741] hover:bg-[#F3EFE9] transition-all cursor-pointer whitespace-nowrap"
                  >
                    <ClaudeSparkleIcon className="w-4 h-4 text-[#6E6A63] shrink-0" />
                    <span>AI 주석</span>
                  </button>

                  {/* 2. 충전 남은횟수 (아래에 남은 일수 명시) */}
                  <button
                    onClick={() => {
                      if (!isAuthenticated) {
                        setShowAuthModal(true);
                        return;
                      }
                      setIsAiCommentaryOpen(true);
                      setAiRechargeTrigger(prev => prev + 1);
                      setIsSidebarOpen(false);
                    }}
                    className="w-full flex flex-col gap-1 px-2.5 py-2 rounded-xl text-xs font-normal text-[#4A4741] hover:bg-[#F3EFE9] transition-all cursor-pointer whitespace-nowrap"
                    title="AI 주석 잔여 횟수 확인 및 충전"
                  >
                    <div className="w-full flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <CreditCard className="w-3.5 h-3.5 text-[#6E6A63] stroke-[1.5px] shrink-0" />
                        <span className="whitespace-nowrap">충전</span>
                      </div>
                      <span className="text-xs font-medium text-[#6E6A63] whitespace-nowrap">
                        <span className="text-[#8C877D] font-normal mr-1">보유 크레딧:</span>
                        <strong className="font-bold text-[#2B2927]">{totalRemaining}</strong>
                      </span>
                    </div>
                    {/* 충전 아래 유효기간 정보: 크레딧 수치 아래로 단정하게 우측 정렬 */}
                    <div className="w-full flex items-center justify-end gap-1.5 text-[11px] text-[#8C877D] whitespace-nowrap">
                      <span>유효기간</span>
                      <span className={`font-medium ${remainingDaysText === '-' ? 'text-[#2B2927]' : 'text-[#C46A40]'}`}>
                        {remainingDaysText}
                      </span>
                    </div>
                  </button>

                  {/* 비로그인 시 충전 남은횟수 및 유효기간 아래: 가입 혜택 안내 (위아래 충전/저장과 여백/아이콘 완전 정렬) */}
                  {!isAuthenticated && promoSettings?.enabled && (
                    <div
                      onClick={() => setShowAuthModal(true)}
                      className="w-full flex flex-col gap-1 px-2.5 py-2 rounded-xl text-xs font-normal text-[#4A4741] hover:bg-[#F3EFE9] transition-all cursor-pointer whitespace-nowrap group"
                    >
                      <div className="w-full flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Gift className="w-3.5 h-3.5 text-[#6E6A63] stroke-[1.5px] shrink-0" />
                          <span className="whitespace-nowrap text-[#4A4741]">
                            {(promoSettings.name && !promoSettings.name.includes('10회') && !promoSettings.name.includes('크레딧') && !promoSettings.name.includes('가입')) ? promoSettings.name : '특별혜택기간'}
                          </span>
                        </div>
                        <span className="text-xs font-medium text-[#2B2927] whitespace-nowrap">
                          {(promoSettings.description || '200크레딧 제공').replace(/^(?:특별혜택기간|프로모션)\s*:\s*/, '').replace(/200\s*크[래레]딧\s*제공/, '200크레딧 제공').replace('크래딧', '크레딧').trim()}
                        </span>
                      </div>
                      <div className="w-full flex items-center justify-end">
                        <span className="text-[11px] font-medium text-[#C46A40] group-hover:underline cursor-pointer">
                          혜택 받기 →
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 3. 주석기록 30일 보관 / 클라우드 평생 보관 */}
                  <button
                    onClick={() => {
                      if (!isAuthenticated) {
                        setShowAuthModal(true);
                        return;
                      }
                      setAiPanelTab('history');
                      setIsAiCommentaryOpen(true);
                      setIsSidebarOpen(false);
                    }}
                    className="w-full flex flex-col gap-1 px-2.5 py-2 rounded-xl text-xs font-normal text-[#4A4741] hover:bg-[#F3EFE9] transition-all cursor-pointer whitespace-nowrap"
                    title="저장된 주석 목록 및 보관 상태 확인"
                  >
                    <div className="w-full flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Database className="w-3.5 h-3.5 text-[#6E6A63] stroke-[1.5px] shrink-0" />
                        <span className="whitespace-nowrap">저장</span>
                      </div>
                      <span className="text-xs font-medium text-[#2B2927] whitespace-nowrap">
                        {cloudCommentaryLimit > 0 
                          ? (cloudCommentaryLimit >= 30000 ? '주석 클라우드 무제한' : `주석 클라우드 ${cloudCommentaryLimit}`) 
                          : '30일 기본 보관'}
                      </span>
                    </div>
                    {/* 저장 아래 보관 상태 및 목록 수: 충전 유효기간과 완벽 정렬 */}
                    <div className="w-full flex items-center justify-end gap-1.5 text-[11px] text-[#8C877D] whitespace-nowrap">
                      <span>{cloudCommentaryLimit > 0 ? '서버보관 중' : '기기보관 중'}</span>
                      {(() => {
                        const effectiveCount = Math.max(savedHistoryCount, cloudCommentaryLimit > 0 ? (usedCloudCommentaryCount || 0) : 0);
                        return (
                          <span 
                            className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-transparent border border-[#2B2927]/40 text-[#2B2927] shrink-0"
                            title={`현재 저장된 주석 목록: ${effectiveCount}개`}
                          >
                            {effectiveCount}
                          </span>
                        );
                      })()}
                    </div>
                  </button>
                </div>

              </div>

              {/* 최하단: 구글 로그인 (흑백 구글 아이콘) 및 설정 */}
              <div className="mt-auto pt-2 border-t border-[#F0EBE1] space-y-1 shrink-0">
                {!isAuthenticated ? (
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="w-full flex items-center gap-2 py-2 px-2.5 bg-[#F3EFE9]/70 border border-[#E5E0D8] text-[#4A4741] rounded-xl hover:bg-[#EBE5DC] transition-all group cursor-pointer shadow-2xs"
                  >
                    <svg className="w-4 h-4 shrink-0 grayscale opacity-70 group-hover:opacity-100 transition-opacity" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    <span className="text-xs font-normal text-[#4A4741]">로그인 / 간편가입</span>
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between bg-[#F3EFE9]/70 border border-[#E8E2D9] p-1.5 rounded-xl">
                      <div className="flex items-center gap-2 overflow-hidden">
                        {userProfile?.picture ? (
                          <img src={userProfile.picture} alt="Profile" className="w-6 h-6 rounded-full shrink-0 border border-[#E5E0D8]" />
                        ) : (
                          <div className="w-6 h-6 bg-[#EBE5DC] text-[#4A4741] rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">
                            {userProfile?.name?.charAt(0) || 'U'}
                          </div>
                        )}
                        <span className="text-xs font-normal text-[#2B2927] truncate">{userProfile?.name || '사용자'}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {/* 최고 관리자 전용 admin 링크 */}
                        {isAdminUser(userProfile?.email) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setShowAdminDashboardModal(true);
                            }}
                            className="px-1.5 py-0.5 text-[10px] font-medium text-[#7D786F] hover:text-[#2B2927] hover:bg-[#EBE5DC] rounded transition-all cursor-pointer"
                            title="관리자 설정"
                          >
                            admin
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setAppConfirmDialog({
                            isOpen: true,
                            title: '로그아웃',
                            message: '로그아웃 하시겠습니까?\n모든 개인 데이터와 세션이 안전하게 저장됩니다.',
                            confirmText: '로그아웃',
                            theme: 'claude',
                            onConfirm: async () => {
                              try {
                                await signOut(auth);
                              } catch (e) {}
                              try {
                                const { gdriveWebService } = await import('./api/gdriveWebService');
                                await gdriveWebService.logout();
                              } catch (e) {}
                              try {
                                const { clearAiUsageState } = await import('./services/aiUsageService');
                                clearAiUsageState();
                              } catch (e) {}
                              // 로컬 스토리지의 모든 개인 데이터 및 세션 완벽 삭제
                              localStorage.removeItem('cached_auth_user');
                              localStorage.removeItem('offline_user_profile');
                              localStorage.removeItem('gdrive_token');
                              localStorage.removeItem('gdrive_token_expires_at');
                              localStorage.removeItem('nations_ai_commentary_usage_v1');
                              localStorage.removeItem('commentary_history_v1');
                              localStorage.removeItem('bible-selected-versions');
                              sessionStorage.clear();
                              window.location.reload();
                            }
                          });
                        }}
                        className="px-2 py-0.5 text-[10px] font-normal text-[#D97757] bg-[#F7EEE9] hover:bg-[#F2DFD5] rounded-md transition-all border border-[#F0DCD3] cursor-pointer"
                      >
                        로그아웃
                      </button>
                    </div>
                  </div>
                </div>
              )}

                {/* 설정 */}
                <button 
                  onClick={() => setIsSettingsPageOpen(true)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 w-full rounded-xl transition-all cursor-pointer ${
                    isSettingsPageOpen 
                      ? 'bg-[#EBE5DC] text-[#2B2927] font-medium' 
                      : 'text-[#4A4741] hover:text-[#2B2927] hover:bg-[#F3EFE9]'
                  }`}
                >
                  <Settings className="w-4 h-4 stroke-[1.5px] text-[#6E6A63]" />
                  <span className="text-xs font-normal">설정</span>
                </button>

                {/* 최하단 바닥글: 사업자 요약 정보 + 카카오톡 버튼 2개 + 약관/개인정보 모달 링크 */}
                <div className="pt-2 mt-1 border-t border-[#F0EBE1] text-[10px] text-[#A39E94] leading-relaxed space-y-1.5">
                  {/* 네이션스 솔루션 글자 옆 카카오 버튼 2개 */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-[#7D786F] shrink-0">
                      {policyData.businessName || '네이션스 솔루션'}
                    </span>

                    <a
                      href={policyData.kakaoChatUrl || 'http://pf.kakao.com/_cxjBxaX/chat'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#FEE500] hover:bg-[#FDD800] text-[#3C1E1E] text-[10px] font-bold rounded-full transition-all shadow-2xs active:scale-95 shrink-0 cursor-pointer"
                      title="1:1 문의 바로가기"
                    >
                      <svg className="w-2.5 h-2.5 stroke-[#3C1E1E] stroke-[2.8] fill-none shrink-0" viewBox="0 0 24 24">
                        <path d="M12 3c-5.52 0-10 3.58-10 8 0 2.87 1.89 5.4 4.77 6.77l-1.2 4.43c-.11.41.34.75.7.53l5.24-3.48c.16.01.32.02.49.02 5.52 0 10-3.58 10-8s-4.48-8-10-8z" />
                      </svg>
                      <span>1:1 문의</span>
                    </a>
                  </div>

                  <div className="flex items-center gap-1.5 text-[#8C877D] flex-wrap">
                    {policyData.representative && (
                      <span className="text-[#A39E94]">대표 {policyData.representative} •</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setPolicyModal({ isOpen: true, tab: 'terms' })}
                      className="hover:text-[#C46A40] hover:underline cursor-pointer"
                    >
                      이용약관
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => setPolicyModal({ isOpen: true, tab: 'privacy' })}
                      className="hover:text-[#C46A40] hover:underline cursor-pointer"
                    >
                      개인정보처리방침
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => setPolicyModal({ isOpen: true, tab: 'business' })}
                      className="hover:text-[#C46A40] hover:underline cursor-pointer"
                    >
                      사업자정보
                    </button>
                  </div>
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
              marginRight: isSermonSidebarOpen && sermonDockPosition === 'right' && !isSermonCollapsed && !isSearchOpen && !isSermonOverlay ? `${sermonSidebarWidth}px` : 0,
              marginBottom: isSermonSidebarOpen && sermonDockPosition === 'bottom' && !isSermonCollapsed && !isSermonOverlay ? `${sermonSidebarHeight}px` : 0,
            }}
          >
            {/* Header - 슬림하고 클로드 스타일에 맞춘 상단바 */}
            <header className="min-h-14 border-b border-[#E5E0D8] flex items-center justify-between px-4 md:px-6 py-2 bg-[#FBF9F7]/95 backdrop-blur-md sticky top-0 z-30 shadow-2xs">
              
              {/* Left: 사이드바 토글 버튼 & AI 주석 버튼 (좌측 사이드바 옆) */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button 
                  ref={sidebarToggleBtnRef}
                  type="button"
                  onClick={() => {
                    if (sidebarCloseTimerRef.current) {
                      clearTimeout(sidebarCloseTimerRef.current);
                      sidebarCloseTimerRef.current = null;
                    }
                    if (isSidebarOpen && isSidebarPinned) {
                      setIsSidebarOpen(false);
                      setIsSidebarPinned(false);
                    } else {
                      setIsSidebarOpen(true);
                      setIsSidebarPinned(true);
                    }
                  }}
                  onMouseEnter={openSidebarWithHover}
                  onMouseLeave={closeSidebarWithHover}
                  className="p-1.5 hover:bg-[#F3EFE9] rounded-lg transition-colors text-[#524E48] hover:text-[#2B2927] shrink-0 border border-transparent hover:border-[#E5E0D8] cursor-pointer"
                  title="사이드바 (클릭하면 고정되어 열리며, 마우스를 올리면 자동으로 열립니다)"
                >
                  <PanelLeft className="w-5 h-5 stroke-[1.6px]" />
                </button>

                {/* AI 주석 버튼 (좌측 사이드바 토글 바로 옆) */}
                <button 
                  onClick={() => {
                    const next = !isAiCommentaryOpen;
                    setAiRechargeTrigger(0);
                    setIsAiCommentaryOpen(next);
                    if (next && !aiSelectedVerse) {
                      const vNum = leftNav.verse || 1;
                      const bookObj = versions.find(v => selectedVersionIds.includes(v.id)) || versions[0];
                      const verseText = bookObj?.verses?.find(v => v.bookId === leftNav.bookId && v.chapter === leftNav.chapter && v.verse === vNum)?.text || '';
                      setAiSelectedVerse({ verse: vNum, text: verseText });
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all text-xs shrink-0 cursor-pointer ${
                    isAiCommentaryOpen 
                      ? 'bg-[#FAF0EB] text-[#C46A40] font-medium border border-[#F1D3C6] shadow-2xs' 
                      : 'text-[#4A4741] hover:bg-[#F3EFE9] border border-transparent hover:border-[#E5E0D8]'
                  }`}
                  title="Gemini 3.6 Flash 기반 성경 원어·배경·설교 주석"
                >
                  <ClaudeSparkleIcon className={`w-3.5 h-3.5 ${isAiCommentaryOpen ? 'text-[#C46A40]' : 'text-[#6E6A63]'}`} />
                  <span className="font-normal">AI 주석</span>
                </button>

                {isSettingsPageOpen && (
                  <div className="flex items-center gap-2 pl-1">
                    <div className="w-px h-3.5 bg-[#E5E0D8]"></div>
                    <button
                      onClick={() => setIsSettingsPageOpen(false)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#6E6A63] hover:text-[#2B2927] hover:bg-[#F3EFE9] rounded-lg transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 stroke-[1.8px]" />
                      <span>성경 본문</span>
                    </button>
                    <span className="text-xs text-[#8C877D]">/</span>
                    <span className="text-xs font-semibold text-[#2B2927]">환경설정</span>
                  </div>
                )}
              </div>

              {/* Right: 핵심 3개 메뉴 (미니멀 클로드 스타일) */}
              <div className="flex items-center gap-1 shrink-0">
                {/* 1) 본문 듀얼뷰 */}
                <button 
                  onClick={() => {
                    if (!isDualView) {
                      if (!versions.some(v => v.id === rightSelectedVersionId)) {
                        const defaultId = versions.find(v => v.id === 'built-in-kor-revised')?.id || versions[0]?.id || 'built-in-kor-revised';
                        setRightSelectedVersionId(defaultId);
                      }
                      setRightNav({ ...leftNav });
                    }
                    setIsDualView(!isDualView);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all text-xs font-normal shrink-0 cursor-pointer ${
                    isDualView 
                      ? 'bg-[#EBE5DC] text-[#2B2927] font-medium' 
                      : 'text-[#4A4741] hover:bg-[#F3EFE9]'
                  }`}
                >
                  <Columns className="w-4 h-4 stroke-[1.5px] text-[#6E6A63]" />
                  <span>본문 듀얼뷰</span>
                </button>

                {/* 2) 설교노트 */}
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleSermonSidebar(); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all text-xs font-normal shrink-0 cursor-pointer ${
                    isSermonSidebarOpen 
                      ? 'bg-[#EBE5DC] text-[#2B2927] font-medium' 
                      : 'text-[#4A4741] hover:bg-[#F3EFE9]'
                  }`}
                >
                  <FileEdit className="w-4 h-4 stroke-[1.5px] text-[#6E6A63]" /> 
                  <span>설교노트</span>
                </button>

                {/* 3) 성경검색 */}
                <button 
                  onClick={() => setIsSearchOpen(!isSearchOpen)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all text-xs font-normal shrink-0 cursor-pointer ${
                    isSearchOpen 
                      ? 'bg-[#EBE5DC] text-[#2B2927] font-medium' 
                      : 'text-[#4A4741] hover:bg-[#F3EFE9]'
                  }`}
                >
                  <Search className="w-4 h-4 stroke-[1.5px] text-[#6E6A63]" />
                  <span>성경검색</span>
                </button>
              </div>
            </header>

            {/* Content Area */}
            <div ref={contentRef} className="flex-1 overflow-hidden relative bg-[#FAF9F5]">
              {isSettingsPageOpen ? (
                <SettingsPage 
                  onClose={() => setIsSettingsPageOpen(false)}
                  fontSize={fontSize}
                  setFontSize={setFontSize}
                  lineHeight={lineHeight}
                  setLineHeight={setLineHeight}
                  verseSpacing={verseSpacing}
                  setVerseSpacing={setVerseSpacing}
                  searchFontSize={searchFontSize}
                  setSearchFontSize={setSearchFontSize}
                  onOpenAdminModal={() => setShowAdminModal(true)}
                />
              ) : versions.length === 0 ? (
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
                    className="px-8 py-3 bg-[#C96442] hover:bg-[#B55434] text-white rounded-xl font-semibold transition-all shadow-xs hover:scale-[1.02]"
                  >
                    성경 파일 업로드하기
                  </button>
                </div>
              ) : selectedVersionIds.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-[#A3A19B] p-12 italic">
                  <p>왼쪽 사이드바에서 표시할 성경 번역본을 체크해 주세요.</p>
                </div>
              ) : (
                <div className="flex h-full overflow-hidden bg-[#FAF9F5] relative">
                  {/* 메인 성경 본문 영역 (단독 또는 듀얼뷰) */}
                  <div 
                    className="flex h-full overflow-hidden bg-[#FAF9F5] relative"
                    style={{ width: isAiCommentaryOpen ? `${100 - aiSplitPosition}%` : '100%' }}
                  >
                    {/* Left Pane (Main) */}
                    <div 
                      className={`flex flex-col bg-[#FAF9F5] relative z-10 ${isDualView ? 'border-r border-[#E7E5DF]' : 'w-full'}`}
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
                          verseSpacing={verseSpacing}
                          isMainPane={true}
                          onCopyToSermon={(text) => {
                            setClipboardSermonText(text);
                            setIsSermonSidebarOpen(true);
                          }}
                          onNavigateToDualView={(bId, chapter, verse) => {
                            if (!versions.some(v => v.id === rightSelectedVersionId)) {
                              const defaultId = versions.find(v => v.id === 'built-in-kor-revised')?.id || versions[0]?.id || 'built-in-kor-revised';
                              setRightSelectedVersionId(defaultId);
                            }
                            setIsDualView(true);
                            setRightNav({ bookId: bId, chapter, verse, scrollTrigger: Date.now() });
                          }}
                          onVerseSelect={(verse, text) => {
                            setAiSelectedVerse({ verse, text });
                          }}
                          onOpenAiCommentary={(verse, text) => {
                            setAiSelectedVerse({ verse, text });
                            setIsAiCommentaryOpen(true);
                          }}
                        />
                      </div>
                    </div>

                    {/* Resizer Bar (본문 듀얼뷰용) */}
                    {isDualView && (
                      <div 
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setIsResizing(true);
                        }}
                        onTouchStart={() => {
                          setIsResizing(true);
                        }}
                        className="absolute top-0 bottom-0 z-10 w-4 -ml-2 cursor-col-resize group/dual flex items-center justify-center transition-all opacity-0 hover:opacity-100 touch-none"
                        style={{ left: `${splitPosition}%` }}
                      >
                        <div className="w-0.5 h-full bg-[#D97757] transition-colors" />
                      </div>
                    )}

                    {/* Right Pane (Reference) */}
                    {isDualView && (
                      <div 
                        className="flex flex-col bg-[#FAF9F5] relative z-0 border-l border-[#E7E5DF]"
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
                        <div className="flex-1 overflow-hidden bg-[#F5F3ED]/30">
                          <BibleViewer 
                            key={`right-${rightNav.bookId}-${rightNav.chapter}-${rightNav.verse}-${rightNav.scrollTrigger}-${rightSelectedVersionId}`}
                            selectedVersions={(() => {
                              const matched = versions.filter(v => v.id === rightSelectedVersionId);
                              if (matched.length > 0) return matched;
                              const fallback = versions.find(v => v.id === 'built-in-kor-revised') || versions[0];
                              return fallback ? [fallback] : [];
                            })()} 
                            currentBookId={rightNav.bookId}
                            currentChapter={rightNav.chapter}
                            highlightVerse={rightNav.verse}
                            fontSize={fontSize}
                            lineHeight={lineHeight}
                            verseSpacing={verseSpacing}
                            isMainPane={false}
                            headerRightNode={
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-semibold text-[#A3A19B] uppercase tracking-tight">참고번역</span>
                                <select 
                                  value={rightSelectedVersionId}
                                  onChange={(e) => setRightSelectedVersionId(e.target.value)}
                                  className="bg-[#FAF0EB] text-xs font-semibold text-[#C96442] px-2 py-0.5 rounded-lg border border-[#F1D3C6] outline-none cursor-pointer hover:bg-[#F5E2DA] transition-colors"
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
                              if (!versions.some(v => v.id === rightSelectedVersionId)) {
                                const defaultId = versions.find(v => v.id === 'built-in-kor-revised')?.id || versions[0]?.id || 'built-in-kor-revised';
                                setRightSelectedVersionId(defaultId);
                              }
                              setIsDualView(true);
                              setRightNav({ bookId: bId, chapter, verse, scrollTrigger: Date.now() });
                            }}
                            onVerseSelect={(verse, text) => {
                              setAiSelectedVerse({ verse, text });
                            }}
                            onOpenAiCommentary={(verse, text) => {
                              setAiSelectedVerse({ verse, text });
                              setIsAiCommentaryOpen(true);
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* AI 주석창 리사이저 바 */}
                  {isAiCommentaryOpen && (
                    <div 
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setIsAiResizing(true);
                      }}
                      onTouchStart={() => {
                        setIsAiResizing(true);
                      }}
                      className="absolute top-0 bottom-0 z-10 w-4 -ml-2 cursor-col-resize group/ai flex items-center justify-center transition-all opacity-0 hover:opacity-100 touch-none"
                      style={{ left: `${100 - aiSplitPosition}%` }}
                    >
                      <div className="w-0.5 h-full bg-[#C46A40] transition-colors" />
                    </div>
                  )}

                  {/* AI 주석 듀얼뷰 패널 */}
                  {isAiCommentaryOpen && (
                    <div 
                      className="h-full z-20 flex-shrink-0"
                      style={{ width: `${aiSplitPosition}%` }}
                    >
                      <AiCommentaryPanel 
                        isOpen={isAiCommentaryOpen}
                        onClose={() => {
                          setIsAiCommentaryOpen(false);
                          setAiRechargeTrigger(0);
                        }}
                        onOpenAuthModal={() => setShowAuthModal(true)}
                        initialTab={aiPanelTab}
                        openRechargeTrigger={aiRechargeTrigger}
                        onResetRechargeTrigger={() => setAiRechargeTrigger(0)}
                        currentBookName={BIBLE_LIST.find(b => b.id === leftNav.bookId)?.name || leftNav.bookId}
                        currentBookId={leftNav.bookId}
                        currentChapter={leftNav.chapter}
                        currentVerse={aiSelectedVerse?.verse || leftNav.verse || 1}
                        scriptureText={
                          aiSelectedVerse?.text || 
                          (versions.find(v => selectedVersionIds.includes(v.id)) || versions[0])?.verses?.find(
                            v => v.bookId === leftNav.bookId && v.chapter === leftNav.chapter && v.verse === (leftNav.verse || 1)
                          )?.text || ''
                        }
                        onCopyToSermon={(text) => {
                          setClipboardSermonText(text);
                          setIsSermonSidebarOpen(true);
                        }}
                        onNavigateToVerse={(bookId, chapter, verse, text) => {
                          setLeftNav({ bookId, chapter, verse, scrollTrigger: Date.now() });
                          setAiSelectedVerse({ verse, text: text || '' });
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </main>
        </div>

        {/* Search Side Panel - Claude Style */}
        {isSearchOpen && (
          <aside className="search-side-panel w-[350px] shrink-0 border-l border-[#E5E0D8] bg-[#FBF9F7] text-[#2B2927]">
            <div className="search-panel-header bg-[#FBF9F7] border-b border-[#F0EBE1] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-[#6E6A63] stroke-[1.8px]" />
                  <h2 className="text-sm font-semibold text-[#2B2927]">성경 검색</h2>
                </div>
                <button 
                  onClick={() => setIsSearchOpen(false)}
                  className="p-1 hover:bg-[#F3EFE9] rounded-lg text-[#8C877D] hover:text-[#2B2927] transition-colors cursor-pointer"
                  title="검색 닫기"
                >
                  <X className="w-4 h-4 stroke-[1.8px]" />
                </button>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex bg-[#F3EFE9] p-0.5 rounded-xl border border-[#E5E0D8] w-3/5">
                    <button
                      onClick={() => setSearchMode('standard')}
                      className={`flex-1 py-1 rounded-lg text-xs font-medium transition-all ${
                        searchMode === 'standard' ? 'bg-white text-[#2B2927] shadow-2xs font-semibold' : 'text-[#6E6A63] hover:text-[#2B2927]'
                      }`}
                    >
                      일반 검색
                    </button>
                    <button
                      onClick={() => setSearchMode('semantic')}
                      className={`flex-1 py-1 rounded-lg text-xs font-medium transition-all ${
                        searchMode === 'semantic' ? 'bg-white text-[#2B2927] shadow-2xs font-semibold' : 'text-[#6E6A63] hover:text-[#2B2927]'
                      }`}
                    >
                      유사 구절
                    </button>
                  </div>
                  <select 
                    value={searchRange}
                    onChange={(e) => setSearchRange(e.target.value as SearchRange)}
                    className="flex-1 bg-white border border-[#E5E0D8] text-xs font-normal px-2.5 py-1.5 rounded-xl text-[#2B2927] outline-none h-full shadow-2xs cursor-pointer hover:bg-[#F3EFE9] transition-colors"
                  >
                    <option value="all">전체 범위</option>
                    <option value="ot">구약 전체</option>
                    <option value="nt">신약 전체</option>
                    <option value="book">현재 권만</option>
                  </select>
                </div>

                {searchMode === 'standard' && (
                  <div className="bg-[#F3EFE9]/70 border border-[#E5E0D8] rounded-xl p-2.5 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#8C877D] uppercase tracking-wider">검색 옵션</span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input type="checkbox" checked={logicMode === 'AND'} onChange={() => setLogicMode(logicMode === 'AND' ? 'OR' : 'AND')} className="accent-[#524E48] rounded" />
                        <span className="text-xs font-normal text-[#4A4741]">모든 단어 (AND)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input type="checkbox" checked={matchMode === 'exact'} onChange={() => setMatchMode(matchMode === 'exact' ? 'partial' : 'exact')} className="accent-[#524E48] rounded" />
                        <span className="text-xs font-normal text-[#4A4741]">완전 일치</span>
                      </label>
                    </div>
                  </div>
                )}

                <div className="relative group">
                  <SearchInput 
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder={searchMode === 'standard' ? "검색어 입력 (예: 아브라함 이삭)" : "비슷한 표현 뉘앙스 검색"}
                    className="w-full h-9 bg-white border border-[#E5E0D8] rounded-xl pl-3 pr-8 text-xs focus:outline-none focus:border-[#524E48] transition-all font-normal text-[#2B2927] placeholder:text-[#8C877D] shadow-2xs"
                  />
                  <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-[#8C877D] stroke-[1.8px]" />
                </div>
              </div>
            </div>

            {/* Search Result List */}
            <div className="search-result-list p-3 custom-scrollbar bg-[#FBF9F7] overflow-y-auto">
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
                    className="group bg-white border border-[#E5E0D8] rounded-xl p-3 mb-2 shadow-2xs hover:border-[#DED8CE] hover:bg-[#F3EFE9]/50 transition-all cursor-pointer"
                  >
                    <div className="flex justify-between items-start mb-1.5">
                      <span className="text-xs font-bold text-[#D97757] bg-[#F7EEE9] px-2 py-0.5 rounded-md border border-[#F0DCD3]">{res.bookName} {res.chapter}:{res.verse}</span>
                      <span className="text-[10px] font-medium text-[#8C877D]">
                        {versionMap.get(res.versionId) || 'Unknown'}
                      </span>
                    </div>
                    <p 
                      className="text-[#2B2927] font-serif leading-relaxed"
                      style={{ fontSize: `${searchFontSize}px` }}
                    >
                      {res.content}
                    </p>
                  </div>
                ));
              })() : searchQuery.length < 2 && searchMode === 'standard' ? (
                <div className="p-2 space-y-2.5 text-xs text-[#4A4741]">
                  <div className="bg-white p-3 rounded-xl border border-[#E5E0D8] space-y-1.5">
                    <p className="font-semibold text-[#2B2927] text-xs">1. 모든단어 (AND)</p>
                    <div className="text-[11px] text-[#6E6A63] leading-relaxed pl-2 border-l-2 border-[#E5E0D8] space-y-1">
                      <p><span className="font-medium text-[#2B2927]">체크 시:</span> 모든 검색 단어가 포함된 구절 검색</p>
                      <p><span className="font-medium text-[#8C877D]">해제 시:</span> 단어 중 하나라도 포함되면 검색</p>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-[#E5E0D8] space-y-1.5">
                    <p className="font-semibold text-[#2B2927] text-xs">2. 완전일치 (Exact Match)</p>
                    <div className="text-[11px] text-[#6E6A63] leading-relaxed pl-2 border-l-2 border-[#E5E0D8] space-y-1">
                      <p><span className="font-medium text-[#2B2927]">체크 시:</span> 정확히 조사까지 일치하는 구절 검색</p>
                      <p><span className="font-medium text-[#8C877D]">해제 시:</span> 단어 포함 구절 모두 검색</p>
                    </div>
                  </div>

                  <div className="p-3 bg-[#F3EFE9]/70 rounded-xl border border-[#E5E0D8]">
                    <p className="text-[11px] text-[#8C877D] leading-relaxed">
                      * 검색어 사이에 띄어쓰기를 입력하면 여러 단어를 함께 검색할 수 있습니다.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-[#8C877D]">
                  <Search className="w-10 h-10 mb-3 opacity-30 stroke-[1.5px]" />
                  <p className="text-xs font-normal">검색 결과가 없습니다.</p>
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
                        alert('성경번역본이 구글 드라이브(Nations Bible)에 안전하게 보관되었습니다!');
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
        isOverlay={isSermonOverlay}
        onOverlayChange={handleSermonOverlayChange}
        sidebarWidth={sermonSidebarWidth}
        onSidebarWidthChange={setSermonSidebarWidth}
        sidebarHeight={sermonSidebarHeight}
        onSidebarHeightChange={setSermonSidebarHeight}
      />

      {/* Note Search Modal (구절 주석 보관함 검색) */}
      <AnimatePresence>
        {showNoteSearch && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNoteSearch(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-xl bg-[#FAF9F5] rounded-2xl border border-[#E7E5DF] shadow-2xl overflow-hidden flex flex-col max-h-[82vh]"
            >
              {/* Header (구절주석 검색) */}
              <div className="p-4 border-b border-[#E7E5DF] bg-[#FAF9F5] space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[#2C2B29] stroke-[1.8px] shrink-0" />
                    <span className="font-serif font-bold text-sm text-[#2C2B29]">구절주석 검색 <span className="font-normal text-xs text-[#8C877D]">내 개인 주석</span></span>
                  </div>
                  <button 
                    onClick={() => setShowNoteSearch(false)} 
                    className="p-1 hover:bg-[#EAE4DA] rounded-lg transition-colors text-[#8C877D] hover:text-[#2C2B29] cursor-pointer"
                    title="닫기"
                  >
                    <X className="w-4 h-4 stroke-[1.8px]" />
                  </button>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A19B] stroke-[1.5px]" />
                  <input 
                    type="text" 
                    autoFocus
                    placeholder="구절, 책 이름, 주석 본문 검색..."
                    value={noteSearchQuery}
                    onChange={e => setNoteSearchQuery(e.target.value)}
                    className="w-full bg-white border border-[#E7E5DF] rounded-xl pl-9 pr-8 py-2.5 text-xs text-[#2C2B29] outline-none shadow-2xs focus:border-[#8C877D] focus:ring-2 focus:ring-[#2C2B29]/5 transition-all placeholder:text-[#A39E94]"
                  />
                  {noteSearchQuery && (
                    <button
                      onClick={() => setNoteSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A3A19B] hover:text-[#2C2B29] p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Tab Switcher (AI 주석 기록 탭과 100% 동일) */}
                <div className="flex items-center justify-between pt-0.5">
                  <div className="flex bg-[#EAE6DF] p-0.5 rounded-lg gap-0.5">
                    <button
                      onClick={() => setNoteSearchTab('recent')}
                      className={`px-3 py-1 text-xs rounded-md transition-all cursor-pointer ${
                        noteSearchTab === 'recent'
                          ? 'bg-white font-bold text-[#2C2B29] shadow-xs'
                          : 'text-[#8C877D] hover:text-[#2C2B29]'
                      }`}
                    >
                      최신순
                    </button>
                    <button
                      onClick={() => setNoteSearchTab('byBook')}
                      className={`px-3 py-1 text-xs rounded-md transition-all cursor-pointer ${
                        noteSearchTab === 'byBook'
                          ? 'bg-white font-bold text-[#2C2B29] shadow-xs'
                          : 'text-[#8C877D] hover:text-[#2C2B29]'
                      }`}
                    >
                      권별보기
                    </button>
                  </div>
                  <span className="text-xs text-[#8C877D]">
                    총 <strong className="text-[#2C2B29] font-bold">{filteredNoteEntries.length}</strong>개
                  </span>
                </div>
              </div>

              {/* Body Content */}
              <div className="flex-1 overflow-y-auto p-3.5 bg-[#FAF9F5] custom-scrollbar flex flex-col gap-2">
                {filteredNoteEntries.length === 0 ? (
                  <div className="text-center py-12 text-[#A39E94] text-xs font-medium">
                    {noteSearchQuery ? '검색 결과가 없습니다.' : '작성된 주석이 없습니다.'}
                  </div>
                ) : noteSearchTab === 'recent' ? (
                  // 1) 최신순 / 점수순 목록 (구절 완벽 일치 최상위, 본문 한 줄 요약)
                  filteredNoteEntries.map(({ verseKey, data, score }) => {
                    const [bId, chStr, vsStr] = verseKey.split('_');
                    const vNum = parseInt(vsStr, 10);
                    const bookName = BIBLE_LIST.find(b => b.id === bId)?.name || bId;
                    const isExactMatch = score >= 4;

                    return (
                      <div 
                        key={verseKey} 
                        className={`p-2.5 px-3 bg-white border rounded-xl hover:border-[#D5D0C7] hover:shadow-md hover:bg-[#FDFBF7] transition-all flex flex-col gap-1 shadow-2xs ${
                          isExactMatch ? 'border-[#8C877D] ring-2 ring-[#2C2B29]/5 bg-[#FAF0EB]/20' : 'border-[#E7E5DF]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-serif font-bold text-xs text-[#2C2B29]">
                              {bookName} {chStr}:{vsStr}
                            </span>
                            {isExactMatch && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#524E48] text-white">
                                구절 일치
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowNoteSearch(false);
                                setLeftNav({ bookId: bId, chapter: parseInt(chStr, 10), verse: vNum, scrollTrigger: Date.now() });
                              }}
                              className="px-2 py-0.5 bg-[#F5F3ED] hover:bg-[#EBE5DC] active:bg-[#DDD6C8] text-[#4A4741] rounded text-[11px] font-medium transition-colors cursor-pointer border border-[#E0DBD2]"
                            >
                              본문
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowNoteSearch(false);
                                if (!versions.some(v => v.id === rightSelectedVersionId)) {
                                  const defaultId = versions.find(v => v.id === 'built-in-kor-revised')?.id || versions[0]?.id || 'built-in-kor-revised';
                                  setRightSelectedVersionId(defaultId);
                                }
                                setIsDualView(true);
                                setRightNav({ bookId: bId, chapter: parseInt(chStr, 10), verse: vNum, scrollTrigger: Date.now() });
                              }}
                              className="px-2 py-0.5 bg-[#FAF0EB] hover:bg-[#F5E2DA] active:bg-[#EDD1C4] text-[#C46A40] rounded text-[11px] font-semibold transition-colors cursor-pointer border border-[#F1D3C6]"
                            >
                              듀얼뷰
                            </button>
                          </div>
                        </div>
                        {/* 본문 한 줄 요약 */}
                        <p className="text-[11px] text-[#5C5852] line-clamp-1 truncate font-serif leading-relaxed">
                          {data.note}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  // 2) 성경 66권 권별 모아보기 (첫 상태: 닫힌 상태)
                  <div className="space-y-2">
                    {BIBLE_LIST.filter(book => (noteBookGroups[book.id]?.length || 0) > 0).map(book => {
                      const bookEntries = noteBookGroups[book.id] || [];
                      const isExpanded = !!noteExpandedBooks[book.id]; // 기본 닫힌 상태

                      return (
                        <div key={book.id} className="border border-[#E5E0D8] rounded-xl bg-white overflow-hidden shadow-2xs">
                          {/* 권 헤더 (AI 기록창과 100% 동일) */}
                          <button
                            type="button"
                            onClick={() => setNoteExpandedBooks(prev => ({ ...prev, [book.id]: !isExpanded }))}
                            className={`w-full p-2.5 px-3 bg-[#FAF9F5] hover:bg-[#F3EFE9] transition-colors flex items-center justify-between text-left cursor-pointer ${isExpanded ? 'border-b border-[#EFECE6]' : ''}`}
                          >
                            <div className="flex items-center gap-2">
                              <BookOpen className="w-3.5 h-3.5 text-[#8C877D] stroke-[1.8]" />
                              <span className="font-serif font-bold text-xs text-[#2C2B29]">{book.name}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#F0EEE6] text-[#2C2B29]">
                                {bookEntries.length}
                              </span>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-[#8C877D] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>

                          {/* 권 내부 구절 목록 */}
                          {isExpanded && (
                            <div className="p-2 space-y-1.5 bg-white">
                              {bookEntries.map(({ verseKey, data }) => {
                                const [_, chStr, vsStr] = verseKey.split('_');
                                const vNum = parseInt(vsStr, 10);
                                return (
                                  <div
                                    key={verseKey}
                                    className="p-2.5 rounded-lg border border-[#EAE6DF] bg-[#FAF9F5] hover:border-[#D5D0C7] hover:shadow-md hover:bg-white transition-all flex flex-col gap-1 shadow-2xs"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-serif font-bold text-xs text-[#2C2B29]">
                                        {chStr}장 {vsStr}절
                                      </span>
                                      <div className="flex items-center gap-1">
                                        <button 
                                          onClick={() => {
                                            setShowNoteSearch(false);
                                            setLeftNav({ bookId: book.id, chapter: parseInt(chStr, 10), verse: vNum, scrollTrigger: Date.now() });
                                          }}
                                          className="px-2 py-0.5 bg-white hover:bg-[#F5F3ED] text-[#4A4741] rounded text-[11px] font-medium transition-colors border border-[#E0DBD2] cursor-pointer"
                                        >
                                          본문
                                        </button>
                                        <button 
                                          onClick={() => {
                                            setShowNoteSearch(false);
                                            if (!versions.some(v => v.id === rightSelectedVersionId)) {
                                              const defaultId = versions.find(v => v.id === 'built-in-kor-revised')?.id || versions[0]?.id || 'built-in-kor-revised';
                                              setRightSelectedVersionId(defaultId);
                                            }
                                            setIsDualView(true);
                                            setRightNav({ bookId: book.id, chapter: parseInt(chStr, 10), verse: vNum, scrollTrigger: Date.now() });
                                          }}
                                          className="px-2 py-0.5 bg-[#FAF0EB] hover:bg-[#F5E2DA] text-[#C46A40] rounded text-[11px] font-semibold transition-colors border border-[#F1D3C6] cursor-pointer"
                                        >
                                          듀얼뷰
                                        </button>
                                      </div>
                                    </div>
                                    {/* 본문 한 줄 요약 */}
                                    <p className="text-[11px] text-[#5C5852] line-clamp-1 truncate font-serif leading-relaxed">
                                      {data.note}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sermon Search Modal (구절 메모 보관함 검색) */}
      <AnimatePresence>
        {showSermonSearch && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSermonSearch(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-xl bg-[#FAF9F5] rounded-2xl border border-[#E7E5DF] shadow-2xl overflow-hidden flex flex-col max-h-[82vh]"
            >
              {/* Header (구절노트 검색) */}
              <div className="p-4 border-b border-[#E7E5DF] bg-[#FAF9F5] space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileEdit className="w-4 h-4 text-[#2C2B29] stroke-[1.8px] shrink-0" />
                    <span className="font-serif font-bold text-sm text-[#2C2B29]">구절노트 검색 <span className="font-normal text-xs text-[#8C877D]">내 개인 메모</span></span>
                  </div>
                  <button 
                    onClick={() => setShowSermonSearch(false)} 
                    className="p-1 hover:bg-[#EAE4DA] rounded-lg transition-colors text-[#8C877D] hover:text-[#2C2B29] cursor-pointer"
                    title="닫기"
                  >
                    <X className="w-4 h-4 stroke-[1.8px]" />
                  </button>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A19B] stroke-[1.5px]" />
                  <input 
                    type="text" 
                    autoFocus
                    placeholder="구절, 책 이름, 메모 본문 검색..."
                    value={sermonSearchQuery}
                    onChange={e => setSermonSearchQuery(e.target.value)}
                    className="w-full bg-white border border-[#E7E5DF] rounded-xl pl-9 pr-8 py-2.5 text-xs text-[#2C2B29] outline-none shadow-2xs focus:border-[#8C877D] focus:ring-2 focus:ring-[#2C2B29]/5 transition-all placeholder:text-[#A39E94]"
                  />
                  {sermonSearchQuery && (
                    <button
                      onClick={() => setSermonSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A3A19B] hover:text-[#2C2B29] p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Tab Switcher (AI 주석 기록 탭과 100% 동일) */}
                <div className="flex items-center justify-between pt-0.5">
                  <div className="flex bg-[#EAE6DF] p-0.5 rounded-lg gap-0.5">
                    <button
                      onClick={() => setSermonSearchTab('recent')}
                      className={`px-3 py-1 text-xs rounded-md transition-all cursor-pointer ${
                        sermonSearchTab === 'recent'
                          ? 'bg-white font-bold text-[#2C2B29] shadow-xs'
                          : 'text-[#8C877D] hover:text-[#2C2B29]'
                      }`}
                    >
                      최신순
                    </button>
                    <button
                      onClick={() => setSermonSearchTab('byBook')}
                      className={`px-3 py-1 text-xs rounded-md transition-all cursor-pointer ${
                        sermonSearchTab === 'byBook'
                          ? 'bg-white font-bold text-[#2C2B29] shadow-xs'
                          : 'text-[#8C877D] hover:text-[#2C2B29]'
                      }`}
                    >
                      권별보기
                    </button>
                  </div>
                  <span className="text-xs text-[#8C877D]">
                    총 <strong className="text-[#2C2B29] font-bold">{filteredSermonEntries.length}</strong>개
                  </span>
                </div>
              </div>

              {/* Body Content */}
              <div className="flex-1 overflow-y-auto p-3.5 bg-[#FAF9F5] custom-scrollbar flex flex-col gap-2">
                {filteredSermonEntries.length === 0 ? (
                  <div className="text-center py-12 text-[#A39E94] text-xs font-medium">
                    {sermonSearchQuery ? '검색 결과가 없습니다.' : '작성된 구절 메모가 없습니다.'}
                  </div>
                ) : sermonSearchTab === 'recent' ? (
                  // 1) 최신순 / 점수순 목록 (구절 완벽 일치 최상위, 본문 한 줄 요약)
                  filteredSermonEntries.map(({ verseKey, data, score }) => {
                    const [bId, chStr, vsStr] = verseKey.split('_');
                    const vNum = parseInt(vsStr, 10);
                    const bookName = BIBLE_LIST.find(b => b.id === bId)?.name || bId;
                    const isExactMatch = score >= 4;

                    return (
                      <div 
                        key={verseKey} 
                        className={`p-2.5 px-3 bg-white border rounded-xl hover:border-[#D5D0C7] hover:shadow-md hover:bg-[#FDFBF7] transition-all flex flex-col gap-1 shadow-2xs ${
                          isExactMatch ? 'border-[#8C877D] ring-2 ring-[#2C2B29]/5 bg-[#F3EFE9]/30' : 'border-[#E7E5DF]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-serif font-bold text-xs text-[#2C2B29]">
                              {bookName} {chStr}:{vsStr}
                            </span>
                            {isExactMatch && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#524E48] text-white">
                                구절 일치
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowSermonSearch(false);
                                setLeftNav({ bookId: bId, chapter: parseInt(chStr, 10), verse: vNum, scrollTrigger: Date.now() });
                              }}
                              className="px-2 py-0.5 bg-[#F5F3ED] hover:bg-[#EBE5DC] active:bg-[#DDD6C8] text-[#4A4741] rounded text-[11px] font-medium transition-colors cursor-pointer border border-[#E0DBD2]"
                            >
                              본문
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowSermonSearch(false);
                                if (!versions.some(v => v.id === rightSelectedVersionId)) {
                                  const defaultId = versions.find(v => v.id === 'built-in-kor-revised')?.id || versions[0]?.id || 'built-in-kor-revised';
                                  setRightSelectedVersionId(defaultId);
                                }
                                setIsDualView(true);
                                setRightNav({ bookId: bId, chapter: parseInt(chStr, 10), verse: vNum, scrollTrigger: Date.now() });
                              }}
                              className="px-2 py-0.5 bg-[#FAF0EB] hover:bg-[#F5E2DA] active:bg-[#EDD1C4] text-[#C46A40] rounded text-[11px] font-semibold transition-colors cursor-pointer border border-[#F1D3C6]"
                            >
                              듀얼뷰
                            </button>
                          </div>
                        </div>
                        {/* 본문 한 줄 요약 */}
                        <p className="text-[11px] text-[#5C5852] line-clamp-1 truncate font-serif leading-relaxed">
                          {data.sermon}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  // 2) 성경 66권 권별 모아보기 (첫 상태: 닫힌 상태)
                  <div className="space-y-2">
                    {BIBLE_LIST.filter(book => (sermonBookGroups[book.id]?.length || 0) > 0).map(book => {
                      const bookEntries = sermonBookGroups[book.id] || [];
                      const isExpanded = !!sermonExpandedBooks[book.id]; // 기본 닫힌 상태

                      return (
                        <div key={book.id} className="border border-[#E5E0D8] rounded-xl bg-white overflow-hidden shadow-2xs">
                          {/* 권 헤더 (AI 기록창과 100% 동일) */}
                          <button
                            type="button"
                            onClick={() => setSermonExpandedBooks(prev => ({ ...prev, [book.id]: !isExpanded }))}
                            className={`w-full p-2.5 px-3 bg-[#FAF9F5] hover:bg-[#F3EFE9] transition-colors flex items-center justify-between text-left cursor-pointer ${isExpanded ? 'border-b border-[#EFECE6]' : ''}`}
                          >
                            <div className="flex items-center gap-2">
                              <BookOpen className="w-3.5 h-3.5 text-[#8C877D] stroke-[1.8]" />
                              <span className="font-serif font-bold text-xs text-[#2C2B29]">{book.name}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#F0EEE6] text-[#2C2B29]">
                                {bookEntries.length}
                              </span>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-[#8C877D] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>

                          {/* 권 내부 구절 목록 */}
                          {isExpanded && (
                            <div className="p-2 space-y-1.5 bg-white">
                              {bookEntries.map(({ verseKey, data }) => {
                                const [_, chStr, vsStr] = verseKey.split('_');
                                const vNum = parseInt(vsStr, 10);
                                return (
                                  <div
                                    key={verseKey}
                                    className="p-2.5 rounded-lg border border-[#EAE6DF] bg-[#FAF9F5] hover:border-[#D5D0C7] hover:shadow-md hover:bg-white transition-all flex flex-col gap-1 shadow-2xs"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-serif font-bold text-xs text-[#2C2B29]">
                                        {chStr}장 {vsStr}절
                                      </span>
                                      <div className="flex items-center gap-1">
                                        <button 
                                          onClick={() => {
                                            setShowSermonSearch(false);
                                            setLeftNav({ bookId: book.id, chapter: parseInt(chStr, 10), verse: vNum, scrollTrigger: Date.now() });
                                          }}
                                          className="px-2 py-0.5 bg-white hover:bg-[#F5F3ED] text-[#4A4741] rounded text-[11px] font-medium transition-colors border border-[#E0DBD2] cursor-pointer"
                                        >
                                          본문
                                        </button>
                                        <button 
                                          onClick={() => {
                                            setShowSermonSearch(false);
                                            if (!versions.some(v => v.id === rightSelectedVersionId)) {
                                              const defaultId = versions.find(v => v.id === 'built-in-kor-revised')?.id || versions[0]?.id || 'built-in-kor-revised';
                                              setRightSelectedVersionId(defaultId);
                                            }
                                            setIsDualView(true);
                                            setRightNav({ bookId: book.id, chapter: parseInt(chStr, 10), verse: vNum, scrollTrigger: Date.now() });
                                          }}
                                          className="px-2 py-0.5 bg-[#FAF0EB] hover:bg-[#F5E2DA] text-[#C46A40] rounded text-[11px] font-semibold transition-colors border border-[#F1D3C6] cursor-pointer"
                                        >
                                          듀얼뷰
                                        </button>
                                      </div>
                                    </div>
                                    {/* 본문 한 줄 요약 */}
                                    <p className="text-[11px] text-[#5C5852] line-clamp-1 truncate font-serif leading-relaxed">
                                      {data.sermon}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
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

      {/* 이메일/구글 통합 간편 로그인 모달 */}
      <AnimatePresence>
        {showAuthModal && (
          <AuthModal 
            isOpen={showAuthModal} 
            onClose={() => setShowAuthModal(false)} 
          />
        )}
      </AnimatePresence>

      {/* 서비스 이용약관, 개인정보 처리방침, 사업자 정보 모달 */}
      <PolicyViewModal
        isOpen={policyModal.isOpen}
        initialTab={policyModal.tab}
        onClose={() => setPolicyModal({ isOpen: false, tab: 'terms' })}
      />

      {/* ymoonsik@gmail.com 전용 통합 관리자 대시보드 */}
      <AnimatePresence>
        {showAdminDashboardModal && (
          <AdminDashboardModal 
            isOpen={showAdminDashboardModal} 
            onClose={() => setShowAdminDashboardModal(false)} 
            currentUserEmail={userProfile?.email}
          />
        )}
      </AnimatePresence>

      {/* 팝업 모달: 메인 화면 중앙 복사 지정 페이지 */}
      <AnimatePresence>
        {showCopySettingsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#FBF9F7] border border-[#E5E0D8] rounded-2xl shadow-xl w-full max-w-md p-5 text-[#2B2927] space-y-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#F0EBE1] pb-3">
                <div className="flex items-center gap-2">
                  <Copy className="w-5 h-5 text-[#6E6A63] stroke-[1.8px]" />
                  <h3 className="font-semibold text-sm text-[#2B2927]">&lt;복사 지정&gt; 설정</h3>
                </div>
                <button
                  onClick={() => setShowCopySettingsModal(false)}
                  className="p-1 text-[#8C877D] hover:text-[#2B2927] hover:bg-[#F3EFE9] rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4 stroke-[1.8px]" />
                </button>
              </div>

              {/* Body */}
              <div className="space-y-3.5 text-xs">
                {/* 1. main 번역본 선택 */}
                <div className="space-y-2 bg-white/80 p-3 rounded-xl border border-[#E5E0D8]">
                  <div className="font-semibold text-[#2B2927] text-xs">* main 번역본 선택</div>
                  
                  {/* 한글성경 */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[#6E6A63]">한글성경:</span>
                    <select
                      value={mainKrVersionId}
                      onChange={(e) => setMainKrVersionId(e.target.value)}
                      className="bg-white border border-[#E5E0D8] text-xs font-medium text-[#2B2927] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#524E48] min-w-[160px] truncate cursor-pointer shadow-2xs"
                    >
                      {krVersions.length === 0 && <option value="">없음</option>}
                      {krVersions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>

                  {/* 영어성경 */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[#6E6A63]">영어성경:</span>
                    <select
                      value={mainEnVersionId}
                      onChange={(e) => setMainEnVersionId(e.target.value)}
                      className="bg-white border border-[#E5E0D8] text-xs font-medium text-[#2B2927] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#524E48] min-w-[160px] truncate cursor-pointer shadow-2xs"
                    >
                      {enVersions.length === 0 && <option value="">없음</option>}
                      {enVersions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                </div>

                {/* 2. 다중 선택 */}
                <div className="space-y-2 bg-white/80 p-3 rounded-xl border border-[#E5E0D8]">
                  <div className="font-semibold text-[#2B2927] text-xs">* 다중 선택</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'kr', label: '한글' },
                      { id: 'en', label: '영어' },
                      { id: 'kr+en', label: '한글+영어' },
                      { id: 'all', label: '선택한 번역본 모두' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setCopyMultiOption(opt.id as any)}
                        className={`px-3 py-2 rounded-xl text-xs font-medium transition-all text-center border cursor-pointer ${
                          copyMultiOption === opt.id
                            ? 'bg-[#EBE5DC] text-[#2B2927] border-[#DED8CE] shadow-2xs font-semibold'
                            : 'bg-white text-[#6E6A63] border-[#E5E0D8] hover:bg-[#F3EFE9]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. 번역본 출처 */}
                <div className="space-y-2 bg-white/80 p-3 rounded-xl border border-[#E5E0D8]">
                  <div className="font-semibold text-[#2B2927] text-xs">* 번역본 출처</div>
                  <div className="flex items-center bg-[#F3EFE9] p-1 rounded-xl border border-[#E5E0D8]">
                    <button
                      onClick={() => setShowVersionInCopy(false)}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                        !showVersionInCopy ? 'bg-white text-[#2B2927] shadow-2xs font-semibold' : 'text-[#8C877D]'
                      }`}
                    >
                      숨기기
                    </button>
                    <button
                      onClick={() => setShowVersionInCopy(true)}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                        showVersionInCopy ? 'bg-white text-[#2B2927] shadow-2xs font-semibold' : 'text-[#8C877D]'
                      }`}
                    >
                      보이기
                    </button>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setShowCopySettingsModal(false)}
                  className="px-4 py-1.5 bg-[#2B2927] text-white rounded-xl text-xs font-medium hover:bg-[#1F1E1D] transition-all cursor-pointer shadow-2xs"
                >
                  완료
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 신규 가입 환영 특별 혜택 안내 모달 (아이콘 배제) */}
      {welcomeModalInfo?.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-[#FAF9F5] border border-[#E8E3DA] rounded-2xl p-6 shadow-2xl space-y-4 text-center">
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-[#2C2B29] font-serif tracking-tight">
                가입을 환영합니다
              </h3>
              <p className="text-xs text-[#5A564F] leading-relaxed">
                신규 가입 특별 혜택으로 AI 연구 크레딧 <strong>{welcomeModalInfo.bonusCredits}회</strong>가 즉시 지급되었습니다.
              </p>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-[#E5DFD5] text-left space-y-2 text-xs text-[#5A564F]">
              <div className="flex items-center justify-between">
                <span className="text-[#8C877D]">기본 무료 크레딧</span>
                <span className="font-semibold text-[#2C2B29]">매월 10회</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#8C877D]">가입 특별 혜택</span>
                <span className="font-bold text-[#C46A40]">+{welcomeModalInfo.bonusCredits}회</span>
              </div>
              <div className="pt-2 border-t border-[#F0EBE1] flex items-center justify-between font-bold">
                <span className="text-[#2C2B29]">현재 이용 가능 횟수</span>
                <span className="text-[#C46A40] text-sm">{welcomeModalInfo.totalCredits}회</span>
              </div>
              <div className="text-[10px] text-[#A39E94] text-right">
                (가입 혜택 유효기간: 1년)
              </div>
            </div>

            <button
              type="button"
              onClick={async () => {
                if (auth.currentUser) {
                  const uid = auth.currentUser.uid;
                  localStorage.setItem(`welcome_bonus_seen_${uid}`, 'true');
                  try {
                    const { doc, updateDoc } = await import('firebase/firestore');
                    const { db } = await import('./api/firebaseConfig');
                    await updateDoc(doc(db, 'users', uid), { hasSeenWelcome: true });
                  } catch (e) {}
                }
                setWelcomeModalInfo(null);
              }}
              className="w-full py-2.5 bg-[#C46A40] hover:bg-[#B55434] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              확인하고 시작하기
            </button>
          </div>
        </div>
      )}

      {/* 앱 전역 인앱 확인 다이얼로그 (우아한 클로드 스타일 모달) */}
      {appConfirmDialog && appConfirmDialog.isOpen && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-150"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              e.stopPropagation();
              setAppConfirmDialog(null);
            }
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-[#FAF9F5] border border-[#E7E5DF] rounded-3xl shadow-2xl p-5 space-y-4 text-left"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border bg-[#FAF0EB] text-[#C46A40] border-[#F1D3C6] shadow-2xs">
                  {appConfirmDialog.title.includes('로그아웃') ? (
                    <LogOut className="w-5 h-5 text-[#C46A40] stroke-[1.8px]" />
                  ) : (
                    <ClaudeSparkleIcon className="w-5 h-5 text-[#C46A40]" />
                  )}
                </div>
                <div>
                  <h3 className="font-serif font-bold text-base text-[#2C2B29] tracking-tight">{appConfirmDialog.title}</h3>
                  <p className="text-[10px] text-[#A39E94] font-medium">NATIONS BIBLE</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAppConfirmDialog(null)}
                className="p-1.5 rounded-xl text-[#8C877D] hover:text-[#2C2B29] hover:bg-[#EFEAE2] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4 stroke-[1.8px]" />
              </button>
            </div>

            {/* Content Box */}
            <div className="p-3.5 bg-white rounded-2xl border border-[#E8E3DA] shadow-2xs">
              <p className="text-xs text-[#524F4A] whitespace-pre-line leading-relaxed">
                {appConfirmDialog.message}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAppConfirmDialog(null)}
                className="px-4 py-2.5 bg-white border border-[#DDD8CE] hover:bg-[#F5F3ED] text-[#6E6A63] text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-2xs"
              >
                {appConfirmDialog.cancelText || '취소'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const fn = appConfirmDialog.onConfirm;
                  setAppConfirmDialog(null);
                  fn();
                }}
                className="px-5 py-2.5 bg-[#C46A40] hover:bg-[#B55434] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
              >
                {appConfirmDialog.confirmText || '확인'}
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}
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
