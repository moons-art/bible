import React, { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileEdit, Plus, Calendar, Search, Save, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, PanelRight, PanelBottom, Maximize2, Type, Minus, Copy, Trash2, Layers, BookOpen, Folder, FolderOpen } from 'lucide-react';
import { db, auth } from '../api/firebaseConfig';
import { doc, collection, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { BIBLE_LIST } from '../constants/bibleMeta';
import { extractBibleBookFromText, parseBibleReference, isBibleReferenceMatch } from '../utils/referenceParser';


interface Sermon {
  id: string;
  title: string;
  date: string;
  content?: string;
}

export type DockPosition = 'right' | 'bottom' | 'free';

interface SermonSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  clipboardText?: string | null;
  onClipboardTextProcessed?: () => void;
  dockPosition: DockPosition;
  onDockPositionChange: (pos: DockPosition) => void;
  isCollapsed: boolean;
  onCollapseChange: (collapsed: boolean) => void;
  isOverlay?: boolean;
  onOverlayChange?: (overlay: boolean) => void;
  sidebarWidth: number;
  onSidebarWidthChange: (width: number) => void;
  sidebarHeight: number;
  onSidebarHeightChange: (height: number) => void;
}

export interface SermonSidebarRef {
  resetToRightAndOpen: () => void;
  isFullyOpenOnRight: () => boolean;
}

