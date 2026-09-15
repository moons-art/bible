import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Type, Plus, Minus, Send, Trash2, BookOpen, MessageSquare, Link2, FileEdit } from 'lucide-react';
import { BIBLE_LIST } from '../constants/bibleMeta';
import { parseBibleReferences, syncBidirectionalCrossRefs } from '../utils/crossRefParser';

import { useBible } from '../stores/BibleContext';

export interface PopupState {
  id: string;
  bookId: string;
  chapter: number;
  verse: number;
  endVerse?: number;
  panel: 'note' | 'crossRef' | 'sermon' | 'read';
  pos: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
}

interface BiblePopupProps {
  popup: PopupState;
  onClose: (id: string) => void;
  onBringToFront: (id: string) => void;
  onUpdatePos: (id: string, dx: number, dy: number) => void;
  onUpdateSize: (id: string, w: number, h: number) => void;
  verseData: any;
  setVerseData: any;
  fontSizes: any;
  handleFontSizeChange: (delta: number, panel: string) => void;
  onSendToSermon?: (text: string) => void;
  onNavigateToDualView?: (bookId: string, chapter: number, verse: number) => void;
  onOpenPopup?: (bookId: string, chapter: number, verse: number, type: 'note' | 'crossRef' | 'sermon' | 'read', endVerse?: number) => void;
}

