import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Type, Plus, Minus, Send, Trash2, BookOpen, MessageSquare, Link2, FileEdit } from 'lucide-react';
import { BIBLE_LIST } from '../constants/bibleMeta';
import { parseBibleReferences, syncBidirectionalCrossRefs } from '../utils/crossRefParser';

import { useBible } from '../stores/BibleContext';
import { auth } from '../api/firebaseConfig';

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

  // Firebase Auth 기반 로그인 상태 실시간 감지
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!auth.currentUser);
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      setIsAuthenticated(!!user);
    });
    return () => unsub();
  }, []);
  
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, initX: 0, initY: 0, initW: 0, initH: 0 });

  const verseKey = `${bookId}_${chapter}_${verse}`;
  const externalText = panel !== 'read' ? (verseData[verseKey]?.[panel] || '') : '';

  // 한글 IME 조합 중복 입력 방지를 위한 로컬 버퍼 상태
  const [localText, setLocalText] = useState(externalText);
  const localTextRef = useRef(localText);
  localTextRef.current = localText;
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 외부 데이터 변경 시 동기화 (구절 전환 등)
  useEffect(() => {
    setLocalText(externalText);
  }, [verseKey, panel, externalText]);

  // 상위 전역 상태 동기화 함수
  const syncToParent = (val: string) => {
    setVerseData((prev: any) => {
      const oldVal = prev[verseKey]?.[panel] || '';
      if (oldVal === val) return prev;
      
      let next = {
        ...prev,
        [verseKey]: {
          ...prev[verseKey],
          [panel]: val
        }
      };

      if (panel === 'crossRef') {
        const currentBookName = BIBLE_LIST.find(b => b.id === bookId)?.name || '';
        next = syncBidirectionalCrossRefs(verseKey, currentBookName, chapter, verse, val, oldVal, next);
      }

      return next;
    });
  };

  // 텍스트 변경 핸들러 (로컬 즉시 반영 + 250ms 디바운스 동기화)
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setLocalText(val);

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // 타이핑 중 과도한 DB 쓰기 방지: 1.2초 디바운스로 안정화 (타이핑 완료 시 1회만 반영)
    saveTimerRef.current = setTimeout(() => {
      syncToParent(val);
    }, 1200);
  };

  // 포커스 벗어날 때(작성 완료 시) 즉시 동기화
  const handleBlur = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    syncToParent(localTextRef.current);
  };

  // 언마운트 시 미저장 텍스트 동기화
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      syncToParent(localTextRef.current);
    };
  }, [verseKey, panel]);

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
      {/* Resizers - 영역을 기존의 절반(w-8 h-8)으로 슬림화 */}
      <div 
        className="absolute top-0 left-0 w-8 h-8 cursor-nwse-resize z-[10001] bg-slate-900/0 hover:bg-[#C46A40]/10 rounded-tl-2xl flex items-start justify-start p-1.5"
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
        title="크기 조절"
      >
        <div className="w-2.5 h-2.5 border-t-2 border-l-2 border-[#A39E94] rounded-tl-xs pointer-events-none mt-0.5 ml-0.5 opacity-60"></div>
      </div>
      <div 
        className="absolute top-0 right-0 w-8 h-8 cursor-nesw-resize z-[10001] bg-slate-900/0 hover:bg-[#C46A40]/10 rounded-tr-2xl flex items-start justify-end p-1.5"
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
        title="크기 조절"
      >
        <div className="w-2.5 h-2.5 border-t-2 border-r-2 border-[#A39E94] rounded-tr-xs pointer-events-none mt-0.5 mr-0.5 opacity-60"></div>
      </div>
      
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 border-b border-[#E7E5DF] bg-[#F5F3ED] rounded-t-2xl cursor-move select-none"
        onMouseDown={(e) => {
          dragStartRef.current = { x: e.clientX, y: e.clientY, initX: 0, initY: 0 };
          setIsDragging(true);
        }}
        onTouchStart={(e) => {
          dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, initX: 0, initY: 0 };
          setIsDragging(true);
        }}
      >
        <div className="flex items-center gap-2">
          {panel === 'note' && <MessageSquare className="w-4 h-4 text-[#D97706] stroke-[1.5px]" />}
          {panel === 'crossRef' && <Link2 className="w-4 h-4 text-[#3B6D8C] stroke-[1.5px]" />}
          {panel === 'sermon' && <FileEdit className="w-4 h-4 text-[#C96442] stroke-[1.5px]" />}
          {panel === 'read' && <BookOpen className="w-4 h-4 text-[#2C2B29] stroke-[1.5px]" />}
          <span className="font-serif font-bold text-sm text-[#2C2B29]">
            {BIBLE_LIST.find(b => b.id === bookId)?.name} {chapter}장 {verse}{popup.endVerse ? `-${popup.endVerse}` : ''}절
            {panel === 'note' && ' 주석'}
            {panel === 'crossRef' && ' 관주'}
            {panel === 'sermon' && ' 구절노트'}
            {panel === 'read' && ' 성경 본문'}
          </span>
        </div>
        <div className="flex items-center gap-1 z-[10002]">
          {panel !== 'read' && (
            <button 
              className="p-1.5 hover:bg-[#FAF0EB] rounded-lg transition-colors text-[#A3A19B] hover:text-[#C96442]"
              title="삭제"
              onClick={(e) => {
                e.stopPropagation();
                if (saveTimerRef.current) {
                  clearTimeout(saveTimerRef.current);
                }
                setLocalText('');
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
              <Trash2 className="w-3.5 h-3.5 stroke-[1.5px]" />
            </button>
          )}
          <button 
            onClick={(e) => { e.stopPropagation(); onClose(id); }}
            className="p-1.5 hover:bg-[#FAF0EB] rounded-lg transition-colors text-[#A3A19B] hover:text-[#2C2B29]"
            title="닫기"
          >
            <X className="w-4 h-4 stroke-[1.5px]" />
          </button>
        </div>
      </div>
      
      {/* Editor Body */}
      <div className="p-2.5 bg-[#FAF9F5] flex flex-col gap-1.5 h-full relative rounded-b-2xl" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-2.5 py-1 bg-white border border-[#E7E5DF] rounded-xl mb-1 shadow-2xs">
          <div className="flex items-center gap-2">
            {panel !== 'read' ? (
              <div className="flex items-center gap-1.5" title={`글자 크기: ${currentFontSize}px`}>
                <Type className="w-3.5 h-3.5 text-[#8C877D] stroke-[1.8px] shrink-0" />
                <input 
                  type="range"
                  min={12}
                  max={28}
                  step={1}
                  value={currentFontSize}
                  onChange={(e) => {
                    const nextVal = parseInt(e.target.value, 10);
                    handleFontSizeChange(nextVal - currentFontSize, panel);
                  }}
                  className="w-20 sm:w-24 h-1.5 bg-[#EAE4D6] rounded-lg appearance-none cursor-pointer accent-[#C46A40]"
                  title="가로 바로 글자 크기 조절"
                />
                <span className="text-[11px] font-semibold text-[#6E6A63] min-w-4 text-center font-mono">
                  {currentFontSize}
                </span>
              </div>
            ) : <div />}
          </div>
          <div className="flex items-center gap-1.5">
            {panel === 'read' && onNavigateToDualView && (
              <button 
                onClick={() => {
                  onNavigateToDualView(bookId, chapter, verse);
                  onClose(id);
                }}
                className="flex items-center gap-1 px-2.5 py-1 hover:bg-[#FAF0EB] rounded-lg text-[#C96442] transition-colors text-xs font-semibold border border-[#F1D3C6]"
              >
                본문 바로가기
              </button>
            )}
            <button 
              onClick={() => {
                const text = panel === 'read' ? readContent : localText;
                if (text) { navigator.clipboard.writeText(text); alert('복사되었습니다.'); }
              }}
              className="flex items-center gap-1 px-2.5 py-1 hover:bg-[#F5F3ED] rounded-lg text-[#6A6864] hover:text-[#2C2B29] transition-colors text-xs font-semibold"
            >
              <Copy className="w-3.5 h-3.5 stroke-[1.5px]" /> 복사
            </button>
            {panel === 'sermon' && onSendToSermon && (
              <button 
                onClick={() => {
                  const text = localText || '';
                  if (text.trim()) { 
                    syncToParent(text);
                    onSendToSermon(text); 
                    onClose(id); 
                  }
                }}
                className="flex items-center gap-1 px-3 py-1 bg-[#C96442] hover:bg-[#B55434] text-white rounded-lg transition-colors text-xs font-semibold shadow-2xs"
              >
                <Send className="w-3 h-3 stroke-[1.5px]" /> 보내기
              </button>
            )}
          </div>
        </div>
        
        {panel === 'crossRef' && (() => {
          const text = localText;
          const parsed = parseBibleReferences(text);
          if (parsed.length > 0) {
            return (
              <div className="flex flex-wrap gap-1.5 px-1 py-1">
                {parsed.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (onOpenPopup) {
                        onOpenPopup(p.bookId, p.chapter, p.verse, 'read', p.endVerse);
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 bg-white hover:bg-[#F5F3ED] text-[#3B6D8C] rounded-lg text-xs font-semibold transition-colors border border-[#E7E5DF] shadow-2xs"
                  >
                    <BookOpen className="w-3 h-3 stroke-[1.5px]" />
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
            className="w-full flex-1 p-3.5 text-[#2C2B29] bg-white font-serif border border-[#E7E5DF] rounded-xl overflow-y-auto custom-scrollbar leading-relaxed"
          >
            <div className="font-bold text-xs text-[#C96442] mb-2 border-b border-[#E7E5DF] pb-1.5 font-sans">
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
              className={`w-full flex-1 p-3 font-serif border border-[#E7E5DF] rounded-xl outline-none focus:ring-2 focus:ring-[#C96442]/10 focus:border-[#C96442] transition-all resize-none custom-scrollbar ${!isAuthenticated ? 'bg-[#F5F3ED] text-[#A3A19B] cursor-not-allowed opacity-80' : 'bg-white text-[#2C2B29]'}`}
              value={localText}
              onChange={handleTextChange}
              onBlur={handleBlur}
            />
            {!isAuthenticated && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#FAF9F5]/90 backdrop-blur-[1px] rounded-xl text-[#6A6864] font-medium z-10 p-4 text-center border border-[#E7E5DF] shadow-inner">
                <div className="w-9 h-9 bg-[#F5F3ED] rounded-full flex items-center justify-center mb-2">
                  <BookOpen className="w-4 h-4 text-[#C96442] stroke-[1.5px]" />
                </div>
                <h3 className="text-[#2C2B29] font-bold text-sm mb-1.5">로그인이 필요한 기능입니다</h3>
                <p className="text-xs text-[#6A6864] font-medium leading-relaxed">
                  왼쪽 사이드바의 <strong>[로그인 / 간편가입]</strong> 버튼을 눌러<br/>
                  가입 후 로그인하시면 편하게 사용하실 수 있습니다.
                </p>
              </div>
            )}

            {/* 노트창 하단 고정 안내 문구 */}
            <div className="text-center pt-1.5 shrink-0 select-none">
              <p className="text-[10px] text-[#A39E94] font-normal tracking-tight">
                노트창은 앱의 하단에 고정되어 움직입니다.
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