export const SermonSidebar = forwardRef<SermonSidebarRef, SermonSidebarProps>(({ 
  isOpen, 
  onClose, 
  clipboardText, 
  onClipboardTextProcessed,
  dockPosition,
  onDockPositionChange,
  isCollapsed,
  onCollapseChange,
  isOverlay = false,
  onOverlayChange,
  sidebarWidth,
  onSidebarWidthChange,
  sidebarHeight,
  onSidebarHeightChange,
}, ref) => {
  const [sermons, setSermons] = useState<Sermon[]>([]);
  const [googleUserId, setGoogleUserId] = useState<string | null>(null);
  const unsubscribeSermonsRef = useRef<(() => void) | null>(null);

  const subscribeToSermons = (uid: string) => {
    if (unsubscribeSermonsRef.current) unsubscribeSermonsRef.current();
    const sermonsCol = collection(db, 'users', uid, 'sermons');
    const unsubscribe = onSnapshot(sermonsCol, (snapshot) => {
      const data: Sermon[] = [];
      snapshot.forEach(docSnap => {
        data.push({ id: docSnap.id, ...docSnap.data() } as Sermon);
      });
      data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setSermons(data);
    }, (err) => {
      console.warn('[SermonSidebar] Firestore offline (캐시 사용 중):', err.code);
    });
    unsubscribeSermonsRef.current = unsubscribe;
  };

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        setGoogleUserId(user.uid);
        subscribeToSermons(user.uid);
      } else {
        setGoogleUserId(null);
        setSermons([]);
        if (unsubscribeSermonsRef.current) {
          unsubscribeSermonsRef.current();
          unsubscribeSermonsRef.current = null;
        }
      }
    });
    return () => {
      unsubAuth();
      if (unsubscribeSermonsRef.current) unsubscribeSermonsRef.current();
    };
  }, []);

  const handleSaveSermon = async (id: string, title: string, content: string) => {
    if (!googleUserId) return;
    const docRef = doc(db, 'users', googleUserId, 'sermons', id);
    const date = new Date().toISOString().split('T')[0];
    try {
      if (!googleUserId) {
        throw new Error('Google User ID is missing');
      }
      const docRef = doc(db, 'users', googleUserId, 'sermons', id);
      const date = new Date().toISOString().split('T')[0];
      await setDoc(docRef, { title, content, date }, { merge: true });
      setSaveStatus('saved');
    } catch (err: any) {
      console.error('[SermonSidebar] Save error:', err);
      setSaveStatus('unsaved');
      alert(`[디버그] 설교문 파이어베이스 저장 실패: ${err.message}`);
    }
  };

  const handleDeleteSermon = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!googleUserId) return;
    if (confirm('이 설교문을 정말 삭제하시겠습니까?')) {
      const docRef = doc(db, 'users', googleUserId, 'sermons', id);
      await deleteDoc(docRef);
      if (activeSermonId === id) {
        setView('list');
        setActiveSermonId(null);
        setEditorContent('');
      }
    }
  };

  const handleCreateNewSermon = async () => {
    if (!googleUserId) return;
    const newId = 'sermon-' + Date.now();
    await handleSaveSermon(newId, '새 설교문', '');
    setActiveSermonId(newId);
    setEditorContent('');
    setView('editor');
  };
  const [searchQuery, setSearchQuery] = useState('');
  
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [activeSermonId, setActiveSermonId] = useState<string | null>(null);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sermonFontSize, setSermonFontSize] = useState(() => {
    try {
      const saved = localStorage.getItem('bible-app-sermon-font');
      if (saved) return JSON.parse(saved);
    } catch(e){}
    return 16;
  });

  useEffect(() => {
    localStorage.setItem('bible-app-sermon-font', JSON.stringify(sermonFontSize));
  }, [sermonFontSize]);

  // Auto-save with 2-second debounce
  useEffect(() => {
    if (!activeSermonId || !googleUserId) return;
    setSaveStatus('unsaved');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      const titleToSave = editorTitle.trim() || '제목 없음';
      await handleSaveSermon(activeSermonId, titleToSave, editorContent);
      setSaveStatus('saved');
    }, 2000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [editorTitle, editorContent]);

  const [isResizing, setIsResizing] = useState(false);

  useImperativeHandle(ref, () => ({
    resetToRightAndOpen: () => {
      onDockPositionChange('right');
      onOverlayChange?.(false);
      onCollapseChange(false);
    },
    isFullyOpenOnRight: () => {
      return dockPosition === 'right' && !isCollapsed;
    }
  }));

  // Free Mode Popup States
  const [popupSize, setPopupSize] = useState({ width: Math.min(600, window.innerWidth * 0.9), height: 350 });
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 }); // offset from original center-bottom
  const [isResizingPopup, setIsResizingPopup] = useState<'left' | 'right' | null>(null);
  const [sermonZIndex, setSermonZIndex] = useState(10000);
  const bringToFront = () => {
    window.__topZIndex = (window.__topZIndex || 10000) + 1;
    setSermonZIndex(window.__topZIndex);
  };

  const [isDraggingPopup, setIsDraggingPopup] = useState(false);
  const dragStartRef = React.useRef({ x: 0, y: 0, initX: 0, initY: 0, initW: 0, initH: 0 });

  // Handle Free Mode Popup Resize & Drag
  useEffect(() => {
    if (!isDraggingPopup && !isResizingPopup) return;
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      if (isDraggingPopup) {
        setPopupPos({
          x: dragStartRef.current.initX + (clientX - dragStartRef.current.x),
          y: dragStartRef.current.initY + (clientY - dragStartRef.current.y)
        });
      } else if (isResizingPopup) {
        const dx = clientX - dragStartRef.current.x;
        const dy = clientY - dragStartRef.current.y;
        
        let newWidth = dragStartRef.current.initW;
        if (isResizingPopup === 'left') {
          newWidth -= dx * 2;
        } else {
          newWidth += dx * 2;
        }
        
        let newHeight = dragStartRef.current.initH - dy;
        setPopupSize({ width: Math.max(300, newWidth), height: Math.max(200, newHeight) });
      }
    };
    const handleUp = () => { setIsResizingPopup(null); setIsDraggingPopup(false); };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isDraggingPopup, isResizingPopup]);

  // Handle Right/Bottom Resize
  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      if (dockPosition === 'right') {
        const newWidth = Math.max(280, Math.min(window.innerWidth - 320, window.innerWidth - clientX));
        onSidebarWidthChange(newWidth);
      } else if (dockPosition === 'bottom') {
        const newHeight = Math.max(180, Math.min(window.innerHeight - 150, window.innerHeight - clientY));
        onSidebarHeightChange(newHeight);
      }
    };

    const handleUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isResizing, dockPosition, onSidebarWidthChange, onSidebarHeightChange]);

  // 목록 보기 모드: 최신순 vs 권별 모아보기
  const [listTab, setListTab] = useState<'recent' | 'byBook'>('recent');
  const [expandedBooks, setExpandedBooks] = useState<Record<string, boolean>>({});

  const toggleBookExpand = (bookId: string) => {
    setExpandedBooks(prev => ({ ...prev, [bookId]: !prev[bookId] }));
  };

  // 설교 제목에서 성경 본문 스마트 추출 및 매핑
  const sermonsWithBook = useMemo(() => {
    return sermons.map(s => {
      const extracted = extractBibleBookFromText(s.title);
      return {
        ...s,
        extractedBook: extracted, // { bookId, bookName, parsedRef }
      };
    });
  }, [sermons]);

  // 스마트 성경 구절 인식 검색 및 최상위 정렬
  const filteredSermons = useMemo(() => {
    if (!searchQuery.trim()) return sermonsWithBook;
    const q = searchQuery.trim().toLowerCase();
    const parsedQuery = parseBibleReference(searchQuery.trim());

    return sermonsWithBook
      .map(s => {
        let score = 0;
        // 1) 제목이나 본문 텍스트에 포함
        if (s.title.toLowerCase().includes(q)) score = Math.max(score, 1);
        if (s.content && s.content.toLowerCase().includes(q)) score = Math.max(score, 1);

        // 2) 성경 구절 스마트 매칭 (예: '마 1 6', '마태 1:6', '롬 8:28')
        if (parsedQuery && s.extractedBook) {
          if (s.extractedBook.bookId === parsedQuery.bookId) {
            score = Math.max(score, 2);
            // 만약 구절까지 정확히 일치하거나 매칭되면 점수 4 (0초 만에 최상위)
            if (s.extractedBook.parsedRef && isBibleReferenceMatch(searchQuery.trim(), s.extractedBook.parsedRef)) {
              score = Math.max(score, 4);
            }
          }
        }
        return { item: s, score };
      })
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score || new Date(b.item.date).getTime() - new Date(a.item.date).getTime())
      .map(entry => entry.item);
  }, [sermonsWithBook, searchQuery]);

  // 권별 보기용 그룹화 (BIBLE_LIST 기준 66권 + 기타)
  const bookGroups = useMemo(() => {
    const map: Record<string, typeof filteredSermons> = {};
    const etcList: typeof filteredSermons = [];

    filteredSermons.forEach(s => {
      if (s.extractedBook?.bookId) {
        if (!map[s.extractedBook.bookId]) {
          map[s.extractedBook.bookId] = [];
        }
        map[s.extractedBook.bookId].push(s);
      } else {
        etcList.push(s);
      }
    });

    return { map, etcList };
  }, [filteredSermons]);

  const openEditor = (id: string) => {
    setActiveSermonId(id);
    setView('editor');
    const sermon = sermons.find(s => s.id === id);
    setEditorTitle(sermon?.title || '');
    setEditorContent(sermon?.content || '');
  };

  const createNewEditor = () => {
    const newId = `sermon-${Date.now()}`;
    setActiveSermonId(newId);
    setView('editor');
    setEditorTitle('');
    setEditorContent('');
  };

  useEffect(() => {
    if (clipboardText) {
      if (view === 'list') {
        openEditor(`new-${Date.now()}`);
      }
      setEditorContent(prev => prev ? prev + '\n\n' + clipboardText : clipboardText);
      onCollapseChange(false);
      onClipboardTextProcessed?.();
    }
  }, [clipboardText, view, onClipboardTextProcessed, onCollapseChange]);

  const handleClose = () => {
    if (view === 'editor') {
      if (window.confirm("작성 중인 내용을 임시 저장하고 닫으시겠습니까?")) {
        onClose();
        onCollapseChange(false);
      }
    } else {
      onClose();
      onCollapseChange(false);
    }
  };

  const getContainerClasses = () => {
    switch (dockPosition) {
      case 'right': return `fixed top-0 right-0 border-l border-[#EBE6DF] ${isOverlay ? 'shadow-[-16px_0_45px_rgba(0,0,0,0.18)]' : 'shadow-[-10px_0_40px_rgba(0,0,0,0.1)]'}`;
      case 'bottom': return `fixed bottom-0 left-0 border-t border-[#EBE6DF] ${isOverlay ? 'shadow-[0_-16px_45px_rgba(0,0,0,0.18)]' : 'shadow-[0_-10px_40px_rgba(0,0,0,0.1)]'}`;
      case 'free': return 'fixed bottom-6 left-1/2 rounded-2xl shadow-2xl border border-[#EBE6DF] ';
    }
  };

  const getContainerStyle = (): React.CSSProperties => {
    if (dockPosition === 'right') {
      return { width: `${sidebarWidth}px`, height: '100%', maxWidth: '90vw' };
    }
    if (dockPosition === 'bottom') {
      return { width: '100%', height: `${sidebarHeight}px`, maxHeight: '80vh' };
    }
    // free mode: direct style updates for smooth drag (no spring transition)
    return { 
      width: popupSize.width, 
      height: popupSize.height, 
      maxWidth: '95vw', 
      maxHeight: '90vh',
      x: `calc(-50% + ${popupPos.x}px)`,
      y: popupPos.y 
    } as any; // Cast to any to allow Framer Motion specific style keys if it complains
  };

  const getVariants = () => {
    const isOffScreen = !isOpen;
    if (isOffScreen || isCollapsed) {
      switch (dockPosition) {
        case 'right': return { x: '100%', y: 0 };
        case 'bottom': return { x: 0, y: '100%' };
        case 'free': return { scale: 0.9, opacity: 0 };
      }
    }
    
    if (dockPosition === 'free') {
      return { scale: 1, opacity: 1 };
    }
    return { x: 0, y: 0 };
  };

  const getTabContainerClasses = () => {
    switch (dockPosition) {
      case 'right': return 'absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 flex flex-col gap-1.5 z-50';
      case 'bottom': return 'absolute top-0 left-1/2 -translate-y-full -translate-x-1/2 flex flex-row gap-1.5 z-50';
      case 'free': return 'hidden';
    }
  };

  // 1. 열고닫는 버튼: 사이드바 열림/닫힘(접기/펼치기)만 제어 (현재 덮기/밀기 모드는 그대로 유지)
  const handleToggleCollapse = () => {
    if (isResizing) return;
    onCollapseChange(!isCollapsed);
  };

  // 2. 덮는 버튼: 사이드바를 닫지 않고, 현재 위치에서 덮기(Overlay) <-> 밀기(Push) 모드만 전환
  const handleToggleOverlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isResizing) return;
    if (isCollapsed) {
      onOverlayChange?.(true);
      onCollapseChange(false);
    } else {
      onOverlayChange?.(!isOverlay);
    }
  };

  const sidebarContent = (
    <>
      {/* Drag overlay to capture mouse movement smoothly */}
      {isResizing && (
        <div className={`fixed inset-0 z-[99999] ${dockPosition === 'bottom' ? 'cursor-row-resize' : 'cursor-col-resize'} select-none`} />
      )}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
          onMouseDown={dockPosition === 'free' ? bringToFront : undefined}
          onTouchStart={dockPosition === 'free' ? bringToFront : undefined}
          
            key="sermon-sidebar"
            initial={getVariants()}
            animate={getVariants()}
            exit={getVariants()}
            transition={isResizing ? { duration: 0 } : { type: 'spring', damping: 25, stiffness: 200 }}
            className={`bg-[#FAF9F5] z-50 flex flex-col overflow-visible ${getContainerClasses()}`}
            style={{ zIndex: dockPosition === 'free' ? sermonZIndex : undefined, ...getContainerStyle() }}
          >
            {/* Drag Resize Handle (왼쪽 사이드바와 동일하게 얇은 0.5 두께, #D97757 샌드 컬러 및 cursor-col-resize 적용) */}
            {dockPosition === 'right' && (
              <div 
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setIsResizing(true); }}
                onTouchStart={(e) => { e.stopPropagation(); setIsResizing(true); }}
                className={`
                  absolute -left-2 top-0 bottom-0 w-4 z-[100] cursor-col-resize flex items-center justify-center group/resizer transition-all
                  ${isResizing ? 'opacity-100' : 'opacity-0 hover:opacity-100'}
                `}
                title="드래그하여 너비 조절"
              >
                {/* Hover/Drag Highlight Line */}
                <div className={`w-0.5 h-full transition-colors ${isResizing ? 'bg-[#D97757]' : 'bg-[#D97757]/70 group-hover/resizer:bg-[#D97757]'}`} />
              </div>
            )}
            {dockPosition === 'bottom' && (
              <div 
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setIsResizing(true); }}
                onTouchStart={(e) => { e.stopPropagation(); setIsResizing(true); }}
                className={`
                  absolute -top-2 left-0 right-0 h-4 z-[100] cursor-row-resize flex items-center justify-center group/resizer transition-all
                  ${isResizing ? 'opacity-100' : 'opacity-0 hover:opacity-100'}
                `}
                title="드래그하여 높이 조절"
              >
                <div className={`h-0.5 w-full transition-colors ${isResizing ? 'bg-[#D97757]' : 'bg-[#D97757]/70 group-hover/resizer:bg-[#D97757]'}`} />
              </div>
            )}

          {/* Dual Toggle Tabs: 1. 열고닫는 탭 (마우스 호버로 열기/닫기) & 2. 덮는 탭 (클릭으로 덮기/밀기 모드 전환) */}
          {dockPosition !== 'free' && (
            <div className={getTabContainerClasses()}>
              {/* 1. 열고닫는 탭 (마우스를 올리면 항상 사이드바를 밀어 닫거나, 현재 위치/모드 그대로 엶) */}
              <button
                type="button"
                onClick={handleToggleCollapse}
                onMouseEnter={handleToggleCollapse}
                className={`
                  ${dockPosition === 'right' 
                    ? 'rounded-l-xl border-y border-l px-1.5 py-4 flex items-center justify-center' 
                    : 'rounded-t-xl border-x border-t px-4 py-1.5 flex items-center justify-center'
                  }
                  ${!isCollapsed
                    ? 'bg-[#F2DDD1] text-[#B85332] border-[#E8B49E] shadow-md ring-1 ring-[#C96442]/30 font-semibold' 
                    : 'bg-[#FAF0EB] text-[#C96442] border-[#F1D3C6] shadow-sm hover:bg-[#F5E2DA] transition-all'
                  }
                  z-50 cursor-pointer select-none
                `}
                title={!isCollapsed ? "설교노트 닫기 (마우스를 올리면 닫힙니다)" : "설교노트 열기 (마우스를 올리면 현재 위치로 열립니다)"}
              >
                {dockPosition === 'right' ? (
                  !isCollapsed ? (
                    <ChevronRight className="w-4 h-4 stroke-[2px]" />
                  ) : (
                    <ChevronLeft className="w-4 h-4 stroke-[2px]" />
                  )
                ) : (
                  !isCollapsed ? (
                    <ChevronDown className="w-4 h-4 stroke-[2px]" />
                  ) : (
                    <ChevronUp className="w-4 h-4 stroke-[2px]" />
                  )
                )}
              </button>

              {/* 2. 덮는 탭 (닫지 않고, 현재 위치에서 메인창을 덮거나 밀거나 전환) */}
              <button
                type="button"
                onClick={handleToggleOverlay}
                className={`
                  ${dockPosition === 'right' 
                    ? 'rounded-l-xl border-y border-l px-1.5 py-4 flex items-center justify-center' 
                    : 'rounded-t-xl border-x border-t px-4 py-1.5 flex items-center justify-center'
                  }
                  ${isOverlay
                    ? 'bg-[#F2DDD1] text-[#B85332] border-[#E8B49E] shadow-md ring-1 ring-[#C96442]/30 font-semibold' 
                    : 'bg-[#FAF0EB] text-[#C96442] border-[#F1D3C6] shadow-sm hover:bg-[#F5E2DA] transition-all'
                  }
                  z-50 cursor-pointer select-none
                `}
                title={isOverlay ? "메인창 밀기 (클릭하면 메인창을 밀어냅니다)" : "메인창 덮기 (클릭하면 메인창 위로 덮습니다)"}
              >
                <Layers className="w-4 h-4 stroke-[1.8px]" />
              </button>
            </div>
          )}
          
          {/* Free Mode Resizers */}
          {dockPosition === 'free' && (
            <>
              <div 
                className="absolute top-0 left-0 w-16 h-16 cursor-nwse-resize z-[100] bg-slate-900/0 hover:bg-[#C96442]/10 rounded-tl-2xl flex items-start justify-start p-2"
                onMouseDown={(e) => { 
                  e.preventDefault(); e.stopPropagation(); 
                  dragStartRef.current = { ...dragStartRef.current, x: e.clientX, y: e.clientY, initW: popupSize.width, initH: popupSize.height };
                  setIsResizingPopup('left'); 
                }}
                onTouchStart={(e) => { 
                  e.stopPropagation(); 
                  dragStartRef.current = { ...dragStartRef.current, x: e.touches[0].clientX, y: e.touches[0].clientY, initW: popupSize.width, initH: popupSize.height };
                  setIsResizingPopup('left'); 
                }}
                title="크기 조절"
              >
                <div className="w-4 h-4 border-t-2 border-l-2 border-[#A3A19B] rounded-tl-xs pointer-events-none mt-1 ml-1 opacity-60"></div>
              </div>
              <div 
                className="absolute top-0 right-0 w-16 h-16 cursor-nesw-resize z-[100] bg-slate-900/0 hover:bg-[#C96442]/10 rounded-tr-2xl flex items-start justify-end p-2"
                onMouseDown={(e) => { 
                  e.preventDefault(); e.stopPropagation(); 
                  dragStartRef.current = { ...dragStartRef.current, x: e.clientX, y: e.clientY, initW: popupSize.width, initH: popupSize.height };
                  setIsResizingPopup('right'); 
                }}
                onTouchStart={(e) => { 
                  e.stopPropagation(); 
                  dragStartRef.current = { ...dragStartRef.current, x: e.touches[0].clientX, y: e.touches[0].clientY, initW: popupSize.width, initH: popupSize.height };
                  setIsResizingPopup('right'); 
                }}
                title="크기 조절"
              >
                <div className="w-4 h-4 border-t-2 border-r-2 border-[#A3A19B] rounded-tr-xs pointer-events-none mt-1 mr-1 opacity-60"></div>
              </div>
            </>
          )}

          {/* Header */}
          <div 
            className={`flex items-center justify-between p-3.5 border-b border-[#E7E5DF] bg-[#F5F3ED] shrink-0 ${dockPosition === 'free' ? 'cursor-move' : ''}`}
            onMouseDown={(e) => {
              if (dockPosition === 'free') {
                dragStartRef.current = { x: e.clientX, y: e.clientY, initX: popupPos.x, initY: popupPos.y };
                setIsDraggingPopup(true);
              }
            }}
            onTouchStart={(e) => {
              if (dockPosition === 'free') {
                dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, initX: popupPos.x, initY: popupPos.y };
                setIsDraggingPopup(true);
              }
            }}
          >
            <div className="flex items-center gap-1.5 relative z-[110]">
              <button 
                onClick={view === 'editor' ? () => setView('list') : handleClose}
                className="p-1 hover:bg-white rounded-lg transition-colors text-[#6A6864] hover:text-[#2C2B29]"
                title="뒤로가기"
              >
                <ChevronLeft className="w-4 h-4 stroke-[1.5px]" />
              </button>
              <h2 className="text-base font-serif font-bold text-[#2C2B29] flex items-center gap-1.5">
                <FileEdit className="w-4 h-4 text-[#2C2B29] stroke-[1.5px]" />
                <span>{view === 'editor' ? '설교노트' : '설교노트 목록'}</span>
              </h2>
            </div>
            <div className="flex items-center gap-2 relative z-[110]">
              
              {/* Docking Controls */}
              <div className="hidden sm:flex items-center bg-white rounded-xl border border-[#E7E5DF] p-0.5 shadow-2xs mr-1">
                <button onClick={() => onDockPositionChange('right')} className={`p-1 rounded-lg transition-colors ${dockPosition === 'right' ? 'bg-[#FAF0EB] text-[#C96442]' : 'text-[#A3A19B] hover:text-[#2C2B29]'}`} title="우측 화면으로 이동"><PanelRight className="w-3.5 h-3.5 stroke-[1.5px]" /></button>
                <button onClick={() => onDockPositionChange('bottom')} className={`p-1 rounded-lg transition-colors ${dockPosition === 'bottom' ? 'bg-[#FAF0EB] text-[#C96442]' : 'text-[#A3A19B] hover:text-[#2C2B29]'}`} title="하단 화면으로 이동"><PanelBottom className="w-3.5 h-3.5 stroke-[1.5px]" /></button>
                <button onClick={() => onDockPositionChange('free')} className={`p-1 rounded-lg transition-colors ${dockPosition === 'free' ? 'bg-[#FAF0EB] text-[#C96442]' : 'text-[#A3A19B] hover:text-[#2C2B29]'}`} title="자유창(팝업)으로 분리"><Maximize2 className="w-3.5 h-3.5 stroke-[1.5px]" /></button>
              </div>

              {view === 'editor' && (
                <div className="flex items-center gap-2">
                  {saveStatus === 'saved' && (
                    <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                      <span>✓</span> 저장됨
                    </span>
                  )}
                  {saveStatus === 'saving' && (
                    <span className="text-[10px] text-[#A3A19B] font-semibold animate-pulse">
                      저장 중...
                    </span>
                  )}
                  {saveStatus === 'unsaved' && (
                    <span className="text-[10px] text-[#D97706] font-semibold">
                      저장 필요
                    </span>
                  )}
                  <button 
                    onClick={async () => {
                      if (activeSermonId) {
                        setSaveStatus('saving');
                        const titleToSave = editorTitle.trim() || '제목 없음';
                        await handleSaveSermon(activeSermonId, titleToSave, editorContent);
                        setSaveStatus('saved');
                      }
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#C96442] hover:bg-[#B55434] active:bg-[#A3472A] text-white rounded-xl transition-colors font-semibold text-xs shadow-2xs">
                    <Save className="w-3.5 h-3.5 stroke-[1.5px]" /> 저장
                  </button>
                </div>
              )}
              <button onClick={handleClose} className="p-1 hover:bg-[#FAF0EB] hover:text-[#C96442] rounded-lg transition-colors text-[#A3A19B]">
                <X className="w-4 h-4 stroke-[1.5px]" />
              </button>
            </div>
          </div>

          {view === 'list' ? (
            // --- LIST VIEW ---
            <div className="flex-1 flex flex-col min-h-0 bg-[#FAF9F5]">
              {/* Search Bar */}
              <div className="p-3.5 border-b border-[#E7E5DF] bg-white shrink-0 space-y-2.5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A19B] stroke-[1.5px]" />
                  <input 
                    type="text" 
                    placeholder="설교 제목, 본문(예: 마 1 6, 롬 8:28)..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#FAF9F5] border border-[#E7E5DF] rounded-xl pl-9 pr-8 py-2 text-xs text-[#2C2B29] outline-none focus:bg-white focus:border-[#8C877D] focus:ring-2 focus:ring-[#2C2B29]/5 transition-all placeholder:text-[#A3A19B]"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A3A19B] hover:text-[#2C2B29] p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Tab Switcher: 최신순 vs 성경 66권 권별 */}
                <div className="flex bg-[#F5F3ED] p-1 rounded-xl gap-1">
                  <button
                    onClick={() => setListTab('recent')}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      listTab === 'recent'
                        ? 'bg-white text-[#2C2B29] shadow-xs'
                        : 'text-[#6A6864] hover:text-[#2C2B29]'
                    }`}
                  >
                    <span>최신순</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${listTab === 'recent' ? 'bg-[#F0EEE6] text-[#2C2B29]' : 'text-[#8C877D]'}`}>
                      {filteredSermons.length}
                    </span>
                  </button>
                  <button
                    onClick={() => setListTab('byBook')}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      listTab === 'byBook'
                        ? 'bg-white text-[#2C2B29] shadow-xs'
                        : 'text-[#6A6864] hover:text-[#2C2B29]'
                    }`}
                  >
                    <BookOpen className={`w-3.5 h-3.5 stroke-[1.5px] ${listTab === 'byBook' ? 'text-[#2C2B29]' : 'text-[#6A6864]'}`} />
                    <span>권별 모아보기</span>
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-3.5 space-y-2 bg-[#FAF9F5] custom-scrollbar">
                <button 
                  onClick={createNewEditor}
                  className="w-full flex items-center justify-center gap-2 p-2.5 border-2 border-dashed border-[#E5E0D8] rounded-xl text-[#4A4741] text-xs font-semibold bg-white/70 hover:bg-white hover:border-[#C4BFAF] hover:shadow-xs transition-all active:scale-[0.99]"
                >
                  <Plus className="w-4 h-4 stroke-[1.5px]" /> 새 설교문 작성하기
                </button>

                {filteredSermons.length === 0 ? (
                  <div className="text-center py-10 text-[#A3A19B] text-xs font-medium">
                    {searchQuery ? '검색된 설교문이 없습니다.' : '작성된 설교문이 없습니다.'}
                  </div>
                ) : listTab === 'recent' ? (
                  // 1) 최신순 리스트
                  filteredSermons.map(s => (
                    <div 
                      key={s.id} 
                      onClick={() => openEditor(s.id)}
                      className="p-3 bg-white border border-[#E7E5DF] rounded-xl shadow-2xs hover:border-[#D5D0C7] hover:shadow-md hover:bg-[#FDFBF7] transition-all cursor-pointer group flex flex-col gap-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-xs text-[#2C2B29] transition-colors truncate">
                            {s.title}
                          </h3>
                          <div className="flex items-center justify-between gap-2 mt-1">
                            <p className="text-[11px] text-[#6A6864] line-clamp-1 font-serif flex-1 min-w-0">
                              {s.content ? s.content.replace(/[#*`\n]/g, ' ').trim() : ''}
                            </p>
                            <span className="text-[10px] text-[#A3A19B] flex items-center gap-1 shrink-0 whitespace-nowrap ml-1">
                              <Calendar className="w-3 h-3 stroke-[1.5px]" /> {s.date}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-7 h-7 rounded-lg bg-[#F5F3ED] flex items-center justify-center text-[#2C2B29]">
                            <FileEdit className="w-3.5 h-3.5 stroke-[1.5px]" />
                          </div>
                          <button 
                            onClick={(e) => handleDeleteSermon(s.id, e)}
                            className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-red-600 hover:bg-red-100 transition-all z-10 cursor-pointer"
                            title="설교문 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5 stroke-[1.5px]" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  // 2) 성경 66권 권별 모아보기
                  <div className="space-y-2">
                    <div className="text-[11px] text-[#8C877D] px-1 py-0.5 flex items-center justify-between">
                      <span>제목의 성경 구절(예: 마 1 6, 롬 8:28)로 자동 분류</span>
                    </div>

                    {/* 설교가 배정된 성경 권들 */}
                    {BIBLE_LIST.filter(book => (bookGroups.map[book.id]?.length || 0) > 0).map(book => {
                      const bookSermons = bookGroups.map[book.id] || [];
                      const isExpanded = !!expandedBooks[book.id]; // 기본 닫힌 상태

                      return (
                        <div key={book.id} className="bg-white border border-[#E7E5DF] rounded-xl overflow-hidden shadow-2xs">
                          <button
                            onClick={() => toggleBookExpand(book.id)}
                            className={`w-full flex items-center justify-between p-3 bg-[#FDFBF7] hover:bg-[#F3EFE9] transition-colors text-left ${isExpanded ? 'border-b border-[#E7E5DF]' : ''}`}
                          >
                            <div className="flex items-center gap-2">
                              <BookOpen className="w-4 h-4 text-[#8C877D] stroke-[1.5px]" />
                              <span className="font-serif font-bold text-xs text-[#2C2B29]">{book.name}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#F0EEE6] text-[#2C2B29]">
                                {bookSermons.length}
                              </span>
                            </div>
                            <div className="text-[#8C877D]">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="p-2 space-y-1.5 bg-[#FAF9F5]">
                              {bookSermons.map(s => (
                                <div
                                  key={s.id}
                                  onClick={() => openEditor(s.id)}
                                  className="p-2.5 bg-white border border-[#EAE7E0] hover:border-[#D5D0C7] hover:shadow-md hover:bg-[#FDFBF7] rounded-lg transition-all cursor-pointer group flex items-start justify-between gap-2"
                                >
                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-semibold text-xs text-[#2C2B29] truncate">
                                      {s.title}
                                    </h4>
                                    <div className="flex items-center justify-between gap-2 mt-1">
                                      <p className="text-[10px] text-[#6A6864] line-clamp-1 font-serif flex-1 min-w-0">
                                        {s.content ? s.content.replace(/[#*`\n]/g, ' ').trim() : ''}
                                      </p>
                                      <span className="text-[10px] text-[#A3A19B] flex items-center gap-1 shrink-0 whitespace-nowrap ml-1">
                                        <Calendar className="w-2.5 h-2.5" /> {s.date}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                      onClick={(e) => handleDeleteSermon(s.id, e)}
                                      className="p-1 rounded text-red-600 hover:bg-red-50 cursor-pointer"
                                      title="설교문 삭제"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 stroke-[1.5px]" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* 주제별 / 일반 설교 (본문 미지정) */}
                    {bookGroups.etcList.length > 0 && (
                      <div className="bg-white border border-[#E7E5DF] rounded-xl overflow-hidden shadow-2xs">
                        <button
                          onClick={() => toggleBookExpand('ETC')}
                          className={`w-full flex items-center justify-between p-3 bg-[#FDFBF7] hover:bg-[#F3EFE9] transition-colors text-left ${!!expandedBooks['ETC'] ? 'border-b border-[#E7E5DF]' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                            <Folder className="w-4 h-4 text-[#8C877D] stroke-[1.5px]" />
                            <span className="font-serif font-bold text-xs text-[#2C2B29]">주제별 / 일반 설교</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#F0EEE6] text-[#2C2B29]">
                              {bookGroups.etcList.length}
                            </span>
                          </div>
                          <div className="text-[#8C877D]">
                            {!!expandedBooks['ETC'] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </button>

                        {!!expandedBooks['ETC'] && (
                          <div className="p-2 space-y-1.5 bg-[#FAF9F5]">

                            {bookGroups.etcList.map(s => (
                              <div
                                key={s.id}
                                onClick={() => openEditor(s.id)}
                                className="p-2.5 bg-white border border-[#EAE7E0] hover:border-[#D5D0C7] hover:shadow-md hover:bg-[#FDFBF7] rounded-lg transition-all cursor-pointer group flex items-start justify-between gap-2"
                              >
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-semibold text-xs text-[#2C2B29] truncate">
                                    {s.title}
                                  </h4>
                                  <div className="flex items-center justify-between gap-2 mt-1">
                                    <p className="text-[10px] text-[#6A6864] line-clamp-1 font-serif flex-1 min-w-0">
                                      {s.content ? s.content.replace(/[#*`\n]/g, ' ').trim() : ''}
                                    </p>
                                    <span className="text-[10px] text-[#A3A19B] flex items-center gap-1 shrink-0 whitespace-nowrap ml-1">
                                      <Calendar className="w-2.5 h-2.5" /> {s.date}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button 
                                    onClick={(e) => handleDeleteSermon(s.id, e)}
                                    className="p-1 rounded text-red-600 hover:bg-red-50 cursor-pointer"
                                    title="설교문 삭제"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 stroke-[1.5px]" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            // --- EDITOR VIEW ---
            <div className="flex-1 flex flex-col min-h-0 bg-[#FAF9F5] relative">
              <div className="flex items-center justify-between px-4 py-1.5 bg-white border-b border-[#E7E5DF]">
                <div className="flex items-center gap-1">
                  <button onClick={() => setSermonFontSize(prev => Math.max(10, prev - 1))} className="p-1 hover:bg-[#F5F3ED] rounded-lg text-[#6A6864] transition-colors" title="글자 작게">
                    <div className="flex items-center"><Type className="w-3 h-3 stroke-[1.5px]" /><Minus className="w-2.5 h-2.5 stroke-[1.5px]" /></div>
                  </button>
                  <span className="text-xs font-semibold text-[#A3A19B] min-w-4 text-center">{sermonFontSize}</span>
                  <button onClick={() => setSermonFontSize(prev => Math.min(30, prev + 1))} className="p-1 hover:bg-[#F5F3ED] rounded-lg text-[#6A6864] transition-colors" title="글자 크게">
                    <div className="flex items-center"><Type className="w-3.5 h-3.5 stroke-[1.5px]" /><Plus className="w-2.5 h-2.5 stroke-[1.5px]" /></div>
                  </button>
                </div>
                <button 
                  onClick={() => {
                    if (editorContent) {
                      navigator.clipboard.writeText(editorContent);
                      alert('복사되었습니다.');
                    }
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 hover:bg-[#F5F3ED] rounded-lg text-[#6A6864] hover:text-[#2C2B29] transition-colors text-xs font-semibold"
                >
                  <Copy className="w-3.5 h-3.5 stroke-[1.5px]" /> 전체 복사
                </button>
              </div>
              <div className="relative flex-1 flex flex-col min-h-0 bg-[#FAF9F5]">
                <input 
                  id="sermon-title-input"
                  type="text" 
                  disabled={!googleUserId}
                  placeholder="설교 제목..." 
                  className={`w-full text-base font-serif font-bold border-b border-[#E7E5DF] outline-none px-6 py-3.5 placeholder:text-[#A3A19B] shrink-0 ${!googleUserId ? 'text-[#A3A19B] bg-[#F5F3ED] opacity-80 cursor-not-allowed' : 'text-[#2C2B29] bg-white'}`}
                  value={editorTitle}
                  onChange={(e) => setEditorTitle(e.target.value)}
                />
                <textarea 
                  disabled={!googleUserId}
                  style={{ fontSize: `${sermonFontSize}px` }}
                  className={`flex-1 w-full p-6 leading-relaxed font-serif border-none outline-none resize-none placeholder:text-[#A3A19B] custom-scrollbar ${!googleUserId ? 'text-[#A3A19B] bg-[#F5F3ED] opacity-80 cursor-not-allowed' : 'text-[#2C2B29] bg-[#FAF9F5]'}`}
                  placeholder="말씀을 이곳에 작성하세요..."
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                />
                {!googleUserId && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#FAF9F5]/90 backdrop-blur-[1px] z-10 p-6 text-center">
                    <div className="w-10 h-10 bg-[#F5F3ED] rounded-full flex items-center justify-center mb-3 text-[#C96442] shadow-2xs border border-[#E7E5DF]">
                      <FileEdit className="w-5 h-5 stroke-[1.5px]" />
                    </div>
                    <h3 className="text-[#2C2B29] font-bold text-sm mb-1.5">로그인이 필요한 기능입니다</h3>
                    <p className="text-xs text-[#6A6864] font-medium leading-relaxed">
                      왼쪽 사이드바의 <strong>[로그인 / 간편가입]</strong> 버튼을 눌러<br/>가입 후 로그인하시면 편하게 사용하실 수 있습니다.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
  
  return sidebarContent;
});