export const BiblePopup: React.FC<BiblePopupProps> = ({
  popup, onClose, onBringToFront, onUpdatePos, onUpdateSize,
  verseData, setVerseData, fontSizes, handleFontSizeChange, onSendToSermon, onNavigateToDualView, onOpenPopup
}) => {
  const { id, bookId, chapter, verse, panel, pos, size, zIndex, endVerse } = popup;
  const currentFontSize = fontSizes[panel] || 15;
  const { versions } = useBible();
  const isAuthenticated = !!localStorage.getItem('gdrive_token');
  
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, initX: 0, initY: 0, initW: 0, initH: 0 });

  let readContent = '';
  let activeVersionName = '';
  if (panel === 'read') {
    const activeVersion = versions && versions.length > 0 ? versions[0] : null;
    activeVersionName = activeVersion?.name || '성경';
    if (activeVersion && activeVersion.verses) {
      const startV = verse;
      const endV = endVerse || verse;
      const targetVerses = activeVersion.verses.filter((v: any) => 
        v.bookId === bookId && v.chapter === chapter && v.verse >= startV && v.verse <= endV
      ).sort((a: any, b: any) => a.verse - b.verse);
      
      if (targetVerses.length > 0) {
        readContent = targetVerses.map((v: any) => `${v.verse}. ${v.content}`).join('\n');
      }
    }
    if (!readContent) readContent = '성경 데이터를 불러올 수 없습니다.';
  }

  useEffect(() => {
    if (!isDragging && !isResizing) return;
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      
      if (isDragging) {
        const dx = clientX - dragStartRef.current.x;
        const dy = clientY - dragStartRef.current.y;
        onUpdatePos(id, dx, dy);
        dragStartRef.current.x = clientX;
        dragStartRef.current.y = clientY;
      } else if (isResizing) {
        const dx = clientX - dragStartRef.current.x;
        const dy = clientY - dragStartRef.current.y;
        
        let newWidth = dragStartRef.current.initW;
        if (isResizing === 'left') {
          newWidth -= dx * 2; // multiply by 2 because the popup is centered with translate (-50%)
        } else {
          newWidth += dx * 2;
        }
        
        // Height grows as you pull UP
        let newHeight = dragStartRef.current.initH - dy;
        
        onUpdateSize(id, Math.max(300, newWidth), Math.max(200, newHeight));
      }
    };
    const handleUp = () => { setIsResizing(null); setIsDragging(false); };
    
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
  }, [isDragging, isResizing, id, onUpdatePos, onUpdateSize]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      onMouseDown={() => onBringToFront(id)}
      onTouchStart={() => onBringToFront(id)}
      style={{ 
        width: size.width, 
        height: size.height, 
        x: `calc(-50% + ${pos.x}px)`, 
        y: pos.y,
        zIndex 
      }}
      className="fixed bottom-6 left-1/2 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col"
    >
      {/* Resizers - Enlarged for easier touch */}
      <div 
        className="absolute top-0 left-0 w-16 h-16 cursor-nwse-resize z-[10001] bg-slate-900/0 hover:bg-indigo-500/10 rounded-tl-2xl flex items-start justify-start p-2"
        onMouseDown={(e) => { 
          e.preventDefault(); e.stopPropagation(); 
          dragStartRef.current = { ...dragStartRef.current, x: e.clientX, y: e.clientY, initW: size.width, initH: size.height };
          setIsResizing('left'); 
        }}
        onTouchStart={(e) => { 
          e.stopPropagation(); 
          dragStartRef.current = { ...dragStartRef.current, x: e.touches[0].clientX, y: e.touches[0].clientY, initW: size.width, initH: size.height };
          setIsResizing('left'); 
        }}
      >
        <div className="w-5 h-5 border-t-[3px] border-l-[3px] border-slate-400 rounded-tl-sm pointer-events-none mt-1 ml-1 opacity-50"></div>
      </div>
      <div 
        className="absolute top-0 right-0 w-16 h-16 cursor-nesw-resize z-[10001] bg-slate-900/0 hover:bg-indigo-500/10 rounded-tr-2xl flex items-start justify-end p-2"
        onMouseDown={(e) => { 
          e.preventDefault(); e.stopPropagation(); 
          dragStartRef.current = { ...dragStartRef.current, x: e.clientX, y: e.clientY, initW: size.width, initH: size.height };
          setIsResizing('right'); 
        }}
        onTouchStart={(e) => { 
          e.stopPropagation(); 
          dragStartRef.current = { ...dragStartRef.current, x: e.touches[0].clientX, y: e.touches[0].clientY, initW: size.width, initH: size.height };
          setIsResizing('right'); 
        }}
      >
        <div className="w-5 h-5 border-t-[3px] border-r-[3px] border-slate-400 rounded-tr-sm pointer-events-none mt-1 mr-1 opacity-50"></div>
      </div>
      
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl cursor-move select-none"
        onMouseDown={(e) => {
          dragStartRef.current = { x: e.clientX, y: e.clientY, initX: 0, initY: 0 };
          setIsDragging(true);
        }}
        onTouchStart={(e) => {
          dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, initX: 0, initY: 0 };
          setIsDragging(true);
        }}
      >
        <div className="flex items-center gap-2 text-indigo-600">
          {panel === 'note' && <MessageSquare className="w-4 h-4" />}
          {panel === 'crossRef' && <Link2 className="w-4 h-4" />}
          {panel === 'sermon' && <FileEdit className="w-4 h-4" />}
          {panel === 'read' && <BookOpen className="w-4 h-4" />}
          <span className="font-extrabold text-sm text-slate-800">
            {BIBLE_LIST.find(b => b.id === bookId)?.name} {chapter}장 {verse}{popup.endVerse ? `-${popup.endVerse}` : ''}절
            {panel === 'note' && ' 주석'}
            {panel === 'crossRef' && ' 관주'}
            {panel === 'sermon' && ' 구절노트'}
            {panel === 'read' && ' 성경 확인'}
          </span>
        </div>
        <div className="flex items-center gap-1 z-[10002]">
          {panel !== 'read' && (
            <button 
              className="p-1.5 hover:bg-red-100 rounded-full transition-colors text-red-500"
              onClick={(e) => {
                e.stopPropagation();
                const key = `${bookId}_${chapter}_${verse}`;
                setVerseData((prev: any) => {
                  let next = { ...prev };
                  const oldText = next[key]?.[panel] || '';
                  
                  if (panel === 'crossRef' && oldText) {
                    const currentBookName = BIBLE_LIST.find(b => b.id === bookId)?.name || '';
                    next = syncBidirectionalCrossRefs(key, currentBookName, chapter, verse, '', oldText, next);
                  }
                  
                  if (next[key]) {
                    next[key] = { ...next[key] };
                    delete next[key][panel];
                    
                    if (!next[key].note && !next[key].crossRef && !next[key].sermon) {
                      delete next[key];
                    }
                  }
                  return next;
                });
                onClose(id);
              }}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button 
            onClick={(e) => { e.stopPropagation(); onClose(id); }}
            className="p-1.5 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      {/* Editor Body */}
      <div className="p-2 bg-white flex flex-col gap-1.5 h-full relative" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-2 py-1 bg-slate-50 border border-slate-200 rounded-xl mb-1">
          <div className="flex items-center gap-1">
            {panel !== 'read' ? (
              <>
                <button onClick={() => handleFontSizeChange(-1, panel)} className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors">
                  <div className="flex items-center"><Type className="w-3 h-3" /><Minus className="w-2.5 h-2.5" /></div>
                </button>
                <span className="text-xs font-bold text-slate-400 min-w-4 text-center">{currentFontSize}</span>
                <button onClick={() => handleFontSizeChange(1, panel)} className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors">
                  <div className="flex items-center"><Type className="w-4 h-4" /><Plus className="w-3 h-3" /></div>
                </button>
              </>
            ) : <div />}
          </div>
          <div className="flex items-center gap-2">
            {panel === 'read' && onNavigateToDualView && (
              <button 
                onClick={() => {
                  onNavigateToDualView(bookId, chapter, verse);
                  onClose(id);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-200 rounded-lg text-indigo-600 transition-colors text-xs font-bold border border-indigo-100"
              >
                바로가기
              </button>
            )}
            <button 
              onClick={() => {
                const text = panel === 'read' ? readContent : (verseData[`${bookId}_${chapter}_${verse}`]?.[panel] || '');
                if (text) { navigator.clipboard.writeText(text); alert('복사되었습니다.'); }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors text-xs font-bold"
            >
              <Copy className="w-3.5 h-3.5" /> 복사
            </button>
            {panel === 'sermon' && onSendToSermon && (
              <button 
                onClick={() => {
                  const text = verseData[`${bookId}_${chapter}_${verse}`]?.sermon || '';
                  if (text.trim()) { onSendToSermon(text); onClose(id); }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-xs font-bold shadow-sm"
              >
                <Send className="w-3 h-3" /> 보내기
              </button>
            )}
          </div>
        </div>
        
        {panel === 'crossRef' && (() => {
          const text = verseData[`${bookId}_${chapter}_${verse}`]?.[panel] || '';
          const parsed = parseBibleReferences(text);
          if (parsed.length > 0) {
            return (
              <div className="flex flex-wrap gap-1.5 px-2 py-1">
                {parsed.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (onOpenPopup) {
                        onOpenPopup(p.bookId, p.chapter, p.verse, 'read', p.endVerse);
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md text-[11px] font-bold transition-colors border border-indigo-100 shadow-sm"
                  >
                    <BookOpen className="w-3 h-3" />
                    {p.bookName} {p.chapter}:{p.verse}{p.endVerse ? `-${p.endVerse}` : ''}
                  </button>
                ))}
              </div>
            );
          }
          return null;
        })()}
        
        {panel === 'read' ? (
          <div 
            style={{ fontSize: `${currentFontSize}px` }}
            className="w-full flex-1 p-4 text-slate-900 bg-white font-medium border border-slate-200 rounded-xl overflow-y-auto custom-scrollbar leading-relaxed"
          >
            <div className="font-bold text-sm text-indigo-600 mb-2 border-b border-indigo-100 pb-2">
              [{activeVersionName}] {BIBLE_LIST.find(b => b.id === bookId)?.name} {chapter}장 {verse}{popup.endVerse ? `-${popup.endVerse}` : ''}절
            </div>
            <div className="whitespace-pre-wrap">{readContent}</div>
          </div>
        ) : (
          <div className="relative flex-1 flex flex-col h-full">
            <textarea 
              autoFocus
              disabled={!isAuthenticated}
              style={{ fontSize: `${currentFontSize}px` }}
              className={`w-full flex-1 p-3 font-medium border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400/20 transition-all resize-none custom-scrollbar ${!isAuthenticated ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-80' : 'bg-slate-50 text-slate-900'}`}
              value={verseData[`${bookId}_${chapter}_${verse}`]?.[panel] || ''}
              onChange={(e) => {
                const val = e.target.value;
                const oldVal = verseData[`${bookId}_${chapter}_${verse}`]?.[panel] || '';
                const key = `${bookId}_${chapter}_${verse}`;
                
                setVerseData((prev: any) => {
                  let next = {
                    ...prev,
                    [key]: {
                      ...prev[key],
                      [panel]: val
                    }
                  };

                  if (panel === 'crossRef') {
                    const currentBookName = BIBLE_LIST.find(b => b.id === bookId)?.name || '';
                    next = syncBidirectionalCrossRefs(key, currentBookName, chapter, verse, val, oldVal, next);
                  }

                  return next;
                });
              }}
            />
            {!isAuthenticated && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/50 backdrop-blur-[1px] rounded-xl text-slate-500 font-bold z-10 p-4 text-center border border-slate-200 shadow-inner">
                <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                </div>
                <p className="text-sm">로그인 후 노트와 관주를 작성하고<br/>클라우드에 영구 저장하세요.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};
