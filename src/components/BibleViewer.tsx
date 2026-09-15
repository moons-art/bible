import React, { useMemo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BibleVersion, Verse } from '../types/bible';
import { useBible } from '../stores/BibleContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, X, MessageSquare, Link2, FileEdit, Trash2, Send, Type, Plus, Minus } from 'lucide-react';
import { BIBLE_LIST } from '../constants/bibleMeta';
import { BiblePopup } from './BiblePopup';
import type { PopupState } from './BiblePopup';

interface BibleViewerProps {
  selectedVersions: BibleVersion[];
  currentBookId: string;
  currentChapter: number;
  highlightVerse?: number;
  fontSize?: number;
  lineHeight: number;
  isMainPane?: boolean;
  headerRightNode?: React.ReactNode;
  onCopyToSermon?: (text: string) => void;
  onNavigateToDualView?: (bookId: string, chapter: number, verse: number) => void;
}

const VerseItem = React.memo<{
  verse: Verse;
  isSelected: boolean;
  isHighlighted: boolean;
  hasNote: boolean;
  hasCrossRef: boolean;
  hasSermon: boolean;
  showAnnotations: boolean;
  fontSize: number;
  lineHeight: number;
  onClick: (v: number) => void;
  onIconClick: (v: number, type: 'note' | 'crossRef' | 'sermon', e: React.MouseEvent) => void;
}>(({ verse, isSelected, isHighlighted, hasNote, hasCrossRef, hasSermon, showAnnotations, fontSize, lineHeight, onClick, onIconClick }) => {
  const itemStyles = isSelected 
    ? 'bg-red-50 border-l-red-500' 
    : isHighlighted 
      ? 'bg-sky-50 border-l-sky-500' 
      : 'hover:bg-slate-50 border-l-transparent';

  const numStyles = isSelected 
    ? 'text-red-600' 
    : isHighlighted 
      ? 'text-sky-600' 
      : 'text-slate-400';

  const textStyles = isSelected 
    ? 'text-slate-900 font-medium' 
    : isHighlighted 
      ? 'text-slate-900 font-medium' 
      : 'text-slate-700';

  return (
    <div
      data-verse={verse.verse}
      onClick={() => onClick(verse.verse)}
      style={{ scrollMarginTop: '44px' }}
      className={`
        verse-item group cursor-pointer rounded-md transition-colors relative pl-1
        ${itemStyles}
      `}
    >
      <div className="flex gap-3 items-start px-2">
        <span className={`text-[11px] font-bold mt-1.5 w-6 shrink-0 text-center ${numStyles}`}>
          {verse.verse}
        </span>
        <div className="flex-1 min-w-0 pb-1">
          {verse.title && (
            <div className={`mb-1 font-extrabold text-[0.85em] tracking-tight ${isSelected || isHighlighted ? 'text-red-700' : 'text-red-700/60'}`}>
              &lt;{verse.title}&gt;
            </div>
          )}
          <p 
            className={`leading-relaxed whitespace-pre-wrap inline ${textStyles}`}
            style={{ fontSize: `${fontSize}px`, lineHeight: lineHeight }}
          >
            {verse.content}
          </p>
          
          {showAnnotations && (hasNote || hasCrossRef || hasSermon) && (
            <span className="inline-flex items-center gap-2 ml-2 align-middle relative -top-px">
              {hasNote && <MessageSquare onClick={(e) => {e.stopPropagation(); onIconClick(verse.verse, 'note', e)}} className="w-3.5 h-3.5 text-yellow-500 cursor-pointer hover:scale-125 transition-transform" title="주석 보기" />}
              {hasCrossRef && <Link2 onClick={(e) => {e.stopPropagation(); onIconClick(verse.verse, 'crossRef', e)}} className="w-3.5 h-3.5 text-blue-500 cursor-pointer hover:scale-125 transition-transform" title="관주 보기" />}
              {hasSermon && <FileEdit onClick={(e) => {e.stopPropagation(); onIconClick(verse.verse, 'sermon', e)}} className="w-3.5 h-3.5 text-indigo-500 cursor-pointer hover:scale-125 transition-transform" title="설교 메모 보기" />}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

export const BibleViewer = React.memo<BibleViewerProps>(({ 
  selectedVersions, currentBookId, currentChapter = 1, highlightVerse, fontSize = 16, lineHeight, isMainPane = true, headerRightNode, onCopyToSermon, onNavigateToDualView
}) => {
  const scrollContainerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [selectedVerses, setSelectedVerses] = useState<Set<number>>(new Set());
  
  const { copyMode, versions, showVersionInCopy, verseData, setVerseData, showAnnotations, setShowAnnotations } = useBible();

  const [popups, setPopups] = useState<PopupState[]>([]);
  const [topZIndex, setTopZIndex] = useState(() => {
    window.__topZIndex = window.__topZIndex || 10000;
    return window.__topZIndex;
  });

  const [fontSizes, setFontSizes] = useState(() => {
    try {
      const saved = localStorage.getItem('bible-app-editor-fonts');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { note: 15, crossRef: 15, sermon: 15 };
  });

  useEffect(() => {
    localStorage.setItem('bible-app-editor-fonts', JSON.stringify(fontSizes));
  }, [fontSizes]);

  const openSpecificPopup = React.useCallback((b: string, c: number, v: number, type: 'note' | 'crossRef' | 'sermon' | 'read', endVerse?: number) => {
    const id = `${b}_${c}_${v}_${endVerse ? endVerse + '_' : ''}${type}`;
    setPopups(prev => {
      if (prev.find(p => p.id === id)) {
        return prev.map(p => p.id === id ? { ...p, zIndex: (window.__topZIndex || 10000) + 1 } : p);
      }
      return [...prev, {
        id, bookId: b, chapter: c, verse: v, endVerse, panel: type,
        pos: { x: 0, y: 0 }, size: { width: Math.min(600, window.innerWidth * 0.9), height: 350 },
        zIndex: (window.__topZIndex || 10000) + 1
      }];
    });
    window.__topZIndex = (window.__topZIndex || 10000) + 1;
    setTopZIndex(window.__topZIndex);
  }, []);

  const handleIconClick = React.useCallback((v: number, type: 'note' | 'crossRef' | 'sermon' | 'read', e: React.MouseEvent) => {
    e.stopPropagation();
    openSpecificPopup(currentBookId, currentChapter, v, type);
  }, [currentBookId, currentChapter, openSpecificPopup]);

  const closePopup = React.useCallback((id: string) => setPopups(prev => prev.filter(p => p.id !== id)), []);
  
  const bringToFront = React.useCallback((id: string) => {
    setPopups(prev => prev.map(p => p.id === id ? { ...p, zIndex: (window.__topZIndex || 10000) + 1 } : p));
    window.__topZIndex = (window.__topZIndex || 10000) + 1;
    setTopZIndex(window.__topZIndex);
  }, [topZIndex]);
  
  const updatePopupPos = React.useCallback((id: string, dx: number, dy: number) => {
    setPopups(prev => prev.map(p => p.id === id ? { ...p, pos: { x: p.pos.x + dx, y: p.pos.y + dy } } : p));
  }, []);

  const updatePopupSize = React.useCallback((id: string, w: number, h: number) => {
    setPopups(prev => prev.map(p => p.id === id ? { ...p, size: { width: w, height: h } } : p));
  }, []);

  const handleFontSizeChange = React.useCallback((delta: number, panel: string) => {
    setFontSizes((prev: any) => {
      const current = prev[panel] || 15;
      const next = Math.max(10, Math.min(30, current + delta));
      return { ...prev, [panel]: next };
    });
  }, []);


  const displayData = useMemo(() => {
    return selectedVersions.map(version => {
      const filtered = version.verses.filter(v => 
        v.bookId === currentBookId && v.chapter === currentChapter
      );
      return {
        id: version.id,
        name: version.name,
        verses: filtered.sort((a, b) => a.verse - b.verse)
      };
    });
  }, [selectedVersions, currentBookId, currentChapter]);

  useEffect(() => {
    if (highlightVerse) {
      // Fire scroll twice: immediately, and after dual-view transition (approx 300ms)
      const doScroll = () => {
        scrollContainerRefs.current.forEach((container: HTMLDivElement | null) => {
          if (!container) return;
          const verseElement = container.querySelector(`[data-verse="${highlightVerse}"]`);
          if (verseElement) {
            verseElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      };
      
      const t1 = setTimeout(doScroll, 50);
      const t2 = setTimeout(doScroll, 400); // 400ms handles the sliding animation delay
      
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [highlightVerse, currentBookId, currentChapter, selectedVersions]);

  const toggleVerse = React.useCallback((verseNum: number) => {
    setSelectedVerses(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(verseNum)) {
        newSelected.delete(verseNum);
      } else {
        newSelected.add(verseNum);
      }
      return newSelected;
    });
  }, []);

  

  const handleAdvancedCopy = async () => {
    if (selectedVerses.size === 0) return;
    const sortedVerses = Array.from(selectedVerses).sort((a: number, b: number) => a - b);
    let fullText = "";

    let versionsToCopy: BibleVersion[] = [];
    if (copyMode === 'niv+krv') {
      const krv = versions.find(v => v.name.includes('개역개정'));
      const niv = versions.find(v => v.name.toLowerCase().includes('niv'));
      if (krv) versionsToCopy.push(krv);
      if (niv) versionsToCopy.push(niv);
      if (versionsToCopy.length === 0 && selectedVersions.length > 0) versionsToCopy = [selectedVersions[0]];
    } else {
      versionsToCopy = selectedVersions;
    }

    versionsToCopy.forEach((version) => {
      const targetVerses = version.verses.filter((v: Verse) => 
        selectedVerses.has(v.verse) && v.bookId === currentBookId && v.chapter === currentChapter
      ).sort((a: Verse, b: Verse) => a.verse - b.verse);

      if (targetVerses.length === 0) return;

      const bookName = targetVerses[0].bookName;
      const chapter = targetVerses[0].chapter;
      const versionLabel = showVersionInCopy ? `(${version.name})` : "";
      
      const minVerse = sortedVerses[0];
      const maxVerse = sortedVerses[sortedVerses.length - 1];

      if (selectedVerses.size === 1) {
        const v = targetVerses[0];
        const labelStr = versionLabel ? ` ${versionLabel}` : "";
        fullText += `[${bookName} ${chapter}:${v.verse}] ${v.content}${labelStr}\n`;
      } else {
        const range = minVerse === maxVerse ? `${minVerse}` : `${minVerse}-${maxVerse}`;
        const labelStr = versionLabel ? ` ${versionLabel}` : "";
        fullText += `[${bookName} ${chapter}:${range}]${labelStr}\n`;
        targetVerses.forEach((v: Verse) => {
          fullText += `${v.verse}. ${v.content}\n`;
        });
        fullText += "\n";
      }
    });

    try {
      await navigator.clipboard.writeText(fullText.trim());
      setSelectedVerses(new Set());
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const handleCopy = async () => {
    if (selectedVerses.size === 0) return;
    let fullText = "";
    const sortedVerses = Array.from(selectedVerses).sort((a,b)=>a-b);
    const minVerse = sortedVerses[0];
    const maxVerse = sortedVerses[sortedVerses.length - 1];

    const version = selectedVersions[0];
    if (!version) return;

    const targetVerses = version.verses.filter((v: Verse) => 
      selectedVerses.has(v.verse) && v.bookId === currentBookId && v.chapter === currentChapter
    ).sort((a: Verse, b: Verse) => a.verse - b.verse);

    if (targetVerses.length > 0) {
      const bookName = targetVerses[0].bookName;
      const chapter = targetVerses[0].chapter;
      
      if (selectedVerses.size === 1) {
        fullText = `[${bookName} ${chapter}:${minVerse}] ${targetVerses[0].content}`;
      } else {
        const range = minVerse === maxVerse ? `${minVerse}` : `${minVerse}-${maxVerse}`;
        fullText += `[${bookName} ${chapter}:${range}]\n`;
        targetVerses.forEach((v: Verse) => {
          fullText += `${v.verse}. ${v.content}\n`;
        });
      }
    }

    try {
      await navigator.clipboard.writeText(fullText.trim());
      setSelectedVerses(new Set());
    } catch (err) {}
  };

  const isSyncingRef = useRef(false);
  const lastScrolledIndexRef = useRef<number | null>(null);

  const handleScroll = (idx: number, e: React.UIEvent<HTMLDivElement>) => {
    if (isSyncingRef.current) return;
    const source = e.currentTarget;
    lastScrolledIndexRef.current = idx;
    isSyncingRef.current = true;
    const containerTop = source.scrollTop;
    const verseElements = Array.from(source.querySelectorAll('.verse-item')) as HTMLDivElement[];
    
    let targetVerseNum: string | null = null;
    let offsetFromTop = 0;
    let sourceEl: HTMLDivElement | null = null;

    for (const el of verseElements) {
      if (el.offsetTop + el.offsetHeight > containerTop) {
        targetVerseNum = el.getAttribute('data-verse');
        sourceEl = el;
        offsetFromTop = el.offsetTop - containerTop;
        break;
      }
    }

    if (targetVerseNum && sourceEl) {
      scrollContainerRefs.current.forEach((target, j) => {
        if (!target || j === idx) return;
        const targetEl = target.querySelector(`[data-verse="${targetVerseNum}"]`) as HTMLDivElement;
        if (targetEl) {
          target.scrollTop = targetEl.offsetTop - offsetFromTop;
        }
      });
    }

    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  };

  if (selectedVersions.length === 0) return null;

  return (
    <div className="h-full flex overflow-hidden bg-white relative">
      {displayData.map((data, idx: number) => (
        <div 
          key={data.id} 
          className="flex-1 flex flex-col border-r border-slate-200 last:border-r-0 relative bg-white"
        >
          {/* Version Header */}
          <div className="h-10 flex items-center px-4 bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
            <span className="text-[10px] font-bold text-red-600 tracking-widest uppercase mr-2 bg-red-50 px-1.5 py-0.5 rounded">VER</span>
            {headerRightNode ? (
              headerRightNode
            ) : (
              <span className="text-xs font-bold text-slate-700 truncate">{data.name}</span>
            )}
          </div>
  
          <div 
            ref={el => { scrollContainerRefs.current[idx] = el; }}
            onScroll={(e) => handleScroll(idx, e)}
            className="flex-1 overflow-y-auto custom-scrollbar px-4 py-2 space-y-px pb-32"
          >
            {data.verses.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-300 text-xs italic">
                해당 장의 본문이 없습니다.
              </div>
            ) : (
              data.verses.map((v: Verse) => (
                <VerseItem
                  key={`${v.bookId}-${v.chapter}-${v.verse}`}
                  verse={v}
                  isSelected={selectedVerses.has(v.verse)}
                  isHighlighted={v.verse === highlightVerse}
                  hasNote={!!verseData[`${currentBookId}_${currentChapter}_${v.verse}`]?.note}
                  hasCrossRef={!!verseData[`${currentBookId}_${currentChapter}_${v.verse}`]?.crossRef}
                  hasSermon={!!verseData[`${currentBookId}_${currentChapter}_${v.verse}`]?.sermon}
                  showAnnotations={showAnnotations}
                  fontSize={fontSize}
                  lineHeight={lineHeight}
                  onClick={toggleVerse}
                  onIconClick={handleIconClick}
                />
              ))
            )}
          </div>
        </div>
      ))}

      {/* Floating Action Button via Portal */}
      {createPortal(
        <AnimatePresence>
          {selectedVerses.size > 0 && (
            <motion.div 
              initial={{ y: 50, opacity: 0, x: "-50%" }}
              animate={{ y: 0, opacity: 1, x: "-50%" }}
              exit={{ y: 50, opacity: 0, x: "-50%" }}
              className="fixed bottom-6 left-1/2 bg-slate-900 shadow-2xl rounded-2xl px-2 py-1.5 flex items-center gap-1 z-[999999] border border-slate-700/50 backdrop-blur-md overflow-x-auto max-w-[95vw] custom-scrollbar"
            >
            <div className="flex items-center gap-2 px-3 shrink-0">
              <span className="text-white font-black text-sm tracking-tight">{selectedVerses.size}절</span>
            </div>
            
            <div className="w-px h-4 bg-slate-700 mx-1 shrink-0"></div>
            
            <div className="flex items-center gap-1">
              <button 
                onClick={() => copyMode === 'default' ? handleCopy() : handleAdvancedCopy()}
                className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-800 rounded-lg transition-colors text-sm font-semibold whitespace-nowrap shrink-0 text-white"
              >
                <Copy className="w-4 h-4 text-slate-300" /> 복사
              </button>
            </div>
            
            {selectedVerses.size === 1 && (
              <>
                <div className="w-px h-4 bg-slate-700 mx-1 shrink-0"></div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={(e) => {
                      const firstVerse = Array.from(selectedVerses).sort((a,b)=>a-b)[0];
                      handleIconClick(firstVerse, 'note', e);
                      setShowAnnotations(true);
                      setSelectedVerses(new Set());
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-800 rounded-lg transition-colors text-sm font-semibold text-yellow-400 whitespace-nowrap shrink-0"
                  >
                    <MessageSquare className="w-4 h-4" /> 주석
                  </button>
                  <button 
                    onClick={(e) => {
                      const firstVerse = Array.from(selectedVerses).sort((a,b)=>a-b)[0];
                      handleIconClick(firstVerse, 'crossRef', e);
                      setShowAnnotations(true);
                      setSelectedVerses(new Set());
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-800 rounded-lg transition-colors text-sm font-semibold text-blue-400 whitespace-nowrap shrink-0"
                  >
                    <Link2 className="w-4 h-4" /> 관주
                  </button>
                  <button 
                    onClick={(e) => {
                      const firstVerse = Array.from(selectedVerses).sort((a,b)=>a-b)[0];
                      handleIconClick(firstVerse, 'sermon', e);
                      setShowAnnotations(true);
                      setSelectedVerses(new Set());
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-800 rounded-lg transition-colors text-sm font-semibold text-indigo-400 whitespace-nowrap shrink-0"
                  >
                    <FileEdit className="w-4 h-4" /> 노트
                  </button>
                </div>
              </>
            )}
            
            <div className="w-px h-4 bg-slate-700 mx-1 shrink-0"></div>
            
            <div className="flex items-center gap-1">
              {onCopyToSermon && (
                <button 
                  onClick={() => {
                    const sortedVerses = Array.from(selectedVerses).sort((a,b)=>a-b);
                    const bookName = BIBLE_LIST.find(b => b.id === currentBookId)?.name || currentBookId;
                    const texts = sortedVerses.map(v => {
                      const verseObj = displayData[0]?.verses.find(x => x.verse === v);
                      return `${bookName} ${currentChapter}:${v} ${verseObj?.content || ''}`;
                    });
                    onCopyToSermon(texts.join('\n'));
                    setSelectedVerses(new Set());
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-800 rounded-lg transition-colors text-sm font-semibold text-emerald-400 whitespace-nowrap shrink-0"
                >
                  <FileEdit className="w-4 h-4" /> 설교로 복사
                </button>
              )}

              <button 
                onClick={() => setSelectedVerses(new Set())}
                className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors shrink-0"
                title="선택 해제"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
      )}

      {/* Portal for Popups */}
      {createPortal(
        <AnimatePresence>
          {popups.map(p => (
            <BiblePopup 
              key={p.id}
              popup={p}
              onClose={closePopup}
              onBringToFront={bringToFront}
              onUpdatePos={updatePopupPos}
              onUpdateSize={updatePopupSize}
              verseData={verseData}
              setVerseData={setVerseData}
              fontSizes={fontSizes}
              handleFontSizeChange={handleFontSizeChange}
              onSendToSermon={onCopyToSermon}
              onOpenPopup={openSpecificPopup}
              onNavigateToDualView={onNavigateToDualView}
            />
          ))}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
});
