import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileEdit, Plus, Calendar, Search, Save, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, PanelRight, PanelBottom, Maximize2, Type, Minus, Copy, Trash2, Layers, BookOpen, Folder, FolderOpen, ArrowLeft, Bold, Italic, Underline, Highlighter, HardDrive, Cloud, CloudOff } from 'lucide-react';
import { db, auth } from '../api/firebaseConfig';
import { doc, collection, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { BIBLE_LIST } from '../constants/bibleMeta';
import { extractBibleBookFromText, parseBibleReference, isBibleReferenceMatch } from '../utils/referenceParser';
import { useIsMobile } from '../hooks/useIsMobile';
import { useSermonSync, type SermonDocument } from '../hooks/useSermonSync';
import { matchBibleReferences, getVersesFromLocalDB, createVerseQuoteHtml } from '../services/localBibleService';
import { subscribeUserProfile, updateUserResourceCounts } from '../services/userService';
import { getPlanSettings, canUserSyncCloudNotes, type SubscriptionPlansSettings } from '../services/planConfigService';


interface Sermon {
  id: string;
  title: string;
  date: string;
  content?: string;
  version?: number;
  updatedAt?: number;
  fontId?: string;
  fontSize?: number;
  autoVerseConversion?: boolean;
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
  openSermonById: (id: string) => void;
}

/**
 * 에디터의 HTML 서식 태그(<span style=...>, <div>, <br> 등)를 
 * 목록 미리보기 및 검색에서 깔끔한 일반 글자로 변환해주는 헬퍼
 */
const stripHtml = (html?: string): string => {
  if (!html) return '';
  return html
    .replace(/<br\s*[\/]?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<\/div>/gi, ' ')
    .replace(/<[^>]+>/g, '') // 모든 HTML 태그 제거
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/[#*`\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

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
  const isMobile = useIsMobile(768);
  // ✅ 설교 목록: 기본적으로 기기(localStorage)에 무제한 영구 보관
  const [sermons, setSermons] = useState<Sermon[]>(() => {
    try {
      const saved = localStorage.getItem('bible-local-sermons');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [googleUserId, setGoogleUserId] = useState<string | null>(null);
  const [canSyncCloud, setCanSyncCloud] = useState<boolean>(false);
  const planSettingsRef = useRef<SubscriptionPlansSettings | null>(null);
  const unsubscribeSermonsRef = useRef<(() => void) | null>(null);

  // 로컬 기기에 설교 목록 영구 저장 헬퍼
  const saveSermonsToLocal = (data: Sermon[]) => {
    try {
      localStorage.setItem('bible-local-sermons', JSON.stringify(data));
      window.dispatchEvent(new CustomEvent('bible-sermons-updated', { detail: data }));
    } catch (e) {
      console.warn('[SermonSidebar] 로컬 기기 저장 경고:', e);
    }
  };

  // 최신 플랜 설정 로드 및 실시간 업데이트 수신
  useEffect(() => {
    getPlanSettings().then(st => {
      planSettingsRef.current = st;
    }).catch(() => {});

    const handlePlanUpdate = (e: any) => {
      if (e.detail) planSettingsRef.current = e.detail;
    };
    window.addEventListener('plan-config-updated', handlePlanUpdate);
    return () => {
      window.removeEventListener('plan-config-updated', handlePlanUpdate);
    };
  }, []);

  const subscribeToSermons = (uid: string) => {
    if (unsubscribeSermonsRef.current) unsubscribeSermonsRef.current();
    const sermonsCol = collection(db, 'users', uid, 'sermons');
    const unsubscribe = onSnapshot(sermonsCol, (snapshot) => {
      const serverData: Sermon[] = [];
      snapshot.forEach(docSnap => {
        serverData.push({ id: docSnap.id, ...docSnap.data() } as Sermon);
      });

      // 기존 로컬 기기(localStorage)에 보관된 설교 목록 읽기
      let localData: Sermon[] = [];
      try {
        const saved = localStorage.getItem('bible-local-sermons');
        if (saved) localData = JSON.parse(saved);
      } catch {}

      // 로컬과 서버 양방향 병합 (Merge)
      const serverMap = new Map<string, Sermon>(serverData.map(s => [s.id, s]));
      const mergedMap = new Map<string, Sermon>(serverData.map(s => [s.id, s]));

      // 로컬에만 있는 설교는 서버에 자동 업로드하고 병합 목록에 유지 (기존 작성분 절대 유실 방지)
      localData.forEach(loc => {
        if (!serverMap.has(loc.id)) {
          mergedMap.set(loc.id, loc);
          const docRef = doc(db, 'users', uid, 'sermons', loc.id);
          setDoc(docRef, loc, { merge: true }).catch(err => {
            console.warn('[SermonSidebar] 로컬 설교 서버 동기화 실패:', loc.id, err);
          });
        } else {
          // 둘 다 있는 경우: 더 최근 수정본(updatedAt) 기준 채택하되,
          // 로컬에 유효한 본문이 있고 서버 본문이 비어있는 비정상 상태라면 로컬 본문을 보호
          const srv = serverMap.get(loc.id)!;
          const locUpdatedAt = loc.updatedAt || 0;
          const srvUpdatedAt = srv.updatedAt || 0;
          const locHasContent = stripHtml(loc.content).length > 0;
          const srvHasContent = stripHtml(srv.content).length > 0;

          if (locUpdatedAt > srvUpdatedAt || (locHasContent && !srvHasContent)) {
            const preserved: Sermon = locUpdatedAt > srvUpdatedAt
              ? loc
              : { ...srv, content: loc.content, updatedAt: Math.max(locUpdatedAt, srvUpdatedAt) };
            mergedMap.set(loc.id, preserved);
            const docRef = doc(db, 'users', uid, 'sermons', loc.id);
            setDoc(docRef, preserved, { merge: true }).catch(err => {
              console.warn('[SermonSidebar] 최신 로컬 설교 서버 갱신 실패:', loc.id, err);
            });
          }
        }
      });

      const mergedList = Array.from(mergedMap.values());
      mergedList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setSermons(mergedList);
      saveSermonsToLocal(mergedList);
      updateUserResourceCounts(uid, { sermonCount: mergedList.length });
    }, (err) => {
      console.warn('[SermonSidebar] Firestore offline (로컬 기기 보관 사용 중):', err.code);
    });
    unsubscribeSermonsRef.current = unsubscribe;
  };

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        setGoogleUserId(user.uid);

        if (unsubProfile) unsubProfile();
        unsubProfile = subscribeUserProfile(user.uid, (profile) => {
          if (profile) {
            const allowed = canUserSyncCloudNotes(profile, planSettingsRef.current);
            setCanSyncCloud(allowed);

            if (allowed) {
              subscribeToSermons(user.uid);
            } else {
              // 동기화 꺼져있으면 서버 리스너 해제 (로컬 기기 저장 모드 유지)
              if (unsubscribeSermonsRef.current) {
                unsubscribeSermonsRef.current();
                unsubscribeSermonsRef.current = null;
              }
            }
          }
        }, user.email);
      } else {
        setGoogleUserId(null);
        setCanSyncCloud(false);
        if (unsubscribeSermonsRef.current) {
          unsubscribeSermonsRef.current();
          unsubscribeSermonsRef.current = null;
        }
        if (unsubProfile) {
          unsubProfile();
          unsubProfile = null;
        }
      }
    });
    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
      if (unsubscribeSermonsRef.current) unsubscribeSermonsRef.current();
    };
  }, []);

  const handleDeleteSermon = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('이 설교문을 정말 삭제하시겠습니까?')) {
      const nextSermons = sermons.filter(s => s.id !== id);
      setSermons(nextSermons);
      saveSermonsToLocal(nextSermons);

      if (googleUserId) {
        updateUserResourceCounts(googleUserId, { sermonCount: nextSermons.length });
      }

      if (googleUserId && canSyncCloud) {
        try {
          const docRef = doc(db, 'users', googleUserId, 'sermons', id);
          await deleteDoc(docRef);
        } catch (err) {
          console.warn('[SermonSidebar] Firestore delete error:', err);
        }
      }

      try {
        localStorage.removeItem(`sermon_draft_${id}`);
      } catch {}

      if (activeSermonId === id) {
        hasUserEditedRef.current = false;
        isEditorHydratedRef.current = false;
        latestEditorRef.current = {
          id: null,
          title: '',
          content: '',
          fontId: 'noto-serif',
          fontSize: 16,
          autoVerseConversion: true,
        };
        setView('list');
        setActiveSermonId(null);
        setEditorContent('');
      }
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [activeSermonId, setActiveSermonId] = useState<string | null>(null);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [syncToastMessage, setSyncToastMessage] = useState<string | null>(null);

  // 에디터 최신 데이터의 단일 진실 공급원(Single Source of Truth) 및 실제 수정 여부 추적 Ref
  const latestEditorRef = useRef<{
    id: string | null;
    title: string;
    content: string;
    fontId: string;
    fontSize: number;
    autoVerseConversion: boolean;
  }>({
    id: null,
    title: '',
    content: '',
    fontId: 'noto-serif',
    fontSize: 16,
    autoVerseConversion: true,
  });
  const hasUserEditedRef = useRef<boolean>(false);
  const isEditorHydratedRef = useRef<boolean>(false);

  const activeSermonObj = useMemo(() => {
    return sermons.find(s => s.id === activeSermonId) || null;
  }, [sermons, activeSermonId]);

  // useSermonSync 동기화 훅 바인딩
  const {
    syncStatus,
    isDirty,
    flushSave,
    notifyChange: rawNotifyChange,
    resetSyncState,
  } = useSermonSync({
    userId: googleUserId,
    sermonId: activeSermonId,
    canSyncCloud,
    initialTitle: activeSermonObj?.title || '',
    initialContent: activeSermonObj?.content || '',
    initialVersion: activeSermonObj?.version || 1,
    throttleMs: 60000, // 1분(60초) 스로틀 서버 업로드 (무료 티어 극대화)
    onSaveSuccess: (savedDoc: SermonDocument) => {
      setSermons(prev => {
        const exists = prev.some(s => s.id === savedDoc.id);
        const next = exists
          ? prev.map(s => s.id === savedDoc.id ? { ...s, ...savedDoc } : s)
          : [{ ...savedDoc }, ...prev];
        saveSermonsToLocal(next);
        if (googleUserId) {
          updateUserResourceCounts(googleUserId, { sermonCount: next.length });
        }
        return next;
      });
    },
    onConflictCreated: (conflictDocId, copyTitle) => {
      setSyncToastMessage(`다른 기기 변경사항이 감지되어 현재 내용은 "${copyTitle}" 문서로 안전하게 보존되었습니다.`);
    },
    onRemoteUpdated: (updatedDoc: SermonDocument) => {
      // 다른 기기에서 수정한 최신본으로 조용한 자동 갱신
      latestEditorRef.current = {
        id: updatedDoc.id,
        title: updatedDoc.title,
        content: updatedDoc.content,
        fontId: updatedDoc.fontId || latestEditorRef.current.fontId,
        fontSize: typeof updatedDoc.fontSize === 'number' ? updatedDoc.fontSize : latestEditorRef.current.fontSize,
        autoVerseConversion: updatedDoc.autoVerseConversion !== undefined ? updatedDoc.autoVerseConversion : latestEditorRef.current.autoVerseConversion,
      };
      hasUserEditedRef.current = false;

      setEditorTitle(updatedDoc.title);
      setEditorContent(updatedDoc.content);
      if (updatedDoc.fontId) setSermonFontId(updatedDoc.fontId);
      if (typeof updatedDoc.fontSize === 'number') setSermonFontSize(updatedDoc.fontSize);
      if (updatedDoc.autoVerseConversion !== undefined) setIsAutoVerseEnabled(updatedDoc.autoVerseConversion);

      if (editorAreaRef.current) {
        editorAreaRef.current.innerHTML = updatedDoc.content;
        isEditorHydratedRef.current = true;
      }
      setSermons(prev => {
        const exists = prev.some(s => s.id === updatedDoc.id);
        const next = exists
          ? prev.map(s => s.id === updatedDoc.id ? { ...s, ...updatedDoc } : s)
          : [{ ...updatedDoc }, ...prev];
        saveSermonsToLocal(next);
        return next;
      });
      setSyncToastMessage('다른 기기에서 수정한 최신 설교 내용으로 자동 갱신되었습니다.');
    },
    onWarning: (msg: string) => {
      setSyncToastMessage(msg);
    },
  });

  // 타이핑 및 편집 중 로컬 목록 자동 보관 디바운스 (1초)
  const localListSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncCurrentEditorToLocalSermonsRef = useRef<(forceSave?: boolean) => void>(() => {});

  const triggerDebouncedLocalSync = () => {
    if (localListSyncTimerRef.current) clearTimeout(localListSyncTimerRef.current);
    localListSyncTimerRef.current = setTimeout(() => {
      localListSyncTimerRef.current = null;
      syncCurrentEditorToLocalSermonsRef.current();
    }, 1000);
  };

  // 에디터의 모든 변경(타이핑, 제목, 서식, 구절칩, 붙여넣기 등 14곳)이 통과하는 단일 관문
  const notifyChange = (
    title: string,
    content: string,
    extra?: { fontId?: string; fontSize?: number; autoVerseConversion?: boolean }
  ) => {
    const resolvedFontId = extra?.fontId !== undefined ? extra.fontId : latestEditorRef.current.fontId;
    const resolvedFontSize = extra?.fontSize !== undefined ? extra.fontSize : latestEditorRef.current.fontSize;
    const resolvedAutoVerse = extra?.autoVerseConversion !== undefined ? extra.autoVerseConversion : latestEditorRef.current.autoVerseConversion;

    latestEditorRef.current = {
      id: latestEditorRef.current.id,
      title,
      content,
      fontId: resolvedFontId,
      fontSize: resolvedFontSize,
      autoVerseConversion: resolvedAutoVerse,
    };
    hasUserEditedRef.current = true;

    rawNotifyChange(title, content, {
      fontId: resolvedFontId,
      fontSize: resolvedFontSize,
      autoVerseConversion: resolvedAutoVerse,
    });
    triggerDebouncedLocalSync();
  };

  const SERMON_FONTS = [
    { id: 'noto-serif', name: '본명조 (Noto Serif)', family: "'Noto Serif KR', Georgia, serif" },
    { id: 'nanum-myeongjo', name: '나눔명조 (Nanum)', family: "'Nanum Myeongjo', serif" },
    { id: 'maru-buri', name: '마루 부리 (Maru Buri)', family: "'MaruBuri', serif" },
    { id: 'pretendard', name: '프리텐다드 (Pretendard)', family: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif" },
    { id: 'noto-sans', name: '본고딕 (Noto Sans)', family: "'Noto Sans KR', sans-serif" },
  ];

  const TEXT_COLORS = [
    { label: '기본검정', value: '#2C2B29' },
    { label: '빨강', value: '#DC2626' },
    { label: '주황/클로드', value: '#C96442' },
    { label: '파랑', value: '#2563EB' },
    { label: '초록', value: '#16A34A' },
    { label: '보라', value: '#9333EA' },
    { label: '회색', value: '#6A6864' },
  ];

  const HIGHLIGHT_COLORS = [
    { label: '없음', value: 'transparent' },
    { label: '노랑', value: '#FEF08A' },
    { label: '형광연두', value: '#BBF7D0' },
    { label: '하늘색', value: '#BAE6FD' },
    { label: '살구/피치', value: '#FED7AA' },
    { label: '연분홍', value: '#FBCFE8' },
  ];

  const [sermonFontId, setSermonFontId] = useState('noto-serif');
  const [sermonFontSize, setSermonFontSize] = useState<number>(16);
  const [fontSizeInput, setFontSizeInput] = useState<string>('16');
  // 구절 자동 변환 스위치 (기본값 ON: true, 각 노트별로 독립 설정)
  const [isAutoVerseEnabled, setIsAutoVerseEnabled] = useState<boolean>(true);

  // 텍스트 스타일 상태
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [textColor, setTextColor] = useState('#2C2B29');
  const [highlightColor, setHighlightColor] = useState('transparent');

  // 드롭다운 팝오버 열림 상태
  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false);
  const [isColorDropdownOpen, setIsColorDropdownOpen] = useState(false);
  const [isHighlightDropdownOpen, setIsHighlightDropdownOpen] = useState(false);

  useEffect(() => {
    setFontSizeInput(String(sermonFontSize));
  }, [sermonFontSize]);

  const activeFontFamily = useMemo(() => {
    const found = SERMON_FONTS.find(f => f.id === sermonFontId);
    return found ? found.family : "'Noto Serif KR', Georgia, serif";
  }, [sermonFontId]);

  const editorAreaRef = useRef<HTMLDivElement>(null);
  const savedSelectionRangeRef = useRef<Range | null>(null);

  // 선택 영역 저장 (툴바 버튼 클릭 시 selection 풀림 방지)
  const saveCurrentSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (editorAreaRef.current && editorAreaRef.current.contains(range.commonAncestorContainer)) {
        savedSelectionRangeRef.current = range.cloneRange();
        return;
      }
    }
  };

  // 선택 영역 복원
  const restoreSavedSelection = () => {
    if (savedSelectionRangeRef.current) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(savedSelectionRangeRef.current);
      }
    }
  };

  // 블록 지정된 텍스트에 서식 적용 (또는 전체 폰트/크기 적용)
  const applyFormattingToSelection = (type: 'font' | 'size' | 'bold' | 'italic' | 'underline' | 'color' | 'highlight', value?: string | number) => {
    if (!editorAreaRef.current) return;
    editorAreaRef.current.focus();
    restoreSavedSelection();

    const sel = window.getSelection();
    const hasSelection = sel && !sel.isCollapsed && editorAreaRef.current.contains(sel.anchorNode);

    if (hasSelection && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);

      if (type === 'bold') {
        document.execCommand('bold', false);
      } else if (type === 'italic') {
        document.execCommand('italic', false);
      } else if (type === 'underline') {
        document.execCommand('underline', false);
      } else if (type === 'color' && typeof value === 'string') {
        document.execCommand('foreColor', false, value);
      } else if (type === 'font' && typeof value === 'string') {
        document.execCommand('fontName', false, value);
      } else if (type === 'size' && value) {
        // 선택 영역을 span으로 감싸 명확한 px 크기 적용
        const span = document.createElement('span');
        span.style.fontSize = `${value}px`;
        try {
          span.appendChild(range.extractContents());
          range.insertNode(span);
          sel.removeAllRanges();
          const newRange = document.createRange();
          newRange.selectNodeContents(span);
          sel.addRange(newRange);
          savedSelectionRangeRef.current = newRange.cloneRange();
        } catch (e) {
          console.error(e);
        }
      } else if (type === 'highlight' && typeof value === 'string') {
        if (value === 'transparent') {
          document.execCommand('removeFormat', false);
        } else {
          // 형광펜: 글자 배경에 형광펜 패딩과 라운드 처리된 span 적용
          const mark = document.createElement('span');
          mark.style.backgroundColor = value;
          mark.style.padding = '0.1em 0.25em';
          mark.style.borderRadius = '3px';
          mark.style.boxDecorationBreak = 'clone';
          (mark.style as any).webkitBoxDecorationBreak = 'clone';
          try {
            mark.appendChild(range.extractContents());
            range.insertNode(mark);
            sel.removeAllRanges();
            const newRange = document.createRange();
            newRange.selectNodeContents(mark);
            sel.addRange(newRange);
            savedSelectionRangeRef.current = newRange.cloneRange();
          } catch (e) {
            console.error(e);
          }
        }
      }
    } else {
      // 선택 영역이 없을 때: 폰트 종류나 기본 크기는 기본 상태로 저장
      if (type === 'font' && typeof value === 'string') {
        const found = SERMON_FONTS.find(f => f.family === value || f.id === value);
        if (found) setSermonFontId(found.id);
      } else if (type === 'size' && typeof value === 'number') {
        setSermonFontSize(value);
      } else if (type === 'color' && typeof value === 'string') {
        document.execCommand('foreColor', false, value);
      } else if (type === 'highlight' && typeof value === 'string') {
        if (value === 'transparent') {
          document.execCommand('removeFormat', false);
        } else {
          document.execCommand('hiliteColor', false, value);
        }
      } else if (type === 'bold') {
        document.execCommand('bold', false);
      } else if (type === 'italic') {
        document.execCommand('italic', false);
      } else if (type === 'underline') {
        document.execCommand('underline', false);
      }
    }

    // 에디터 내용 동기화 및 훅에 변경 통지 (Local-First 0.3s 캐싱 + 60s 스로틀)
    if (editorAreaRef.current) {
      const updatedHtml = editorAreaRef.current.innerHTML;
      setEditorContent(updatedHtml);
      const targetFontId = (type === 'font' && typeof value === 'string') 
        ? (SERMON_FONTS.find(f => f.family === value || f.id === value)?.id || sermonFontId) 
        : sermonFontId;
      const targetFontSize = (type === 'size' && typeof value === 'number') ? value : sermonFontSize;

      notifyChange(editorTitle, updatedHtml, {
        fontId: targetFontId,
        fontSize: targetFontSize,
        autoVerseConversion: isAutoVerseEnabled,
      });
    }
  };

  // 에디터 마우스/키보드 선택 감지
  const handleSelectionChange = () => {
    saveCurrentSelection();
  };

  // ── 성경 구절 인식 및 인라인 칩 변환 함수군 ──
  const convertTextNodeToBibleChips = (textNode: Text): { changed: boolean; lastChip: HTMLElement | null } => {
    const text = textNode.nodeValue;
    if (!text) return { changed: false, lastChip: null };

    // 이미 변환된 chip 내부나 인용 카드 내부인 경우 제외
    if (textNode.parentElement?.closest('.bible-verse-chip, .bible-verse-quote-card')) {
      return { changed: false, lastChip: null };
    }

    const matches = matchBibleReferences(text);
    if (matches.length === 0) return { changed: false, lastChip: null };

    const parent = textNode.parentNode;
    if (!parent) return { changed: false, lastChip: null };

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let lastChipNode: HTMLElement | null = null;

    for (const match of matches) {
      const matchIndex = text.indexOf(match.rawMatch, lastIndex);
      if (matchIndex === -1) continue;

      if (matchIndex > lastIndex) {
        frag.appendChild(document.createTextNode(text.substring(lastIndex, matchIndex)));
      }

      // 칩 앞에 빈 텍스트(또는 zero-width space)를 확보하여 줄 맨 앞에서도 커서가 위치하고 글자를 적을 수 있도록 지원
      if (matchIndex === 0 && lastIndex === 0) {
        frag.appendChild(document.createTextNode('\u200B'));
      }

      const chipSpan = document.createElement('span');
      chipSpan.className = 'bible-verse-chip';
      chipSpan.contentEditable = 'false';
      chipSpan.setAttribute('data-book-id', match.bookId);
      chipSpan.setAttribute('data-chapter', String(match.chapter));
      chipSpan.setAttribute('data-start-verse', String(match.startVerse));
      if (match.endVerse) {
        chipSpan.setAttribute('data-end-verse', String(match.endVerse));
      }
      chipSpan.setAttribute('data-ref-text', match.standardLabel);
      chipSpan.title = '클릭하여 성경 본문 펼치기';
      chipSpan.innerHTML = match.standardLabel;
      frag.appendChild(chipSpan);

      // 칩 뒤 공백 노드
      frag.appendChild(document.createTextNode('\u00A0'));
      lastChipNode = chipSpan;

      lastIndex = matchIndex + match.rawMatch.length;
    }

    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    parent.replaceChild(frag, textNode);
    return { changed: true, lastChip: lastChipNode };
  };

  const scanAndConvertAllBibleReferences = (root: Node): boolean => {
    let anyChanged = false;
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (node.parentElement?.closest('.bible-verse-chip, .bible-verse-quote-card')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes: Text[] = [];
    let cur = walker.nextNode();
    while (cur) {
      textNodes.push(cur as Text);
      cur = walker.nextNode();
    }

    for (const tn of textNodes) {
      const res = convertTextNodeToBibleChips(tn);
      if (res.changed) anyChanged = true;
    }

    return anyChanged;
  };

  // 타이핑 중 스페이스바/엔터 감지 및 구절칩 앞 커서 제어
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // 1. 엔터 키 입력 시 구절칩 바로 앞인 경우 줄바꿈 및 커서 진입 처리
    if (e.key === 'Enter') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && editorAreaRef.current) {
        const range = sel.getRangeAt(0);
        let node: Node | null = range.startContainer;
        const offset = range.startOffset;

        let nextSibling: Node | null = null;
        if (node.nodeType === Node.TEXT_NODE) {
          if (offset === (node.nodeValue?.length || 0)) {
            nextSibling = node.nextSibling;
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          nextSibling = node.childNodes[offset] || null;
        }

        if (nextSibling && (nextSibling as HTMLElement).classList?.contains('bible-verse-chip')) {
          e.preventDefault();
          const chipNode = nextSibling;
          const br = document.createElement('br');
          const spaceBefore = document.createTextNode('\u200B');
          const parent = chipNode.parentNode;
          if (parent) {
            parent.insertBefore(br, chipNode);
            parent.insertBefore(spaceBefore, chipNode);

            const newRange = document.createRange();
            newRange.setStart(spaceBefore, 0);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);

            const updatedHtml = editorAreaRef.current.innerHTML;
            setEditorContent(updatedHtml);
            notifyChange(editorTitle, updatedHtml);
            return;
          }
        }
      }
    }

    if (e.key === ' ' || e.key === 'Enter') {
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !editorAreaRef.current) return;
        const range = sel.getRangeAt(0);
        let node: Node | null = range.startContainer;

        let targetTextNode: Text | null = null;
        if (node && node.nodeType === Node.TEXT_NODE) {
          targetTextNode = node as Text;
        } else if (node && node.previousSibling && node.previousSibling.nodeType === Node.TEXT_NODE) {
          targetTextNode = node.previousSibling as Text;
        }

        // 구절자동변환이 ON일 때만 타이핑 중 자동 변환 수행
        if (targetTextNode && isAutoVerseEnabled) {
          const res = convertTextNodeToBibleChips(targetTextNode);
          if (res.changed && editorAreaRef.current) {
            if (res.lastChip && res.lastChip.nextSibling) {
              const newRange = document.createRange();
              newRange.setStart(res.lastChip.nextSibling, (res.lastChip.nextSibling.nodeValue?.length || 1));
              newRange.collapse(true);
              sel.removeAllRanges();
              sel.addRange(newRange);
            }
            const updatedHtml = editorAreaRef.current.innerHTML;
            setEditorContent(updatedHtml);
            notifyChange(editorTitle, updatedHtml, {
              fontId: sermonFontId,
              fontSize: sermonFontSize,
              autoVerseConversion: isAutoVerseEnabled,
            });
          }
        }

        // 엔터 후 줄 맨 앞에 구절칩이 있는 경우 커서 진입을 위한 공백 확보
        if (editorAreaRef.current) {
          const chips = editorAreaRef.current.querySelectorAll('.bible-verse-chip');
          chips.forEach(chip => {
            const prev = chip.previousSibling;
            if (!prev || (prev.nodeType === Node.TEXT_NODE && (prev.nodeValue === '' || prev.nodeValue === '\n'))) {
              const textNode = document.createTextNode('\u200B');
              chip.parentNode?.insertBefore(textNode, chip);
            }
          });
        }
      }, 10);
    }
  };

  // 구절 칩 클릭 시 로컬 DB 본문 토글 펼치기 및 카드 닫기
  const handleEditorClick = async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // 1. 인용 카드 닫기(✕)
    const closeBtn = target.closest('.bible-verse-quote-close');
    if (closeBtn) {
      e.preventDefault();
      e.stopPropagation();
      const card = closeBtn.closest('.bible-verse-quote-card');
      if (card && editorAreaRef.current) {
        card.remove();
        const updatedHtml = editorAreaRef.current.innerHTML;
        setEditorContent(updatedHtml);
        notifyChange(editorTitle, updatedHtml);
      }
      return;
    }

    // 2. 구절 칩 클릭
    const chip = target.closest('.bible-verse-chip') as HTMLElement | null;
    if (chip && editorAreaRef.current) {
      // 칩의 왼쪽 가장자리(8px 이내) 클릭 시 토글 대신 앞쪽으로 커서 진입
      const rect = chip.getBoundingClientRect();
      if (e.clientX - rect.left < 8) {
        let prev = chip.previousSibling;
        if (!prev || prev.nodeType !== Node.TEXT_NODE) {
          prev = document.createTextNode('\u200B');
          chip.parentNode?.insertBefore(prev, chip);
        }
        const sel = window.getSelection();
        if (sel) {
          const newRange = document.createRange();
          newRange.setStart(prev, (prev.nodeValue?.length || 0));
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const bookId = chip.getAttribute('data-book-id');
      const chapter = parseInt(chip.getAttribute('data-chapter') || '1', 10);
      const startVerse = parseInt(chip.getAttribute('data-start-verse') || '1', 10);
      const endVerseAttr = chip.getAttribute('data-end-verse');
      const endVerse = endVerseAttr ? parseInt(endVerseAttr, 10) : undefined;
      const refText = chip.getAttribute('data-ref-text') || '';

      if (!bookId) return;

      // 이미 열려있는지 확인 (토글 접기)
      let nextElem: Element | null = chip.nextElementSibling;
      while (nextElem && nextElem.nodeType === Node.TEXT_NODE) {
        nextElem = nextElem.nextElementSibling;
      }
      if (nextElem && nextElem.classList.contains('bible-verse-quote-card') && nextElem.getAttribute('data-for-ref') === refText) {
        // 닫기 전 형광펜, 색상 등 사용자가 수정한 본문 카드 내용을 구절칩의 data 속성에 보존
        chip.setAttribute('data-saved-card-html', encodeURIComponent(nextElem.outerHTML));
        nextElem.remove();
        const updatedHtml = editorAreaRef.current.innerHTML;
        setEditorContent(updatedHtml);
        notifyChange(editorTitle, updatedHtml);
        return;
      }

      const parentBlock = chip.closest('p, div, li');
      if (parentBlock && parentBlock !== editorAreaRef.current) {
        let nextBlock = parentBlock.nextElementSibling;
        if (nextBlock && nextBlock.classList.contains('bible-verse-quote-card') && nextBlock.getAttribute('data-for-ref') === refText) {
          // 닫기 전 수정한 본문 카드 내용을 구절칩에 보존
          chip.setAttribute('data-saved-card-html', encodeURIComponent(nextBlock.outerHTML));
          nextBlock.remove();
          const updatedHtml = editorAreaRef.current.innerHTML;
          setEditorContent(updatedHtml);
          notifyChange(editorTitle, updatedHtml);
          return;
        }
      }

      // 카드 다시 열기: 이전에 수정한 본문 카드가 저장되어 있으면 해당 서식(형광펜, 색상 등) 그대로 복원
      const savedCardHtml = chip.getAttribute('data-saved-card-html');
      if (savedCardHtml) {
        try {
          const decodedHtml = decodeURIComponent(savedCardHtml);
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = decodedHtml.trim();
          const cardNode = tempDiv.firstElementChild;
          if (cardNode && editorAreaRef.current) {
            if (parentBlock && parentBlock !== editorAreaRef.current && parentBlock.parentElement === editorAreaRef.current) {
              parentBlock.insertAdjacentElement('afterend', cardNode);
            } else {
              chip.insertAdjacentElement('afterend', cardNode);
            }
            const updatedHtml = editorAreaRef.current.innerHTML;
            setEditorContent(updatedHtml);
            notifyChange(editorTitle, updatedHtml);
            return;
          }
        } catch (e) {
          console.warn('[SermonSidebar] 저장된 카드 복원 실패, 로컬 DB에서 다시 로드:', e);
        }
      }

      // 저장된 카드가 없으면 로컬 DB(IndexedDB bibleDB)에서 구절 로드 (외부 API/Firestore 절대 조회 안 함)
      try {
        const verseResult = await getVersesFromLocalDB(bookId, chapter, startVerse, endVerse);
        if (verseResult && editorAreaRef.current) {
          const quoteHtml = createVerseQuoteHtml(verseResult);
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = quoteHtml.trim();
          const cardNode = tempDiv.firstElementChild;

          if (cardNode) {
            if (parentBlock && parentBlock !== editorAreaRef.current && parentBlock.parentElement === editorAreaRef.current) {
              parentBlock.insertAdjacentElement('afterend', cardNode);
            } else {
              chip.insertAdjacentElement('afterend', cardNode);
            }

            const updatedHtml = editorAreaRef.current.innerHTML;
            setEditorContent(updatedHtml);
            notifyChange(editorTitle, updatedHtml);
          }
        }
      } catch (err) {
        console.warn('[SermonSidebar] 로컬 구절 본문 펼치기 실패:', err);
      }
    }
  };

  // 구절자동변환 토글 핸들러: 누르면 활성화/해제 및 활성화 시 현재 텍스트 일괄 변환
  const handleToggleAutoVerse = () => {
    const nextState = !isAutoVerseEnabled;
    setIsAutoVerseEnabled(nextState);

    let updatedHtml = editorContent;
    if (nextState && editorAreaRef.current) {
      // ON으로 변경 시 작성된 텍스트 중 구절이 있으면 즉시 일괄 변환
      const changed = scanAndConvertAllBibleReferences(editorAreaRef.current);
      if (changed) {
        updatedHtml = editorAreaRef.current.innerHTML;
        setEditorContent(updatedHtml);
      }
    }

    notifyChange(editorTitle, updatedHtml, {
      fontId: sermonFontId,
      fontSize: sermonFontSize,
      autoVerseConversion: nextState,
    });
  };

  const handleEditorBlur = () => {
    if (!editorAreaRef.current || !isAutoVerseEnabled) return;
    const changed = scanAndConvertAllBibleReferences(editorAreaRef.current);
    if (changed) {
      const updatedHtml = editorAreaRef.current.innerHTML;
      setEditorContent(updatedHtml);
      notifyChange(editorTitle, updatedHtml, {
        fontId: sermonFontId,
        fontSize: sermonFontSize,
        autoVerseConversion: isAutoVerseEnabled,
      });
    }
  };

  const handleEditorPaste = () => {
    setTimeout(() => {
      if (!editorAreaRef.current || !isAutoVerseEnabled) return;
      const changed = scanAndConvertAllBibleReferences(editorAreaRef.current);
      if (changed) {
        const updatedHtml = editorAreaRef.current.innerHTML;
        setEditorContent(updatedHtml);
        notifyChange(editorTitle, updatedHtml, {
          fontId: sermonFontId,
          fontSize: sermonFontSize,
          autoVerseConversion: isAutoVerseEnabled,
        });
      }
    }, 20);
  };

  // 복사 시 애플 메모, 한글, 구글 독스 등에 글자 크기, 굵기, 색상, 형광펜 등이 그대로 유지되도록 HTML 및 Text 클립보드 데이터 생성
  const buildClipboardPayload = (container: HTMLElement) => {
    const clone = container.cloneNode(true) as HTMLElement;

    // 1. 구절칩 처리: 외곽선/배경/글자색 인라인 스타일 지정하여 외부 문서 붙여넣기 시 칩 형태 및 서식 보존
    clone.querySelectorAll('.bible-verse-chip').forEach(chip => {
      const refText = chip.getAttribute('data-ref-text') || chip.textContent || '';
      const chipEl = chip as HTMLElement;
      chipEl.style.display = 'inline-block';
      chipEl.style.padding = '2px 6px';
      chipEl.style.margin = '2px 4px';
      chipEl.style.backgroundColor = '#FFFFFF';
      chipEl.style.color = '#2C2B29';
      chipEl.style.border = '1px solid rgba(0, 0, 0, 0.2)';
      chipEl.style.borderRadius = '4px';
      chipEl.style.fontSize = '0.85em';
      chipEl.style.fontWeight = 'bold';
      chipEl.style.textDecoration = 'none';
      chipEl.textContent = refText;
    });

    // 2. 본문 인용 카드 처리: 인라인 스타일로 변환하여 외부 문서에서도 동일한 스타일 유지
    clone.querySelectorAll('.bible-verse-quote-card').forEach(card => {
      const cardEl = card as HTMLElement;
      cardEl.style.display = 'block';
      cardEl.style.margin = '8px 0';
      cardEl.style.padding = '8px 12px';
      cardEl.style.backgroundColor = '#FFFFFF';
      cardEl.style.border = '1px solid #E5E0D8';
      cardEl.style.borderRadius = '8px';
      cardEl.style.fontSize = '0.85em';
    });
    clone.querySelectorAll('.bible-quote-line').forEach(line => {
      const lineEl = line as HTMLElement;
      lineEl.style.margin = '2px 0';
      lineEl.style.lineHeight = '1.6';
    });
    clone.querySelectorAll('.bible-verse-quote-card span').forEach(span => {
      const spanEl = span as HTMLElement;
      if (spanEl.textContent?.includes('절')) {
        spanEl.style.color = '#C96442';
        spanEl.style.fontWeight = 'bold';
        spanEl.style.marginRight = '6px';
      }
    });

    // 3. 에디터 기본 폰트 및 크기 래핑
    const wrapper = document.createElement('div');
    wrapper.style.fontFamily = activeFontFamily;
    wrapper.style.fontSize = `${sermonFontSize}px`;
    wrapper.style.lineHeight = '1.7';
    wrapper.style.color = '#2C2B29';
    wrapper.innerHTML = clone.innerHTML;

    // 순수 텍스트 추출용
    const plainTextClone = container.cloneNode(true) as HTMLElement;
    plainTextClone.querySelectorAll('.bible-verse-chip').forEach(chip => {
      const refText = chip.getAttribute('data-ref-text') || chip.textContent || '';
      const textNode = document.createTextNode(` ${refText} `);
      chip.parentNode?.replaceChild(textNode, chip);
    });
    const plainText = plainTextClone.innerText || plainTextClone.textContent || '';

    return {
      html: wrapper.outerHTML,
      text: plainText,
    };
  };

  const handleEditorCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    // 선택 영역이 있을 때: 선택 영역의 DOM을 복제하여 서식을 인라인화한 후 클립보드에 전달
    const range = sel.getRangeAt(0);
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(range.cloneContents());

    const { html, text } = buildClipboardPayload(tempDiv);
    e.clipboardData.setData('text/html', html);
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
  };

  const [isResizing, setIsResizing] = useState(false);

  useImperativeHandle(ref, () => ({
    resetToRightAndOpen: () => {
      onDockPositionChange('right');
      onOverlayChange?.(false);
      onCollapseChange(false);
    },
    isFullyOpenOnRight: () => {
      return dockPosition === 'right' && !isCollapsed;
    },
    openSermonById: (id: string) => {
      openEditor(id);
      onCollapseChange(false);
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
        if (s.content && stripHtml(s.content).toLowerCase().includes(q)) score = Math.max(score, 1);

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
    // 이전에 다른 노트를 편집 중이었다면 로컬 목록에 먼저 안전하게 동기화
    if (view === 'editor' && latestEditorRef.current.id && latestEditorRef.current.id !== id) {
      syncCurrentEditorToLocalSermons();
    }

    const sermon = sermons.find(s => s.id === id);
    const baseTitle = sermon?.title || '';
    const baseContent = sermon?.content || '';
    const baseFontId = sermon?.fontId || 'noto-serif';
    const baseFontSize = typeof sermon?.fontSize === 'number' ? sermon.fontSize : 16;
    const baseAutoVerse = sermon?.autoVerseConversion !== undefined ? sermon.autoVerseConversion : true;

    let title = baseTitle;
    let content = baseContent;
    let fontId = baseFontId;
    let fontSize = baseFontSize;
    let autoVerse = baseAutoVerse;
    let wasRestoredFromDraft = false;

    // 만약 미저장된 로컬 드래프트가 남아있다면 안전하게 복원 (단, 빈 드래프트가 기존 유효 본문을 덮어쓰지 않도록 보호)
    try {
      const rawDraft = localStorage.getItem(`sermon_draft_${id}`);
      if (rawDraft) {
        const draft = JSON.parse(rawDraft);
        if (draft && (!sermon?.updatedAt || draft.timestamp > sermon.updatedAt)) {
          const baseHasContent = stripHtml(baseContent).length > 0;
          const draftHasContent = stripHtml(draft.content).length > 0;
          if (!baseHasContent || draftHasContent) {
            if (draft.title !== undefined && draft.title !== baseTitle) {
              title = draft.title;
              wasRestoredFromDraft = true;
            }
            if (draft.content !== undefined && draft.content !== baseContent) {
              content = draft.content;
              wasRestoredFromDraft = true;
            }
            if (draft.fontId) fontId = draft.fontId;
            if (typeof draft.fontSize === 'number') fontSize = draft.fontSize;
            if (draft.autoVerseConversion !== undefined) autoVerse = draft.autoVerseConversion;
          }
        }
      }
    } catch {}

    latestEditorRef.current = {
      id,
      title,
      content,
      fontId,
      fontSize,
      autoVerseConversion: autoVerse,
    };
    hasUserEditedRef.current = wasRestoredFromDraft;
    isEditorHydratedRef.current = false;

    setActiveSermonId(id);
    setView('editor');
    setEditorTitle(title);
    setEditorContent(content);
    setSermonFontId(fontId);
    setSermonFontSize(fontSize);
    setIsAutoVerseEnabled(autoVerse);

    resetSyncState({ 
      id, 
      title: baseTitle, 
      content: baseContent, 
      version: sermon?.version || 1,
      fontId: baseFontId,
      fontSize: baseFontSize,
      autoVerseConversion: baseAutoVerse,
    });

    if (editorAreaRef.current) {
      editorAreaRef.current.innerHTML = content;
      isEditorHydratedRef.current = true;
    }

    if (wasRestoredFromDraft) {
      rawNotifyChange(title, content, {
        fontId,
        fontSize,
        autoVerseConversion: autoVerse,
      });
      syncCurrentEditorToLocalSermons(true);
    }
  };

  const createNewEditor = () => {
    // 이전 작성 중인 내용이 있다면 로컬 목록에 동기화
    if (activeSermonId && view === 'editor') {
      syncCurrentEditorToLocalSermons();
    }

    const newId = `sermon-${Date.now()}`;
    latestEditorRef.current = {
      id: newId,
      title: '',
      content: '',
      fontId: 'noto-serif',
      fontSize: 16,
      autoVerseConversion: true,
    };
    hasUserEditedRef.current = false;
    isEditorHydratedRef.current = false;

    setActiveSermonId(newId);
    setView('editor');
    setEditorTitle('');
    setEditorContent('');
    setSermonFontId('noto-serif');
    setSermonFontSize(16);
    setIsAutoVerseEnabled(true);

    resetSyncState({ 
      id: newId, 
      title: '', 
      content: '', 
      version: 1,
      fontId: 'noto-serif',
      fontSize: 16,
      autoVerseConversion: true,
    });

    if (editorAreaRef.current) {
      editorAreaRef.current.innerHTML = '';
      isEditorHydratedRef.current = true;
    }
  };

  // 에디터 화면 진입 및 설교문 전환 시 0ms 동기적으로 DOM에 본문 주입 (50ms 지연 타이머 레이스 컨디션 원천 제거)
  useLayoutEffect(() => {
    if (isOpen && view === 'editor' && activeSermonId && editorAreaRef.current) {
      const targetHtml = latestEditorRef.current.id === activeSermonId
        ? latestEditorRef.current.content
        : editorContent;
      if (editorAreaRef.current.innerHTML !== targetHtml) {
        editorAreaRef.current.innerHTML = targetHtml;
      }
      isEditorHydratedRef.current = true;
    } else if (view !== 'editor' || !isOpen) {
      isEditorHydratedRef.current = false;
    }
  }, [isOpen, view, activeSermonId]);

  useEffect(() => {
    if (clipboardText) {
      if (view === 'list' || !activeSermonId) {
        openEditor(`new-${Date.now()}`);
      }
      const prevContent = latestEditorRef.current.content;
      const next = prevContent ? prevContent + '<br><br>' + clipboardText : clipboardText;
      latestEditorRef.current.content = next;
      hasUserEditedRef.current = true;
      setEditorContent(next);
      if (editorAreaRef.current) {
        editorAreaRef.current.innerHTML = next;
        isEditorHydratedRef.current = true;
      }
      notifyChange(latestEditorRef.current.title, next, {
        fontId: latestEditorRef.current.fontId,
        fontSize: latestEditorRef.current.fontSize,
        autoVerseConversion: latestEditorRef.current.autoVerseConversion,
      });
      syncCurrentEditorToLocalSermons(true);
      onCollapseChange(false);
      onClipboardTextProcessed?.();
    }
  }, [clipboardText, view, activeSermonId, onClipboardTextProcessed, onCollapseChange]);

  // 작성 중인 에디터 내용을 로컬 설교 목록에 즉시 동기화 (기기 무제한 보관)
  const syncCurrentEditorToLocalSermons = (forceSave: boolean = false) => {
    const currentId = latestEditorRef.current.id || activeSermonId;
    if (!currentId) return;

    // 사용자가 노트를 연 후 아무런 수정도 하지 않았고(Read-Only 열람) 강제 저장도 아니라면 기존 데이터를 덮어쓰지 않고 즉시 종료
    if (!hasUserEditedRef.current && !isDirty && !forceSave) {
      return;
    }

    if (localListSyncTimerRef.current) {
      clearTimeout(localListSyncTimerRef.current);
      localListSyncTimerRef.current = null;
    }

    const titleToSave = latestEditorRef.current.title.trim() || '제목 없음';
    // 에디터 DOM이 정상 초기화된 상태라면 최신 innerHTML을 참조하되, 비정상 빈 값일 경우 latestEditorRef로 보호
    let contentToSave = latestEditorRef.current.content;
    if (isEditorHydratedRef.current && editorAreaRef.current) {
      const domHtml = editorAreaRef.current.innerHTML;
      if (domHtml.trim().length > 0 || hasUserEditedRef.current) {
        contentToSave = domHtml;
        latestEditorRef.current.content = domHtml;
      }
    }

    const fontIdToSave = latestEditorRef.current.fontId;
    const fontSizeToSave = latestEditorRef.current.fontSize;
    const autoVerseToSave = latestEditorRef.current.autoVerseConversion;
    const currentDate = new Date().toISOString().split('T')[0];

    setSermons(prev => {
      const existingSermon = prev.find(s => s.id === currentId);
      // 추가 방어: 수정한 적이 없는데 기존 본문이 있고 저장하려는 본문이 비어있다면 덮어쓰지 않음
      if (!hasUserEditedRef.current && existingSermon?.content && stripHtml(existingSermon.content).length > 0 && stripHtml(contentToSave).length === 0) {
        return prev;
      }

      let next: Sermon[];
      if (existingSermon) {
        next = prev.map(s => s.id === currentId ? {
          ...s,
          title: titleToSave,
          content: contentToSave,
          date: s.date || currentDate,
          updatedAt: Date.now(),
          fontId: fontIdToSave,
          fontSize: fontSizeToSave,
          autoVerseConversion: autoVerseToSave,
        } : s);
      } else {
        next = [{
          id: currentId,
          title: titleToSave,
          content: contentToSave,
          date: currentDate,
          updatedAt: Date.now(),
          fontId: fontIdToSave,
          fontSize: fontSizeToSave,
          autoVerseConversion: autoVerseToSave,
        }, ...prev];
      }
      saveSermonsToLocal(next);
      if (googleUserId) {
        updateUserResourceCounts(googleUserId, { sermonCount: next.length });
      }
      return next;
    });
  };
  syncCurrentEditorToLocalSermonsRef.current = syncCurrentEditorToLocalSermons;

  const flushSaveRef = useRef(flushSave);
  flushSaveRef.current = flushSave;
  const viewRef = useRef(view);
  viewRef.current = view;

  // 외부 버튼(상단바 설교 아이콘 등)으로 사이드바가 닫힐 때 로컬 즉시 저장 및 서버 플러시
  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    if (prevIsOpenRef.current && !isOpen) {
      if (view === 'editor' && latestEditorRef.current.id) {
        syncCurrentEditorToLocalSermonsRef.current();
        flushSaveRef.current();
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, view]);

  // 생명주기 이벤트(창 전환 / 닫기 / 폰 화면 꺼짐 / 백그라운드) 시 로컬 및 클라우드 즉시 동기화
  // 의존성 배열을 []로 고정하여 타이핑 중 리렌더링 시 1초 로컬 자동저장 타이머가 취소되지 않도록 보장
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && viewRef.current === 'editor' && latestEditorRef.current.id) {
        syncCurrentEditorToLocalSermonsRef.current();
        flushSaveRef.current();
      }
    };
    const handlePageHide = () => {
      if (viewRef.current === 'editor' && latestEditorRef.current.id) {
        syncCurrentEditorToLocalSermonsRef.current();
        flushSaveRef.current();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
      if (localListSyncTimerRef.current) {
        clearTimeout(localListSyncTimerRef.current);
        localListSyncTimerRef.current = null;
        syncCurrentEditorToLocalSermonsRef.current();
      }
    };
  }, []);

  const handleClose = async () => {
    if (view === 'editor') {
      syncCurrentEditorToLocalSermons();
      onClose();
      onCollapseChange(false);
      await flushSave();
    } else {
      onClose();
      onCollapseChange(false);
    }
  };

  const handleBackToList = async () => {
    if (view === 'editor') {
      syncCurrentEditorToLocalSermons();
      setView('list');
      await flushSave();
    } else {
      setView('list');
    }
  };

  const getContainerClasses = () => {
    if (isMobile) {
      return 'fixed inset-0 z-50 bg-[#FAF9F5] flex flex-col border-none shadow-none';
    }
    switch (dockPosition) {
      case 'right': return `fixed top-0 right-0 border-l border-[#EBE6DF] ${isOverlay ? 'shadow-[-16px_0_45px_rgba(0,0,0,0.18)]' : 'shadow-[-10px_0_40px_rgba(0,0,0,0.1)]'}`;
      case 'bottom': return `fixed bottom-0 left-0 border-t border-[#EBE6DF] ${isOverlay ? 'shadow-[0_-16px_45px_rgba(0,0,0,0.18)]' : 'shadow-[0_-10px_40px_rgba(0,0,0,0.1)]'}`;
      case 'free': return 'fixed bottom-6 left-1/2 rounded-2xl shadow-2xl border border-[#EBE6DF] ';
    }
  };

  const getContainerStyle = (): React.CSSProperties => {
    if (isMobile) {
      return { width: '100vw', height: '100%', maxWidth: '100vw', maxHeight: '100%', left: 0, top: 0, right: 0, bottom: 0 };
    }
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
    if (isOffScreen || (isCollapsed && !isMobile)) {
      if (isMobile) return { x: '100%', y: 0 };
      switch (dockPosition) {
        case 'right': return { x: '100%', y: 0 };
        case 'bottom': return { x: 0, y: '100%' };
        case 'free': return { scale: 0.9, opacity: 0 };
      }
    }
    
    if (dockPosition === 'free' && !isMobile) {
      return { scale: 1, opacity: 1 };
    }
    return { x: 0, y: 0 };
  };

  const getTabContainerClasses = () => {
    if (isMobile) return 'hidden';
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
            <div className="flex items-center gap-1.5 relative z-[110] shrink-0">
              {isMobile ? (
                <>
                  <button 
                    onClick={handleClose}
                    className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-[#EAE4DA] rounded-lg transition-colors text-xs font-semibold text-[#6A6864] hover:text-[#2C2B29] mr-0.5 shadow-2xs cursor-pointer whitespace-nowrap"
                    title="성경 본문으로 돌아가기"
                  >
                    <ArrowLeft className="w-4 h-4 stroke-[2px] shrink-0" />
                    <span>본문으로</span>
                  </button>
                  {view === 'editor' && (
                    <button 
                      onClick={handleBackToList}
                      className="flex items-center gap-0.5 px-1.5 py-1 hover:bg-white rounded-lg transition-colors text-xs font-medium text-[#6A6864] hover:text-[#2C2B29] cursor-pointer whitespace-nowrap"
                      title="설교노트 목록으로"
                    >
                      <ChevronLeft className="w-3.5 h-3.5 stroke-[1.5px] shrink-0" />
                      <span>목록</span>
                    </button>
                  )}
                </>
              ) : (
                <button 
                  onClick={view === 'editor' ? handleBackToList : handleClose}
                  className="p-1 hover:bg-white rounded-lg transition-colors text-[#6A6864] hover:text-[#2C2B29] cursor-pointer"
                  title="뒤로가기"
                >
                  <ChevronLeft className="w-4 h-4 stroke-[1.5px]" />
                </button>
              )}
              <h2 className="hidden sm:flex text-base font-serif font-bold text-[#2C2B29] items-center gap-1.5 truncate">
                <FileEdit className="w-4 h-4 text-[#2C2B29] stroke-[1.5px] shrink-0" />
                <span className="truncate">{view === 'editor' ? '설교노트' : '설교노트 목록'}</span>
              </h2>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 relative z-[110] shrink-0">
              
              {/* Docking Controls */}
              <div className="hidden sm:flex items-center bg-white rounded-xl border border-[#E7E5DF] p-0.5 shadow-2xs mr-1">
                <button onClick={() => onDockPositionChange('right')} className={`p-1 rounded-lg transition-colors ${dockPosition === 'right' ? 'bg-[#FAF0EB] text-[#C96442]' : 'text-[#A3A19B] hover:text-[#2C2B29]'}`} title="우측 화면으로 이동"><PanelRight className="w-3.5 h-3.5 stroke-[1.5px]" /></button>
                <button onClick={() => onDockPositionChange('bottom')} className={`p-1 rounded-lg transition-colors ${dockPosition === 'bottom' ? 'bg-[#FAF0EB] text-[#C96442]' : 'text-[#A3A19B] hover:text-[#2C2B29]'}`} title="하단 화면으로 이동"><PanelBottom className="w-3.5 h-3.5 stroke-[1.5px]" /></button>
                <button onClick={() => onDockPositionChange('free')} className={`p-1 rounded-lg transition-colors ${dockPosition === 'free' ? 'bg-[#FAF0EB] text-[#C96442]' : 'text-[#A3A19B] hover:text-[#2C2B29]'}`} title="자유창(팝업)으로 분리"><Maximize2 className="w-3.5 h-3.5 stroke-[1.5px]" /></button>
              </div>

              {view === 'editor' && (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {syncStatus === 'saved' && (
                    <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5 whitespace-nowrap">
                      <span>✓</span> 저장됨
                    </span>
                  )}
                  {syncStatus === 'saving' && (
                    <span className="text-[10px] text-[#C96442] font-semibold animate-pulse whitespace-nowrap">
                      동기화 중...
                    </span>
                  )}
                  {syncStatus === 'unsaved' && (
                    <span className="text-[10px] text-[#8C877D] font-semibold flex items-center gap-0.5 whitespace-nowrap bg-[#F5F3ED] px-1.5 py-0.5 rounded">
                      <span>✓</span> 로컬보관
                    </span>
                  )}
                  {syncStatus === 'offline' && (
                    <span className="text-[10px] text-[#D97706] font-semibold whitespace-nowrap">
                      오프라인 보관
                    </span>
                  )}
                  <div className="flex flex-col items-end">
                    <button 
                      onClick={async () => {
                        if (activeSermonId) {
                          syncCurrentEditorToLocalSermons(true);
                          const ok = await flushSave();
                          if (ok) {
                            setSyncToastMessage(canSyncCloud ? '설교가 클라우드 서버에 안전하게 동기화되었습니다.' : '설교가 기기(로컬)에 안전하게 저장되었습니다.');
                            setTimeout(() => setSyncToastMessage(null), 3000);
                          }
                        }
                      }}
                      className="flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-[#C96442] hover:bg-[#B55434] active:bg-[#A3472A] text-white rounded-lg sm:rounded-xl transition-colors font-semibold text-xs shadow-2xs cursor-pointer whitespace-nowrap">
                      <Save className="w-3.5 h-3.5 stroke-[1.5px]" /> 저장
                    </button>
                    <span className="text-[9.5px] text-[#2C2B29] font-medium tracking-tight mt-0.5 whitespace-nowrap select-none origin-right">
                      설교를 서버에 저장하세요
                    </span>
                  </div>
                </div>
              )}
              <button onClick={handleClose} className="p-1 hover:bg-[#FAF0EB] hover:text-[#C96442] rounded-lg transition-colors text-[#A3A19B]">
                <X className="w-4 h-4 stroke-[1.5px]" />
              </button>
            </div>
          </div>

          {/* 알림 토스트 배너 (충돌 복사본 분기 안내 및 원격 최신 갱신 알림) */}
          {syncToastMessage && (
            <div className="px-4 py-2 bg-[#FAF0EB] border-b border-[#F1D3C6] text-[#C96442] text-xs font-medium flex items-center justify-between shrink-0 animate-in fade-in duration-200">
              <span className="leading-snug">{syncToastMessage}</span>
              <button 
                onClick={() => setSyncToastMessage(null)}
                className="p-1 hover:bg-[#F2DDD1] rounded text-[#B85332] font-bold ml-2 text-xs shrink-0 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

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
                              {stripHtml(s.content)}
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
                                        {stripHtml(s.content)}
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
                                      {stripHtml(s.content)}
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
              {/* --- 상단 폰트 및 서식 툴바 --- */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 px-3 py-1.5 bg-white border-b border-[#E7E5DF] text-[#2C2B29] relative z-20">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  
                  {/* 1. 폰트명 드롭다운 (5가지 선택) */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setIsFontDropdownOpen(!isFontDropdownOpen);
                        setIsColorDropdownOpen(false);
                        setIsHighlightDropdownOpen(false);
                      }}
                      className="flex items-center gap-1 h-7 px-2 bg-[#FAF9F5] hover:bg-[#F0EEE9] border border-[#E7E5DF] rounded-md text-xs font-medium transition-colors"
                      title="글꼴 변경"
                    >
                      <span className="truncate max-w-[100px] sm:max-w-[120px]">
                        {SERMON_FONTS.find(f => f.id === sermonFontId)?.name.split(' ')[0] || '본명조'}
                      </span>
                      <ChevronDown className="w-3 h-3 text-[#6A6864] shrink-0" />
                    </button>
                    {isFontDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setIsFontDropdownOpen(false)} />
                        <div className="absolute left-0 top-full mt-1 w-44 bg-white border border-[#E7E5DF] rounded-lg shadow-lg z-40 py-1">
                          {SERMON_FONTS.map(font => (
                            <button
                              key={font.id}
                              type="button"
                              onClick={() => {
                                setSermonFontId(font.id);
                                applyFormattingToSelection('font', font.family);
                                setIsFontDropdownOpen(false);
                              }}
                              style={{ fontFamily: font.family }}
                              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#FAF9F5] flex items-center justify-between transition-colors ${sermonFontId === font.id ? 'text-[#C96442] font-bold bg-[#FAF0EB]' : 'text-[#2C2B29]'}`}
                            >
                              <span>{font.name}</span>
                              {sermonFontId === font.id && <span className="text-[10px]">✓</span>}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* 구분선 */}
                  <div className="w-[1px] h-4 bg-[#E7E5DF]" />

                  {/* 2. 폰트 크기 직접 입력창 및 위/아래 화살표 버튼 */}
                  <div className="flex items-center border border-[#E7E5DF] rounded-md bg-[#FAF9F5] h-7 overflow-hidden">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={fontSizeInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFontSizeInput(val);
                        const num = parseInt(val, 10);
                        if (!isNaN(num) && num >= 8 && num <= 60) {
                          setSermonFontSize(num);
                          applyFormattingToSelection('size', num);
                        }
                      }}
                      onBlur={() => {
                        const num = parseInt(fontSizeInput, 10);
                        if (isNaN(num) || num < 8) {
                          setSermonFontSize(10);
                          setFontSizeInput('10');
                          applyFormattingToSelection('size', 10);
                        } else if (num > 60) {
                          setSermonFontSize(60);
                          setFontSizeInput('60');
                          applyFormattingToSelection('size', 60);
                        }
                      }}
                      className="w-8 text-center text-xs font-semibold bg-transparent outline-none text-[#2C2B29]"
                      title="폰트 크기 직접 입력 (8~60)"
                    />
                    <div className="flex flex-col border-l border-[#E7E5DF] h-full">
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.min(60, sermonFontSize + 1);
                          setSermonFontSize(next);
                          setFontSizeInput(String(next));
                          applyFormattingToSelection('size', next);
                        }}
                        className="h-3.5 px-1 hover:bg-[#E7E5DF] flex items-center justify-center text-[#6A6864] transition-colors"
                        title="폰트 크기 증가"
                      >
                        <ChevronUp className="w-2.5 h-2.5 stroke-[2px]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.max(8, sermonFontSize - 1);
                          setSermonFontSize(next);
                          setFontSizeInput(String(next));
                          applyFormattingToSelection('size', next);
                        }}
                        className="h-3.5 px-1 hover:bg-[#E7E5DF] flex items-center justify-center border-t border-[#E7E5DF] text-[#6A6864] transition-colors"
                        title="폰트 크기 감소"
                      >
                        <ChevronDown className="w-2.5 h-2.5 stroke-[2px]" />
                      </button>
                    </div>
                  </div>

                  {/* 구분선 */}
                  <div className="w-[1px] h-4 bg-[#E7E5DF]" />

                  {/* 3. 굵은A, 기울인A, 밑줄A */}
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); }}
                      onClick={() => {
                        applyFormattingToSelection('bold');
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-xs font-bold transition-colors hover:bg-[#F5F3ED] active:bg-[#FAF0EB] active:text-[#C96442] text-[#2C2B29]"
                      title="굵게 (Bold)"
                    >
                      <span className="font-extrabold text-[13px]">A</span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); }}
                      onClick={() => {
                        applyFormattingToSelection('italic');
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-xs italic transition-colors hover:bg-[#F5F3ED] active:bg-[#FAF0EB] active:text-[#C96442] text-[#2C2B29]"
                      title="기울임 (Italic)"
                    >
                      <span className="italic font-serif text-[13px]">A</span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); }}
                      onClick={() => {
                        applyFormattingToSelection('underline');
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-xs underline transition-colors hover:bg-[#F5F3ED] active:bg-[#FAF0EB] active:text-[#C96442] text-[#2C2B29]"
                      title="밑줄 (Underline)"
                    >
                      <span className="underline underline-offset-2 text-[13px]">A</span>
                    </button>
                  </div>

                  {/* 구분선 */}
                  <div className="w-[1px] h-4 bg-[#E7E5DF]" />

                  {/* 4. 글자 색상 버튼 (아이콘 클릭 시 즉시 적용, 옆 화살표 클릭 시 색상 팔레트 열림) */}
                  <div className="relative flex items-center bg-transparent rounded-md hover:bg-[#F5F3ED] transition-colors">
                    {/* 색상 즉시 적용 버튼 */}
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); }}
                      onClick={() => {
                        applyFormattingToSelection('color', textColor);
                      }}
                      className="flex items-center justify-center h-7 px-1.5 rounded-l-md hover:bg-[#EAE8E3] active:bg-[#E2DFD9] transition-colors"
                      title={`글자 색상 적용 (${textColor})`}
                    >
                      <div className="flex flex-col items-center justify-center leading-none">
                        <span className="text-[12px] font-bold text-[#DC2626]">A</span>
                        <div className="w-3.5 h-[2.5px] rounded-full mt-[1px]" style={{ backgroundColor: textColor }} />
                      </div>
                    </button>
                    {/* 색상 선택 화살표 버튼 */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsColorDropdownOpen(!isColorDropdownOpen);
                        setIsFontDropdownOpen(false);
                        setIsHighlightDropdownOpen(false);
                      }}
                      className="flex items-center justify-center h-7 px-1 rounded-r-md hover:bg-[#EAE8E3] transition-colors border-l border-[#E7E5DF]/60"
                      title="글자 색상 선택"
                    >
                      <ChevronDown className="w-2.5 h-2.5 text-[#6A6864]" />
                    </button>
                    {isColorDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setIsColorDropdownOpen(false)} />
                        <div className="absolute left-0 top-full mt-1 p-2 bg-white border border-[#E7E5DF] rounded-lg shadow-lg z-40 w-36">
                          <div className="text-[10px] text-[#A3A19B] font-semibold mb-1.5 px-0.5">글자 색상</div>
                          <div className="grid grid-cols-4 gap-1.5">
                            {TEXT_COLORS.map(c => (
                              <button
                                key={c.value}
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); }}
                                onClick={() => {
                                  setTextColor(c.value);
                                  applyFormattingToSelection('color', c.value);
                                  setIsColorDropdownOpen(false);
                                }}
                                className={`w-6 h-6 rounded-md border flex items-center justify-center transition-transform hover:scale-110 ${textColor === c.value ? 'ring-2 ring-[#C96442] ring-offset-1' : 'border-[#E7E5DF]'}`}
                                style={{ backgroundColor: c.value }}
                                title={c.label}
                              >
                                {textColor === c.value && <span className="text-[9px] text-white contrast-200">✓</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* 5. 형광펜 강조 버튼 (아이콘 클릭 시 즉시 적용, 옆 화살표 클릭 시 색상 팔레트 열림) */}
                  <div className="relative flex items-center bg-transparent rounded-md hover:bg-[#F5F3ED] transition-colors">
                    {/* 형광펜 즉시 적용 버튼 */}
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); }}
                      onClick={() => {
                        applyFormattingToSelection('highlight', highlightColor === 'transparent' ? '#FEF08A' : highlightColor);
                      }}
                      className="flex items-center justify-center h-7 px-1.5 rounded-l-md hover:bg-[#EAE8E3] active:bg-[#E2DFD9] transition-colors"
                      title="형광펜 강조 즉시 적용"
                    >
                      <div className="flex items-center justify-center p-0.5 rounded" style={{ backgroundColor: highlightColor !== 'transparent' ? highlightColor : '#FEF08A' }}>
                        <Highlighter className="w-3.5 h-3.5 text-[#2C2B29] stroke-[1.8px]" />
                      </div>
                    </button>
                    {/* 형광펜 색상 선택 화살표 버튼 */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsHighlightDropdownOpen(!isHighlightDropdownOpen);
                        setIsFontDropdownOpen(false);
                        setIsColorDropdownOpen(false);
                      }}
                      className="flex items-center justify-center h-7 px-1 rounded-r-md hover:bg-[#EAE8E3] transition-colors border-l border-[#E7E5DF]/60"
                      title="형광펜 색상 선택"
                    >
                      <ChevronDown className="w-2.5 h-2.5 text-[#6A6864]" />
                    </button>
                    {isHighlightDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setIsHighlightDropdownOpen(false)} />
                        <div className="absolute left-0 top-full mt-1 p-2 bg-white border border-[#E7E5DF] rounded-lg shadow-lg z-40 w-36">
                          <div className="text-[10px] text-[#A3A19B] font-semibold mb-1.5 px-0.5">형광펜 색상</div>
                          <div className="grid grid-cols-3 gap-1.5">
                            {HIGHLIGHT_COLORS.map(h => (
                              <button
                                key={h.value}
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); }}
                                onClick={() => {
                                  setHighlightColor(h.value);
                                  applyFormattingToSelection('highlight', h.value);
                                  setIsHighlightDropdownOpen(false);
                                }}
                                className={`h-6 rounded-md border text-[10px] flex items-center justify-center transition-transform hover:scale-105 ${highlightColor === h.value ? 'ring-2 ring-[#C96442] ring-offset-1 font-bold' : 'border-[#E7E5DF]'}`}
                                style={{ backgroundColor: h.value === 'transparent' ? '#F5F3ED' : h.value }}
                                title={h.label}
                              >
                                {h.value === 'transparent' ? '없음' : (highlightColor === h.value ? '✓' : '')}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* 구절자동변환 토글 버튼 (카드 없이 심플한 디자인, 활성화 시 주황색, 비활성화 시 검은색) */}
                  <button 
                    type="button"
                    onClick={handleToggleAutoVerse}
                    className={`flex items-center gap-1 px-1.5 py-1 rounded transition-colors text-xs font-semibold shrink-0 cursor-pointer ${
                      isAutoVerseEnabled 
                        ? 'text-[#C96442] hover:bg-[#FAF0EB]' 
                        : 'text-[#2C2B29] hover:bg-[#F5F3ED]'
                    }`}
                    title={isAutoVerseEnabled ? '구절자동변환 켜짐 (누르면 끄기)' : '구절자동변환 꺼짐 (누르면 켜기)'}
                  >
                    <BookOpen className={`w-3.5 h-3.5 stroke-[1.8px] ${isAutoVerseEnabled ? 'text-[#C96442]' : 'text-[#2C2B29]'}`} />
                    <span>구절자동변환</span>
                  </button>

                  {/* 전체 복사 버튼 */}
                  <button 
                    onClick={async () => {
                      if (!editorAreaRef.current) return;
                      const { html, text } = buildClipboardPayload(editorAreaRef.current);
                      try {
                        if (navigator.clipboard && window.ClipboardItem) {
                          const item = new ClipboardItem({
                            'text/html': new Blob([html], { type: 'text/html' }),
                            'text/plain': new Blob([text], { type: 'text/plain' })
                          });
                          await navigator.clipboard.write([item]);
                        } else {
                          await navigator.clipboard.writeText(text);
                        }
                        alert('서식이 포함되어 복사되었습니다.\n(애플 메모, 한글, 구글 독스 등에 바로 붙여넣기 하실 수 있습니다)');
                      } catch {
                        // fallback
                        navigator.clipboard.writeText(text);
                        alert('복사되었습니다.');
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-1 hover:bg-[#F5F3ED] rounded-lg text-[#6A6864] hover:text-[#2C2B29] transition-colors text-xs font-semibold shrink-0 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5 stroke-[1.5px]" /> 전체 복사
                  </button>

                  {/* 저장 모드 상태 배지 (클라우드 실시간 동기화 vs 기기 로컬 무제한 보관) */}
                  <div 
                    className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 border ${
                      canSyncCloud 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                        : 'bg-[#F5F3ED] text-[#6A6864] border-[#E8E3DA]'
                    }`}
                    title={canSyncCloud ? '서버 클라우드에 실시간 저장되어 다른 기기에서도 열람 가능합니다.' : '설교노트가 내 기기(브라우저)에 평생 안전하게 무제한 보관됩니다.'}
                  >
                    {canSyncCloud ? (
                      <>
                        <Cloud className="w-3 h-3 text-emerald-600" />
                        <span>클라우드 동기화</span>
                      </>
                    ) : (
                      <>
                        <HardDrive className="w-3 h-3 text-[#8C877D]" />
                        <span>기기 안전 보관</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="relative flex-1 flex flex-col min-h-0 bg-[#FAF9F5]">
                <input 
                  id="sermon-title-input"
                  type="text" 
                  placeholder="설교 제목..." 
                  style={{ fontFamily: activeFontFamily }}
                  className="w-full text-base font-bold border-b border-[#E7E5DF] outline-none px-6 py-3.5 placeholder:text-[#A3A19B] shrink-0 text-[#2C2B29] bg-white"
                  value={editorTitle}
                  onChange={(e) => {
                    const newTitle = e.target.value;
                    setEditorTitle(newTitle);
                    notifyChange(newTitle, latestEditorRef.current.content, {
                      fontId: sermonFontId,
                      fontSize: sermonFontSize,
                      autoVerseConversion: isAutoVerseEnabled,
                    });
                  }}
                />
                <div
                  key={activeSermonId || 'empty'}
                  ref={editorAreaRef}
                  contentEditable={true}
                  suppressContentEditableWarning
                  onClick={handleEditorClick}
                  onKeyDown={handleEditorKeyDown}
                  onBlur={handleEditorBlur}
                  onPaste={handleEditorPaste}
                  onCopy={handleEditorCopy}
                  onMouseUp={handleSelectionChange}
                  onKeyUp={handleSelectionChange}
                  onInput={(e) => {
                    const newHtml = e.currentTarget.innerHTML;
                    setEditorContent(newHtml);
                    notifyChange(latestEditorRef.current.title, newHtml, {
                      fontId: sermonFontId,
                      fontSize: sermonFontSize,
                      autoVerseConversion: isAutoVerseEnabled,
                    });
                    saveCurrentSelection();
                  }}
                  style={{ 
                    fontFamily: activeFontFamily,
                    fontSize: `${sermonFontSize}px`,
                  }}
                  className="flex-1 w-full p-6 leading-relaxed border-none outline-none overflow-y-auto custom-scrollbar select-text text-[#2C2B29] bg-[#FAF9F5]"
                  data-placeholder="말씀을 이곳에 작성하세요..."
                />
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

