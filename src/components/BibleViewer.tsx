import React, { useMemo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BibleVersion, Verse } from '../types/bible';
import { useBible } from '../stores/BibleContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, X, BookOpen, Link2, MessageSquare, FileEdit, Sparkles, Eye, EyeOff, Trash2, Send, Type, Plus, Minus } from 'lucide-react';
import { BIBLE_LIST } from '../constants/bibleMeta';
import { BiblePopup } from './BiblePopup';
import type { PopupState } from './BiblePopup';

export type AnnotationFilterType = 'commentary' | 'crossRef' | 'note' | 'sermon' | 'ai';

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
  onVerseSelect?: (verse: number, text: string) => void;
  onOpenAiCommentary?: (verse: number, text: string) => void;
  onOpenSermonNote?: (sermonId: string) => void;
  topNavNode?: React.ReactNode;
  isMobileScroll?: boolean;
}

const VerseItem = React.memo<{
  verse: Verse;
  isSelected: boolean;
  isHighlighted: boolean;
  hasCommentary: boolean;
  hasCrossRef: boolean;
  hasNote: boolean;
  hasSermon: boolean;
  sermonInfo?: { id: string; title: string };
  hasAi: boolean;
  showAnnotations: boolean;
  activeFilters: Set<AnnotationFilterType>;
  fontSize: number;
  lineHeight: number;
  verseSpacing?: number;
  onClick: (v: number) => void;
  onIconClick: (v: number, type: 'note' | 'crossRef' | 'sermon' | 'read', e: React.MouseEvent) => void;
  onSermonIconClick?: (sermonId: string, e: React.MouseEvent) => void;
  onAiClick?: (v: number, text: string, e: React.MouseEvent) => void;
}>(({ 
  verse, 
  isSelected, 
  isHighlighted, 
  hasCommentary, 
  hasCrossRef, 
  hasNote, 
  hasSermon, 
  sermonInfo,
  hasAi, 
  showAnnotations, 
  activeFilters, 
  fontSize, 
  lineHeight, 
  verseSpacing = 6, 
  onClick, 
  onIconClick,
  onSermonIconClick,
  onAiClick
}) => {
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

  // 각 아이콘 표시 조건: 주석 보기가 활성화되어 있고, 해당 필터가 켜져 있으며, 데이터가 존재할 때
  const safeFilters = activeFilters || new Set<AnnotationFilterType>(['commentary', 'crossRef', 'note', 'sermon', 'ai']);
  const showCommentaryIcon = showAnnotations && safeFilters.has('commentary') && hasCommentary;
  const showCrossRefIcon = showAnnotations && safeFilters.has('crossRef') && hasCrossRef;
  const showNoteIcon = showAnnotations && safeFilters.has('note') && hasNote;
  const showSermonIcon = showAnnotations && safeFilters.has('sermon') && hasSermon;
  const showAiIcon = showAnnotations && safeFilters.has('ai') && hasAi;

  const hasAnyVisibleIcon = showCommentaryIcon || showCrossRefIcon || showNoteIcon || showSermonIcon || showAiIcon;

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
        <div className={`pt-2 pb-1 font-bold text-[0.92em] tracking-tight flex items-center gap-1.5 pl-6 sm:pl-8 ${isSelected || isHighlighted ? 'text-[#C96442]' : 'text-[#C96442]/90'}`}>
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
          
          {hasAnyVisibleIcon && (
            <span className="inline-flex items-center gap-1.5 ml-2 align-middle relative -top-px">
              {showCommentaryIcon && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onIconClick(verse.verse, 'note', e); }} 
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#FEF3C7] text-[#78350F] hover:scale-125 transition-transform" 
                  title="주석 보기"
                >
                  <BookOpen className="w-2.5 h-2.5 stroke-[2px]" />
                </button>
              )}
              {showCrossRefIcon && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onIconClick(verse.verse, 'crossRef', e); }} 
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#E0F2FE] text-[#0369A1] hover:scale-125 transition-transform" 
                  title="관주 보기"
                >
                  <Link2 className="w-2.5 h-2.5 stroke-[2px]" />
                </button>
              )}
              {showNoteIcon && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onIconClick(verse.verse, 'note', e); }} 
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#FEF3C7] text-[#78350F] hover:scale-125 transition-transform" 
                  title="노트 보기"
                >
                  <MessageSquare className="w-2.5 h-2.5 stroke-[2px]" />
                </button>
              )}
              {showSermonIcon && (
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (onSermonIconClick && sermonInfo?.id) {
                      onSermonIconClick(sermonInfo.id, e);
                    } else {
                      onIconClick(verse.verse, 'sermon', e);
                    }
                  }} 
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#FAF0EB] text-[#C96442] hover:scale-125 transition-transform" 
                  title={sermonInfo?.title ? `설교노트 열기: ${sermonInfo.title}` : "설교노트 열기"}
                >
                  <FileEdit className="w-2.5 h-2.5 stroke-[2px]" />
                </button>
              )}
              {showAiIcon && (
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (onAiClick) {
                      onAiClick(verse.verse, verse.content, e);
                    }
                  }} 
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#FAF0EB] text-[#C96442] hover:scale-125 transition-transform" 
                  title="AI 주석 보기"
                >
                  <Sparkles className="w-2.5 h-2.5 stroke-[2px]" />
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
  selectedVersions, currentBookId, currentChapter = 1, highlightVerse, fontSize = 16, lineHeight, verseSpacing = 3, isMainPane = true, headerRightNode, onCopyToSermon, onNavigateToDualView, onVerseSelect, onOpenAiCommentary, onOpenSermonNote, topNavNode, isMobileScroll
}) => {
  const scrollContainerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [selectedVerses, setSelectedVerses] = useState<Set<number>>(new Set());
  
  const { 
    copyMode, 
    versions, 
    showVersionInCopy, 
    copyMultiOption, 
    mainKrVersionId, 
    mainEnVersionId, 
    verseData, 
    setVerseData, 
    flushVerseData,
    showAnnotations, 
    setShowAnnotations,
    annotationFilters,
    toggleAnnotationFilter,
    sermonVerseMap,
    savedAiVerseKeys
  } = useBible();

  const [popups, setPopups] = useState<PopupState[]>([]);
  const [topZIndex, setTopZIndex] = useState(() => {
    window.__topZIndex = window.__topZIndex || 10000;
    return window.__topZIndex;
  });

  const handleCopy = async () => {
    if (selectedVerses.size === 0) return;
    const sortedVerses = Array.from(selectedVerses).sort((a: number, b: number) => a - b);
    let fullText = "";

    // 1. 복사할 대상 번역본 목록 결정 (사용자의 복사설정 적용)
    let versionsToCopy: BibleVersion[] = [];

    const krVersion = versions.find(v => v.id === mainKrVersionId) 
      || versions.find(v => /[가-힣]/.test(v.name) || !/[a-zA-Z]/.test(v.name)) 
      || selectedVersions[0];

    const enVersion = versions.find(v => v.id === mainEnVersionId) 
      || versions.find(v => /[a-zA-Z]/.test(v.name)) 
      || versions.find(v => v.id.toLowerCase().includes('eng') || v.name.toLowerCase().includes('niv'));

    if (copyMultiOption === 'kr') {
      if (krVersion) versionsToCopy = [krVersion];
    } else if (copyMultiOption === 'en') {
      if (enVersion) versionsToCopy = [enVersion];
    } else if (copyMultiOption === 'kr+en') {
      if (krVersion) versionsToCopy.push(krVersion);
      if (enVersion && enVersion.id !== krVersion?.id) versionsToCopy.push(enVersion);
    } else if (copyMultiOption === 'all') {
      versionsToCopy = selectedVersions.length > 0 ? selectedVersions : versions;
    }

    // fallback: 지정된 게 없으면 현재 선택된 번역본 사용
    if (versionsToCopy.length === 0) {
      versionsToCopy = selectedVersions.length > 0 ? [selectedVersions[0]] : (versions.length > 0 ? [versions[0]] : []);
    }

    // 2. 결정된 각 번역본에 대해 텍스트 조합
    versionsToCopy.forEach((version) => {
      const targetVerses = version.verses.filter((v: Verse) => 
        selectedVerses.has(v.verse) && v.bookId === currentBookId && v.chapter === currentChapter
      ).sort((a: Verse, b: Verse) => a.verse - b.verse);

      if (targetVerses.length === 0) return;

      const bookName = targetVerses[0].bookName;
      const chapter = targetVerses[0].chapter;
      const versionLabel = showVersionInCopy ? ` (${version.name})` : "";
      
      const minVerse = sortedVerses[0];
      const maxVerse = sortedVerses[sortedVerses.length - 1];

      if (selectedVerses.size === 1) {
        const v = targetVerses[0];
        fullText += `[${bookName} ${chapter}:${v.verse}] ${v.content}${versionLabel}\n`;
      } else {
        const range = minVerse === maxVerse ? `${minVerse}` : `${minVerse}-${maxVerse}`;
        fullText += `[${bookName} ${chapter}:${range}]${versionLabel}\n`;
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

  const handleSermonIconClick = React.useCallback((sermonId: string) => {
    if (onOpenSermonNote) {
      onOpenSermonNote(sermonId);
    }
  }, [onOpenSermonNote]);

  const handleAiClick = React.useCallback((verseNum: number, text: string) => {
    if (onOpenAiCommentary) {
      onOpenAiCommentary(verseNum, text);
    }
  }, [onOpenAiCommentary]);

  const closePopup = React.useCallback((id: string) => {
    flushVerseData();
    setPopups(prev => prev.filter(p => p.id !== id));
  }, [flushVerseData]);
  
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


  const isSyncingRef = useRef(false);
  const lastScrolledIndexRef = useRef<number | null>(null);
  const lastScrolledKeyRef = useRef<string | null>(null);

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
    const currentNavKey = `${currentBookId}_${currentChapter}_${highlightVerse || ''}`;
    
    // 이미 해당 장/구절로 스크롤을 완료한 경우, 다른 구절 클릭이나 컴포넌트 재렌더링 시 재스크롤 방지
    if (lastScrolledKeyRef.current === currentNavKey) {
      return;
    }

    if (highlightVerse) {
      let isUnlockedTimeout: any = null;

      const doScroll = () => {
        // 자동 스크롤 중에는 사용자의 scroll 이벤트 동기화 처리가 간섭하지 않도록 잠금
        isSyncingRef.current = true;

        scrollContainerRefs.current.forEach((container: HTMLDivElement | null) => {
          if (!container) return;
          const verseElement = container.querySelector(`[data-verse="${highlightVerse}"]`) as HTMLElement;
          if (verseElement) {
            if (isMobileScroll) {
              verseElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
              const targetTop = Math.max(0, verseElement.offsetTop - 50);
              container.scrollTo({ top: targetTop, behavior: 'smooth' });
            }
          }
        });

        lastScrolledKeyRef.current = currentNavKey;

        if (isUnlockedTimeout) clearTimeout(isUnlockedTimeout);
        isUnlockedTimeout = setTimeout(() => {
          isSyncingRef.current = false;
        }, 500);
      };
      
      const t1 = setTimeout(doScroll, 50);
      const t2 = setTimeout(doScroll, 200);
      const t3 = setTimeout(doScroll, 450); // 레이아웃 전환 및 폰트 렌더링 딜레이 보정
      
      return () => { 
        clearTimeout(t1); 
        clearTimeout(t2); 
        clearTimeout(t3); 
        if (isUnlockedTimeout) clearTimeout(isUnlockedTimeout);
        isSyncingRef.current = false;
      };
    } else {
      lastScrolledKeyRef.current = currentNavKey;
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

    if (onVerseSelect) {
      const verseObj = displayData[0]?.verses?.find(v => v.verse === verseNum);
      const text = verseObj?.text || (verseObj as any)?.content || '';
      onVerseSelect(verseNum, text);
    }
  }, [displayData, onVerseSelect]);

  



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
    <div className={`w-full bg-[#FAF9F5] relative ${isMobileScroll ? 'flex' : 'h-full flex overflow-hidden'}`}>
      {displayData.map((data, idx: number) => (
        <div 
          key={data.id} 
          className="flex-1 min-w-0 flex flex-col border-r border-[#E7E5DF] last:border-r-0 relative bg-[#FAF9F5]"
        >
          {/* Version Header (모든 번역본에 헤더가 정상 표시됨) */}
          <div className={`h-9 flex items-center justify-between px-3 sm:px-4 bg-[#F5F3ED] border-b border-[#E7E5DF] shrink-0 ${isMobileScroll ? 'relative' : 'sticky top-0 z-10'}`}>
            <div className="flex items-center min-w-0 mr-2">
              <span className="text-[10px] font-bold text-[#C96442] tracking-wider uppercase mr-2 bg-[#FAF0EB] px-1.5 py-0.5 rounded-md shrink-0">VER</span>
              {headerRightNode ? (
                headerRightNode
              ) : (
                <span className="text-xs font-semibold text-[#6A6864] truncate">{data.name}</span>
              )}
            </div>

            {/* 어노테이션 툴바: 주석, 관주, 노트, 설교노트, AI, 주석숨기기 */}
            {/* 본문 듀얼뷰(우측 참고번역)에는 상단 아이콘들을 표시하지 않고, 좌측 메인 페이지(isMainPane)에만 표시 */}
            {isMainPane && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleAnnotationFilter('commentary')}
                  className={`p-1 rounded-md transition-all ${
                    showAnnotations && annotationFilters.has('commentary')
                      ? 'text-black opacity-100 scale-105'
                      : 'text-black/35 hover:text-black/70'
                  }`}
                  title="주석 필터 (클릭 시 주석만 보기 / 복수 선택 가능)"
                >
                  <BookOpen className="w-3.5 h-3.5 stroke-[1.8px]" />
                </button>

                <button
                  type="button"
                  onClick={() => toggleAnnotationFilter('crossRef')}
                  className={`p-1 rounded-md transition-all ${
                    showAnnotations && annotationFilters.has('crossRef')
                      ? 'text-black opacity-100 scale-105'
                      : 'text-black/35 hover:text-black/70'
                  }`}
                  title="관주 필터 (클릭 시 관주만 보기 / 복수 선택 가능)"
                >
                  <Link2 className="w-3.5 h-3.5 stroke-[1.8px]" />
                </button>

                <button
                  type="button"
                  onClick={() => toggleAnnotationFilter('note')}
                  className={`p-1 rounded-md transition-all ${
                    showAnnotations && annotationFilters.has('note')
                      ? 'text-black opacity-100 scale-105'
                      : 'text-black/35 hover:text-black/70'
                  }`}
                  title="노트 필터 (클릭 시 노트만 보기 / 복수 선택 가능)"
                >
                  <MessageSquare className="w-3.5 h-3.5 stroke-[1.8px]" />
                </button>

                <button
                  type="button"
                  onClick={() => toggleAnnotationFilter('sermon')}
                  className={`p-1 rounded-md transition-all ${
                    showAnnotations && annotationFilters.has('sermon')
                      ? 'text-black opacity-100 scale-105'
                      : 'text-black/35 hover:text-black/70'
                  }`}
                  title="설교노트 필터 (클릭 시 설교노트만 보기 / 복수 선택 가능)"
                >
                  <FileEdit className="w-3.5 h-3.5 stroke-[1.8px]" />
                </button>

                <button
                  type="button"
                  onClick={() => toggleAnnotationFilter('ai')}
                  className={`p-1 rounded-md transition-all ${
                    showAnnotations && annotationFilters.has('ai')
                      ? 'text-black opacity-100 scale-105'
                      : 'text-black/35 hover:text-black/70'
                  }`}
                  title="AI 주석 필터 (클릭 시 AI 주석만 보기 / 복수 선택 가능)"
                >
                  <Sparkles className="w-3.5 h-3.5 stroke-[1.8px]" />
                </button>

                <div className="w-px h-3 bg-black/15 mx-0.5" />

                <button
                  type="button"
                  onClick={() => setShowAnnotations(!showAnnotations)}
                  className={`p-1 rounded-md transition-all ${
                    showAnnotations
                      ? 'text-black opacity-100'
                      : 'text-black/35 hover:text-black/70'
                  }`}
                  title={showAnnotations ? "주석 숨기기" : "주석 보이기"}
                >
                  {showAnnotations ? (
                    <Eye className="w-3.5 h-3.5 stroke-[1.8px]" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 stroke-[1.8px]" />
                  )}
                </button>
              </div>
            )}
          </div>
  
          <div 
            ref={el => { scrollContainerRefs.current[idx] = el; }}
            onScroll={isMobileScroll ? undefined : (e) => handleScroll(idx, e)}
            className={`px-2.5 sm:px-6 py-2.5 sm:py-4 space-y-0.5 pb-32 ${isMobileScroll ? '' : 'flex-1 overflow-y-auto custom-scrollbar'}`}
          >
            {data.verses.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[#A3A19B] text-xs italic">
                해당 장의 본문이 없습니다.
              </div>
            ) : (
              <>
                {/* Claude Chapter Hero Banner */}
                {idx === 0 && (
                  <div className="py-3 sm:py-5 px-3 sm:px-4 mb-3 sm:mb-4 rounded-2xl bg-gradient-to-b from-[#F5F3ED]/80 to-transparent border border-[#E7E5DF]/70 text-center flex flex-col items-center shadow-xs">
                    <span className="text-[10px] font-bold text-[#C96442] tracking-widest uppercase bg-[#FAF0EB] px-2.5 py-0.5 rounded-full mb-1">
                      {currentBookName}
                    </span>
                    <h2 className="font-serif text-xl sm:text-3xl font-bold text-[#2C2B29] tracking-tight">
                      {currentBookName} {currentChapter}장
                    </h2>
                  </div>
                )}

                {data.verses.map((v: Verse) => {
                  const bId = currentBookId || v.bookId;
                  const key = `${bId}_${currentChapter}_${v.verse}`;
                  const altKey = v.bookId && v.bookId !== bId ? `${v.bookId}_${currentChapter}_${v.verse}` : '';

                  const hasNoteData = !!verseData[key]?.note || (altKey ? !!verseData[altKey]?.note : false);
                  const hasCrossRefData = !!verseData[key]?.crossRef || (altKey ? !!verseData[altKey]?.crossRef : false);
                  const sermonInfo = sermonVerseMap[key] || (altKey ? sermonVerseMap[altKey] : undefined);
                  const hasSermon = Boolean(sermonInfo);
                  const hasAi = savedAiVerseKeys.has(key) || (altKey ? savedAiVerseKeys.has(altKey) : false);
                  
                  return (
                    <VerseItem
                      key={`${v.bookId}-${v.chapter}-${v.verse}`}
                      verse={v}
                      isSelected={selectedVerses.has(v.verse)}
                      isHighlighted={v.verse === highlightVerse}
                      hasCommentary={hasNoteData}
                      hasCrossRef={hasCrossRefData}
                      hasNote={hasNoteData}
                      hasSermon={hasSermon}
                      sermonInfo={sermonInfo}
                      hasAi={hasAi}
                      showAnnotations={showAnnotations}
                      activeFilters={annotationFilters}
                      fontSize={fontSize}
                      lineHeight={lineHeight}
                      verseSpacing={verseSpacing}
                      onClick={toggleVerse}
                      onIconClick={handleIconClick}
                      onSermonIconClick={handleSermonIconClick}
                      onAiClick={handleAiClick}
                    />
                  );
                })}
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
              className="fixed bottom-3 sm:bottom-6 left-1/2 bg-[#2C2B29]/95 text-white shadow-2xl rounded-2xl px-2 sm:px-3 py-1 sm:py-1.5 flex items-center gap-1 sm:gap-1.5 z-[999999] border border-[#E7E5DF]/20 backdrop-blur-md overflow-x-auto max-w-[96vw] custom-scrollbar"
            >
              <div className="flex items-center gap-1.5 px-2.5 shrink-0">
                <span className="text-[#FAF0EB] font-bold text-xs tracking-tight">{selectedVerses.size}개 구절</span>
              </div>
              
              <div className="w-px h-4 bg-[#4A4844] mx-0.5 shrink-0"></div>
              
              <div className="flex items-center gap-1">
                <button 
                  onClick={handleCopy}
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
                    {onOpenAiCommentary && (
                      <button 
                        onClick={() => {
                          const firstVerse = Array.from(selectedVerses).sort((a,b)=>a-b)[0];
                          const verseObj = displayData[0]?.verses.find(x => x.verse === firstVerse);
                          const text = verseObj?.text || (verseObj as any)?.content || '';
                          onOpenAiCommentary(firstVerse, text);
                          setSelectedVerses(new Set());
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-[#3D3B38] rounded-xl transition-colors text-xs font-semibold text-[#C46A40] whitespace-nowrap shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5 stroke-[1.5px]" /> AI 주석
                      </button>
                    )}
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
