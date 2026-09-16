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
  verseSpacing?: number;
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
  verseSpacing?: number;
  onClick: (v: number) => void;
  onIconClick: (v: number, type: 'note' | 'crossRef' | 'sermon', e: React.MouseEvent) => void;
}>(({ verse, isSelected, isHighlighted, hasNote, hasCrossRef, hasSermon, showAnnotations, fontSize, lineHeight, verseSpacing = 6, onClick, onIconClick }) => {
  const itemStyles = isSelected 
    ? 'bg-[#FAF0EB] border-l-[#C96442] shadow-xs' 
    : isHighlighted 
      ? 'bg-[#FEF9EE] border-l-[#D97706]' 
      : 'hover:bg-[#F5F3ED]/70 border-l-transparent';

  const numStyles = isSelected 
    ? 'text-[#C96442] font-bold' 
    : isHighlighted 
      ? 'text-[#D97706] font-bold' 
      : 'text-[#A3A19B] group-hover:text-[#6A6864]';

  const textStyles = isSelected 
    ? 'text-[#1F1E1D] font-medium' 
    : isHighlighted 
      ? 'text-[#1F1E1D] font-medium' 
      : 'text-[#2C2B29]';

  return (
    <div
      data-verse={verse.verse}
      onClick={() => onClick(verse.verse)}
      style={{ scrollMarginTop: '44px', marginBottom: `${verseSpacing}px` }}
      className={`
        verse-item group cursor-pointer rounded-xl transition-all relative border-l-[3px]
        ${itemStyles}
      `}
    >
      {/* 제목이 있을 경우: 구절 번호보다 위에 단독 헤더로 표시 */}
      {verse.title && (
        <div className={`pt-2.5 pb-1.5 font-bold text-[0.92em] tracking-tight flex items-center gap-1.5 pl-8 ${isSelected || isHighlighted ? 'text-[#C96442]' : 'text-[#C96442]/90'}`}>
          <span className="w-1.5 h-3.5 bg-[#C96442] rounded-full inline-block shrink-0"></span>
          <span>{verse.title}</span>
        </div>
      )}

      {/* 구절 번호 및 본문: 제목 아래에 나란히 배치 */}
      <div className="flex gap-2.5 items-start px-1.5 py-0.5">
        <span 
          style={{ 
            lineHeight: lineHeight, 
            fontSize: `${Math.max(11, Math.round(fontSize * 0.68))}px` 
          }}
          className={`font-semibold w-5 shrink-0 text-right select-none transition-colors ${numStyles}`}
        >
          {verse.verse}
        </span>
        <div className="flex-1 min-w-0">
          <p 
            className={`font-serif tracking-normal whitespace-pre-wrap inline ${textStyles}`}
            style={{ fontSize: `${fontSize}px`, lineHeight: lineHeight }}
          >
            {verse.content}
          </p>
          
          {showAnnotations && (hasNote || hasCrossRef || hasSermon) && (
            <span className="inline-flex items-center gap-1.5 ml-2 align-middle relative -top-px">
              {hasNote && (
                <button 
                  onClick={(e) => {e.stopPropagation(); onIconClick(verse.verse, 'note', e)}} 
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#FEF3C7] text-[#78350F] hover:scale-125 transition-transform" 
                  title="주석 보기"
                >
                  <MessageSquare className="w-2.5 h-2.5 stroke-[2px]" />
                </button>
              )}
              {hasCrossRef && (
                <button 
                  onClick={(e) => {e.stopPropagation(); onIconClick(verse.verse, 'crossRef', e)}} 
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#E0F2FE] text-[#0369A1] hover:scale-125 transition-transform" 
                  title="관주 보기"
                >
                  <Link2 className="w-2.5 h-2.5 stroke-[2px]" />
                </button>
              )}
              {hasSermon && (
                <button 
                  onClick={(e) => {e.stopPropagation(); onIconClick(verse.verse, 'sermon', e)}} 
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#FAF0EB] text-[#C96442] hover:scale-125 transition-transform" 
                  title="설교 메모 보기"
                >
                  <FileEdit className="w-2.5 h-2.5 stroke-[2px]" />
                </button>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

export const BibleViewer = React.memo<BibleViewerProps>(({ 
  selectedVersions, currentBookId, currentChapter = 1, highlightVerse, fontSize = 16, lineHeight, verseSpacing = 3, isMainPane = true, headerRightNode, onCopyToSermon, onNavigateToDualView
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

  const currentBookName = BIBLE_LIST.find(b => b.id === currentBookId)?.name || currentBookId;

  return (
    <div className="h-full flex overflow-hidden bg-[#FAF9F5] relative">
      {displayData.map((data, idx: number) => (
        <div 
          key={data.id} 
          className="flex-1 flex flex-col border-r border-[#E7E5DF] last:border-r-0 relative bg-[#FAF9F5]"
        >
          {/* Version Header */}
          <div className="h-9 flex items-center px-4 bg-[#F5F3ED] border-b border-[#E7E5DF] sticky top-0 z-10">
            <span className="text-[10px] font-bold text-[#C96442] tracking-wider uppercase mr-2 bg-[#FAF0EB] px-1.5 py-0.5 rounded-md">VER</span>
            {headerRightNode ? (
              headerRightNode
            ) : (
              <span className="text-xs font-semibold text-[#6A6864] truncate">{data.name}</span>
            )}
          </div>
  
          <div 
            ref={el => { scrollContainerRefs.current[idx] = el; }}
            onScroll={(e) => handleScroll(idx, e)}
            className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-6 py-4 space-y-0.5 pb-32"
          >
            {data.verses.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[#A3A19B] text-xs italic">
                해당 장의 본문이 없습니다.
              </div>
            ) : (
              <>
                {/* Claude Chapter Hero Banner */}
                {idx === 0 && (
                  <div className="py-5 px-4 mb-4 rounded-2xl bg-gradient-to-b from-[#F5F3ED]/80 to-transparent border border-[#E7E5DF]/70 text-center flex flex-col items-center shadow-xs">
                    <span className="text-[10px] font-bold text-[#C96442] tracking-widest uppercase bg-[#FAF0EB] px-2.5 py-0.5 rounded-full mb-1.5">
                      {currentBookName}
                    </span>
                    <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#2C2B29] tracking-tight">
                      {currentBookName} {currentChapter}장
                    </h2>
                    <div className="flex items-center gap-2.5 mt-2 text-xs text-[#A3A19B]">
                      <span>총 {data.verses.length}개 절</span>
                      <span>•</span>
                      <span>완독 약 {Math.max(1, Math.round(data.verses.length * 0.15))}분</span>
                    </div>
                  </div>
                )}

                {data.verses.map((v: Verse) => (
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
                    verseSpacing={verseSpacing}
                    onClick={toggleVerse}
                    onIconClick={handleIconClick}
                  />
                ))}
              </>
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
              className="fixed bottom-6 left-1/2 bg-[#2C2B29]/95 text-white shadow-2xl rounded-2xl px-3 py-1.5 flex items-center gap-1.5 z-[999999] border border-[#E7E5DF]/20 backdrop-blur-md overflow-x-auto max-w-[95vw] custom-scrollbar"
            >
              <div className="flex items-center gap-1.5 px-2.5 shrink-0">
                <span className="text-[#FAF0EB] font-bold text-xs tracking-tight">{selectedVerses.size}개 구절</span>
              </div>
              
              <div className="w-px h-4 bg-[#4A4844] mx-0.5 shrink-0"></div>
              
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => copyMode === 'default' ? handleCopy() : handleAdvancedCopy()}
                  className="flex items-center gap-1 px-3 py-1.5 hover:bg-[#3D3B38] rounded-xl transition-colors text-xs font-semibold whitespace-nowrap shrink-0 text-white"
                >
                  <Copy className="w-3.5 h-3.5 stroke-[1.5px] text-[#A3A19B]" /> 복사
                </button>
              </div>
              
              {selectedVerses.size === 1 && (
                <>
                  <div className="w-px h-4 bg-[#4A4844] mx-0.5 shrink-0"></div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={(e) => {
                        const firstVerse = Array.from(selectedVerses).sort((a,b)=>a-b)[0];
                        handleIconClick(firstVerse, 'note', e);
                        setShowAnnotations(true);
                        setSelectedVerses(new Set());
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-[#3D3B38] rounded-xl transition-colors text-xs font-semibold text-[#FBBF24] whitespace-nowrap shrink-0"
                    >
                      <MessageSquare className="w-3.5 h-3.5 stroke-[1.5px]" /> 주석
                    </button>
                    <button 
                      onClick={(e) => {
                        const firstVerse = Array.from(selectedVerses).sort((a,b)=>a-b)[0];
                        handleIconClick(firstVerse, 'crossRef', e);
                        setShowAnnotations(true);
                        setSelectedVerses(new Set());
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-[#3D3B38] rounded-xl transition-colors text-xs font-semibold text-[#38BDF8] whitespace-nowrap shrink-0"
                    >
                      <Link2 className="w-3.5 h-3.5 stroke-[1.5px]" /> 관주
                    </button>
                    <button 
                      onClick={(e) => {
                        const firstVerse = Array.from(selectedVerses).sort((a,b)=>a-b)[0];
                        handleIconClick(firstVerse, 'sermon', e);
                        setShowAnnotations(true);
                        setSelectedVerses(new Set());
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-[#3D3B38] rounded-xl transition-colors text-xs font-semibold text-[#FB923C] whitespace-nowrap shrink-0"
                    >
                      <FileEdit className="w-3.5 h-3.5 stroke-[1.5px]" /> 노트
                    </button>
                  </div>
                </>
              )}
              
              <div className="w-px h-4 bg-[#4A4844] mx-0.5 shrink-0"></div>
              
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
                    className="flex items-center gap-1 px-3 py-1.5 hover:bg-[#3D3B38] rounded-xl transition-colors text-xs font-semibold text-[#34D399] whitespace-nowrap shrink-0"
                  >
                    <FileEdit className="w-3.5 h-3.5 stroke-[1.5px]" /> 설교로 복사
                  </button>
                )}

                <button 
                  onClick={() => setSelectedVerses(new Set())}
                  className="p-1.5 hover:bg-[#3D3B38] rounded-xl transition-colors shrink-0 text-[#A3A19B] hover:text-white"
                  title="선택 해제"
                >
                  <X className="w-3.5 h-3.5 stroke-[1.5px]" />
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
