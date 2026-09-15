import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileEdit, Plus, Calendar, Search, Save, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, PanelRight, PanelBottom, Maximize2, Type, Minus, Copy, Trash2 } from 'lucide-react';
import { db } from '../api/firebaseConfig';
import { doc, collection, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';

import { fetchUserProfile } from '../api/gdriveWebService';


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
    const handleAuth = async () => {
      const { gdriveWebService } = await import('../api/gdriveWebService');
      const token = gdriveWebService.getAccessToken();
      if (!token || token === 'mock_local_token_123') return;
      const profile = await fetchUserProfile(token);
      if (profile && profile.id) {
        setGoogleUserId(profile.id);
        subscribeToSermons(profile.id);
      }
    };
    window.addEventListener('gdrive_authenticated', handleAuth);
    handleAuth();
    return () => {
      window.removeEventListener('gdrive_authenticated', handleAuth);
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

  const filteredSermons = sermons.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()));

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
      case 'right': return 'fixed top-0 right-0 border-l border-slate-200 shadow-[-10px_0_40px_rgba(0,0,0,0.15)]';
      case 'bottom': return 'fixed bottom-0 left-0 border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.15)]';
      case 'free': return 'fixed bottom-6 left-1/2 rounded-2xl shadow-2xl border border-slate-200 ';
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

  const renderTabIcon = () => {
    if (dockPosition === 'right') return isCollapsed ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />;
    if (dockPosition === 'bottom') return isCollapsed ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />;
  };

  const getTabClasses = () => {
    switch (dockPosition) {
      case 'right': return 'absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 rounded-l-xl border-y border-l py-8 px-1.5';
      case 'bottom': return 'absolute top-0 left-1/2 -translate-y-full -translate-x-1/2 rounded-t-xl border-x border-t px-8 py-1.5';
      case 'free': return 'hidden';
    }
  };

  const sidebarContent = (
    <>
      {/* Drag overlay to capture mouse movement smoothly */}
      {isResizing && (
        <div className="fixed inset-0 z-[99999] cursor-ew-resize select-none" />
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
            className={`bg-white z-50 flex flex-col overflow-visible ${getContainerClasses()}`}
            style={{ zIndex: dockPosition === 'free' ? sermonZIndex : undefined, ...getContainerStyle() }}
          >
            {/* Drag Resize Handle (Left for right-dock, Top for bottom-dock) */}
            {dockPosition === 'right' && (
              <div 
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setIsResizing(true); }}
                onTouchStart={(e) => { e.stopPropagation(); setIsResizing(true); }}
                className="absolute -left-2 top-0 bottom-0 w-4 cursor-ew-resize hover:bg-indigo-500/30 active:bg-indigo-600 transition-colors z-[100] group flex items-center justify-center"
                title="드래그하여 크기 조절"
              >
                <div className="w-1.5 h-16 bg-slate-300 group-hover:bg-indigo-500 rounded-full transition-colors shadow-sm" />
              </div>
            )}
            {dockPosition === 'bottom' && (
              <div 
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setIsResizing(true); }}
                onTouchStart={(e) => { e.stopPropagation(); setIsResizing(true); }}
                className="absolute -top-2 left-0 right-0 h-4 cursor-ns-resize hover:bg-indigo-500/30 active:bg-indigo-600 transition-colors z-[100] group flex items-center justify-center"
                title="드래그하여 크기 조절"
              >
                <div className="h-1.5 w-16 bg-slate-300 group-hover:bg-indigo-500 rounded-full transition-colors shadow-sm" />
              </div>
            )}

          {/* Toggle Tab (Visible even when collapsed) */}
          <button
            onClick={() => onCollapseChange(!isCollapsed)}
            className={`
              ${getTabClasses()} 
              bg-indigo-500/15 backdrop-blur-md text-indigo-700 border-indigo-200/50 shadow-lg hover:bg-indigo-500/30 transition-all z-50
            `}
            title={isCollapsed ? "설교노트 열기" : "설교노트 숨기기"}
          >
            {renderTabIcon()}
          </button>
          
          {/* Free Mode Resizers */}
          {dockPosition === 'free' && (
            <>
              <div 
                className="absolute top-0 left-0 w-16 h-16 cursor-nwse-resize z-[100] bg-slate-900/0 hover:bg-indigo-500/10 rounded-tl-2xl flex items-start justify-start p-2"
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
                <div className="w-5 h-5 border-t-[3px] border-l-[3px] border-slate-400 rounded-tl-sm pointer-events-none mt-1 ml-1 opacity-50"></div>
              </div>
              <div 
                className="absolute top-0 right-0 w-16 h-16 cursor-nesw-resize z-[100] bg-slate-900/0 hover:bg-indigo-500/10 rounded-tr-2xl flex items-start justify-end p-2"
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
                <div className="w-5 h-5 border-t-[3px] border-r-[3px] border-slate-400 rounded-tr-sm pointer-events-none mt-1 mr-1 opacity-50"></div>
              </div>
            </>
          )}

          {/* Header */}
          <div 
            className={`flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50 shrink-0 ${dockPosition === 'free' ? 'cursor-move' : ''}`}
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
            <div className="flex items-center gap-2 relative z-[110]">
              <button 
                onClick={view === 'editor' ? () => setView('list') : handleClose}
                className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-500"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-800 flex items-center gap-2">
                <FileEdit className="w-4 h-4 text-indigo-600" />
                {view === 'editor' ? null : '목록'}
              </h2>
            </div>
            <div className="flex items-center gap-2 relative z-[110]">
              
              {/* Docking Controls */}
              <div className="hidden sm:flex items-center bg-slate-200/50 rounded-lg p-0.5 mr-2">
                <button onClick={() => onDockPositionChange('right')} className={`p-1.5 rounded-md transition-colors ${dockPosition === 'right' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`} title="우측 화면으로 이동"><PanelRight className="w-4 h-4" /></button>
                <button onClick={() => onDockPositionChange('bottom')} className={`p-1.5 rounded-md transition-colors ${dockPosition === 'bottom' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`} title="하단 화면으로 이동"><PanelBottom className="w-4 h-4" /></button>
                <button onClick={() => onDockPositionChange('free')} className={`p-1.5 rounded-md transition-colors ${dockPosition === 'free' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`} title="자유창(팝업)으로 분리"><Maximize2 className="w-4 h-4" /></button>
              </div>

              {view === 'editor' && (
                <div className="flex items-center gap-2">
                  {saveStatus === 'saved' && (
                    <span className="text-[10px] text-green-600 font-bold flex items-center gap-0.5">
                      <span>✓</span> 저장됨
                    </span>
                  )}
                  {saveStatus === 'saving' && (
                    <span className="text-[10px] text-slate-400 font-bold animate-pulse">
                      저장 중...
                    </span>
                  )}
                  {saveStatus === 'unsaved' && (
                    <span className="text-[10px] text-orange-400 font-bold">
                      저장되지 않음
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
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg transition-colors font-bold text-xs shadow-sm">
                    <Save className="w-3.5 h-3.5" /> 저장
                  </button>
                </div>
              )}
              <button onClick={handleClose} className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded-full transition-colors text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {view === 'list' ? (
            // --- LIST VIEW ---
            <div className="flex-1 flex flex-col min-h-0">
              <div className="p-4 border-b border-slate-100 bg-white shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="설교문 제목 검색..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 transition-all"
                  />
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/30 custom-scrollbar">
                <button 
                  onClick={createNewEditor}
                  className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-indigo-200 rounded-xl text-indigo-600 text-sm font-bold hover:bg-indigo-50 hover:border-indigo-400 transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4" /> 새 설교문 작성하기
                </button>
                
                {filteredSermons.map(s => (
                  <div 
                    key={s.id} 
                    onClick={() => openEditor(s.id)}
                    className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-md hover:border-indigo-100 transition-all cursor-pointer group"
                  >
                    <div>
                      <h3 className="font-bold text-sm text-slate-800 group-hover:text-indigo-600 transition-colors">{s.title}</h3>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                        <Calendar className="w-3 h-3" /> {s.date}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <FileEdit className="w-4 h-4" />
                      </div>
                      <button 
                        onClick={(e) => handleDeleteSermon(s.id, e)}
                        className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-600 hover:bg-red-100 hover:scale-110 transition-all z-10"
                        title="설교문 삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // --- EDITOR VIEW ---
            <div className="flex-1 flex flex-col min-h-0 bg-white relative">
              <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center gap-1">
                  <button onClick={() => setSermonFontSize(prev => Math.max(10, prev - 1))} className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors" title="글자 작게">
                    <div className="flex items-center"><Type className="w-3 h-3" /><Minus className="w-2.5 h-2.5" /></div>
                  </button>
                  <span className="text-xs font-bold text-slate-400 min-w-4 text-center">{sermonFontSize}</span>
                  <button onClick={() => setSermonFontSize(prev => Math.min(30, prev + 1))} className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors" title="글자 크게">
                    <div className="flex items-center"><Type className="w-4 h-4" /><Plus className="w-3 h-3" /></div>
                  </button>
                </div>
                <button 
                  onClick={() => {
                    if (editorContent) {
                      navigator.clipboard.writeText(editorContent);
                      alert('복사되었습니다.');
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors text-xs font-bold"
                >
                  <Copy className="w-3.5 h-3.5" /> 전체 복사
                </button>
              </div>
              <div className="relative flex-1 flex flex-col min-h-0">
                <input 
                  id="sermon-title-input"
                  type="text" 
                  disabled={!googleUserId}
                  placeholder="설교 제목..." 
                  className={`w-full text-lg font-black border-b border-slate-100 outline-none px-6 py-4 placeholder:text-slate-300 shrink-0 ${!googleUserId ? 'text-slate-400 bg-slate-50 opacity-80 cursor-not-allowed' : 'text-slate-900 bg-white'}`}
                  value={editorTitle}
                  onChange={(e) => setEditorTitle(e.target.value)}
                />
                <textarea 
                  disabled={!googleUserId}
                  style={{ fontSize: `${sermonFontSize}px` }}
                  className={`flex-1 w-full p-6 leading-relaxed font-medium border-none outline-none resize-none placeholder:text-slate-400 custom-scrollbar ${!googleUserId ? 'text-slate-400 bg-slate-50 opacity-80 cursor-not-allowed' : 'text-slate-900 bg-white'}`}
                  placeholder="말씀을 이곳에 작성하세요..."
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                />
                {!googleUserId && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/50 backdrop-blur-[1px] z-10 p-6 text-center">
                    <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center mb-4 text-slate-500 shadow-sm border border-slate-300">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    </div>
                    <h3 className="text-slate-700 font-bold mb-2">로그인이 필요한 기능입니다</h3>
                    <p className="text-sm text-slate-500 font-medium">
                      왼쪽 탭 선택기 위쪽의 <strong>[구글 계정으로 로그인]</strong> 버튼을 눌러<br/>로그인하시면 설교노트를 영구적으로 저장할 수 있습니다.
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

