import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileEdit, Plus, Calendar, Search, Save, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, PanelRight, PanelBottom } from 'lucide-react';

interface Sermon {
  id: string;
  title: string;
  date: string;
}

export type DockPosition = 'right' | 'bottom';

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
  const [sermons] = useState<Sermon[]>([
    { id: 'sermon-1', title: '주일예배 - 사랑의 하나님 (임시 데이터)', date: '2026-08-01' },
    { id: 'sermon-2', title: '수요예배 - 믿음과 순종 (임시 데이터)', date: '2026-07-25' }
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [activeSermonId, setActiveSermonId] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState('');

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

  // Handle Resize Mouse Events
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (dockPosition === 'right') {
        const newWidth = Math.max(280, Math.min(window.innerWidth - 320, window.innerWidth - e.clientX));
        onSidebarWidthChange(newWidth);
      } else if (dockPosition === 'bottom') {
        const newHeight = Math.max(180, Math.min(window.innerHeight - 150, window.innerHeight - e.clientY));
        onSidebarHeightChange(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, dockPosition, onSidebarWidthChange, onSidebarHeightChange]);

  const filteredSermons = sermons.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()));

  const openEditor = (id: string) => {
    setActiveSermonId(id);
    setView('editor');
    setEditorContent(id.startsWith('new') ? '' : '이전에 작성하던 임시 내용입니다...\n\n');
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
    }
  };

  const getContainerStyle = (): React.CSSProperties => {
    if (dockPosition === 'right') {
      return { width: `${sidebarWidth}px`, height: '100%', maxWidth: '90vw' };
    }
    return { width: '100%', height: `${sidebarHeight}px`, maxHeight: '80vh' };
  };

  const getVariants = () => {
    const isOffScreen = !isOpen;
    if (isOffScreen || isCollapsed) {
      switch (dockPosition) {
        case 'right': return { x: '100%', y: 0 };
        case 'bottom': return { x: 0, y: '100%' };
      }
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
    }
  };

  return (
    <>
      {/* Drag overlay to capture mouse movement smoothly */}
      {isResizing && (
        <div className="fixed inset-0 z-[99999] cursor-ew-resize select-none" />
      )}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            key="sermon-sidebar"
            initial={getVariants()}
            animate={getVariants()}
            exit={getVariants()}
            transition={isResizing ? { duration: 0 } : { type: 'spring', damping: 25, stiffness: 200 }}
            className={`bg-white z-50 flex flex-col overflow-visible ${getContainerClasses()}`}
            style={getContainerStyle()}
          >
            {/* Drag Resize Handle (Left for right-dock, Top for bottom-dock) */}
            {dockPosition === 'right' && (
              <div 
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setIsResizing(true); }}
                className="absolute -left-2 top-0 bottom-0 w-4 cursor-ew-resize hover:bg-indigo-500/30 active:bg-indigo-600 transition-colors z-[100] group flex items-center justify-center"
                title="드래그하여 크기 조절"
              >
                <div className="w-1.5 h-16 bg-slate-300 group-hover:bg-indigo-500 rounded-full transition-colors shadow-sm" />
              </div>
            )}
            {dockPosition === 'bottom' && (
              <div 
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setIsResizing(true); }}
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

          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
            <div className="flex items-center gap-2">
              <button 
                onClick={view === 'editor' ? () => setView('list') : handleClose}
                className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-500"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-800 flex items-center gap-2">
                <FileEdit className="w-4 h-4 text-indigo-600" />
                {view === 'editor' ? '설교문 작성' : '설교목록'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              
              {/* Docking Controls */}
              <div className="hidden sm:flex items-center bg-slate-200/50 rounded-lg p-0.5 mr-2">
                <button onClick={() => onDockPositionChange('right')} className={`p-1.5 rounded-md transition-colors ${dockPosition === 'right' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`} title="우측 화면으로 이동"><PanelRight className="w-4 h-4" /></button>
                <button onClick={() => onDockPositionChange('bottom')} className={`p-1.5 rounded-md transition-colors ${dockPosition === 'bottom' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`} title="하단 화면으로 이동"><PanelBottom className="w-4 h-4" /></button>
              </div>

              {view === 'editor' && (
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors font-bold text-xs">
                  <Save className="w-3.5 h-3.5" /> 저장
                </button>
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
                  onClick={() => openEditor(`new-${Date.now()}`)}
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
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <FileEdit className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // --- EDITOR VIEW ---
            <div className="flex-1 flex flex-col min-h-0 bg-white">
              <input 
                type="text" 
                placeholder="설교 제목..." 
                className="w-full text-lg font-black text-slate-900 border-b border-slate-100 outline-none px-6 py-4 placeholder:text-slate-300 shrink-0"
                defaultValue={activeSermonId?.startsWith('new') ? '' : '임시 설교 제목'}
              />
              <textarea 
                className="flex-1 w-full p-6 text-sm leading-relaxed text-slate-900 bg-white font-medium border-none outline-none resize-none placeholder:text-slate-400 custom-scrollbar"
                placeholder="말씀을 이곳에 작성하세요..."
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
              />
            </div>
          )}
        </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
});

