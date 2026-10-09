import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import { db } from '../api/firebaseConfig';

export interface SermonDocument {
  id: string;
  title: string;
  content: string;
  date: string;
  version?: number;
  updatedAt?: number;
  fontId?: string;
  fontSize?: number;
  autoVerseConversion?: boolean;
}

export type SyncStatus = 'saved' | 'saving' | 'unsaved' | 'offline';

export interface UseSermonSyncOptions {
  userId: string | null;
  sermonId: string | null;
  canSyncCloud?: boolean;
  initialTitle?: string;
  initialContent?: string;
  initialVersion?: number;
  /** 스로틀 주기 (기본 1분: 60000ms) */
  throttleMs?: number;
  /** 로컬 캐시 디바운스 주기 (기본 300ms) */
  localDraftDebounceMs?: number;
  /** 충돌 복사본 발생 시 콜백 */
  onConflictCreated?: (newDocId: string, copyTitle: string) => void;
  /** 원격 최신본으로 자동 동기화 시 콜백 */
  onRemoteUpdated?: (updatedDoc: SermonDocument) => void;
  /** 동기화 경고 알림 콜백 */
  onWarning?: (message: string) => void;
}

export interface UseSermonSyncReturn {
  syncStatus: SyncStatus;
  isDirty: boolean;
  lastSavedAt: number | null;
  currentVersion: number;
  /** 수동 즉시 저장 플러시 */
  flushSave: () => Promise<boolean>;
  /** 에디터 입력 통지 (로컬 캐시 및 스로틀 저장 큐잉) */
  notifyChange: (
    title: string, 
    content: string, 
    extra?: { fontId?: string; fontSize?: number; autoVerseConversion?: boolean }
  ) => void;
  /** 새 문서로 전환할 때 상태 초기화 */
  resetSyncState: (doc: { 
    id: string; 
    title: string; 
    content: string; 
    version?: number;
    fontId?: string;
    fontSize?: number;
    autoVerseConversion?: boolean;
  }) => void;
}

const LOCAL_DRAFT_PREFIX = 'sermon_draft_';

export function useSermonSync({
  userId,
  sermonId,
  canSyncCloud = false,
  initialTitle = '',
  initialContent = '',
  initialVersion = 1,
  throttleMs = 60000, // 1분(60초) 스로틀
  localDraftDebounceMs = 300, // 0.3초 로컬 드래프트
  onConflictCreated,
  onRemoteUpdated,
  onWarning,
}: UseSermonSyncOptions): UseSermonSyncReturn {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('saved');
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [currentVersion, setCurrentVersion] = useState<number>(initialVersion || 1);

  // 최신 에디터 상태를 ref로 보관 (이탈 이벤트 및 클로저 문제 원천 방어)
  const currentDataRef = useRef<{ 
    title: string; 
    content: string; 
    fontId?: string; 
    fontSize?: number; 
    autoVerseConversion?: boolean; 
  }>({
    title: initialTitle,
    content: initialContent,
  });

  // 서버에 안전하게 기록된 마지막 상태 (더티 체킹 기준)
  const lastCommittedDataRef = useRef<{ 
    title: string; 
    content: string; 
    version: number;
    fontId?: string; 
    fontSize?: number; 
    autoVerseConversion?: boolean; 
  }>({
    title: initialTitle,
    content: initialContent,
    version: initialVersion || 1,
  });

  // 동시성 락 및 타이머 참조
  const isSavingMutexRef = useRef(false);
  const localDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextScheduledSaveTimeRef = useRef<number>(0);
  const isMountedRef = useRef(true);

  // 상위 콜백 ref 래핑 (리렌더링 시 불필요한 이펙트 트리거 차단)
  const onConflictCreatedRef = useRef(onConflictCreated);
  onConflictCreatedRef.current = onConflictCreated;
  const onWarningRef = useRef(onWarning);
  onWarningRef.current = onWarning;
  const onRemoteUpdatedRef = useRef(onRemoteUpdated);
  onRemoteUpdatedRef.current = onRemoteUpdated;

  // 1) 엄격한 더티 체킹 함수 (제목 및 HTML 본문, 폰트/크기/자동변환 완벽 비교)
  const checkIsDirty = useCallback(() => {
    const curTitle = currentDataRef.current.title.trim();
    const curContent = currentDataRef.current.content;
    const curFontId = currentDataRef.current.fontId;
    const curFontSize = currentDataRef.current.fontSize;
    const curAuto = currentDataRef.current.autoVerseConversion;

    const committedTitle = lastCommittedDataRef.current.title.trim();
    const committedContent = lastCommittedDataRef.current.content;
    const committedFontId = lastCommittedDataRef.current.fontId;
    const committedFontSize = lastCommittedDataRef.current.fontSize;
    const committedAuto = lastCommittedDataRef.current.autoVerseConversion;

    return curTitle !== committedTitle || 
      curContent !== committedContent || 
      curFontId !== committedFontId || 
      curFontSize !== committedFontSize || 
      curAuto !== committedAuto;
  }, []);

  // 2) 로컬 스토리지 키
  const getDraftKey = useCallback((docId: string) => `${LOCAL_DRAFT_PREFIX}${docId}`, []);

  // 3) 로컬 우선 저장 (Local-First 0.3s Debounce, 서버 호출 0회)
  const saveLocalDraft = useCallback((
    docId: string, 
    title: string, 
    content: string, 
    extra?: { fontId?: string; fontSize?: number; autoVerseConversion?: boolean }
  ) => {
    try {
      const payload = {
        title,
        content,
        fontId: extra?.fontId,
        fontSize: extra?.fontSize,
        autoVerseConversion: extra?.autoVerseConversion,
        timestamp: Date.now(),
      };
      localStorage.setItem(getDraftKey(docId), JSON.stringify(payload));
    } catch (e) {
      console.warn('[useSermonSync] 로컬 드래프트 저장 실패:', e);
    }
  }, [getDraftKey]);

  // 로컬 드래프트 삭제 (성공적 커밋 후)
  const clearLocalDraft = useCallback((docId: string) => {
    try {
      localStorage.removeItem(getDraftKey(docId));
    } catch (e) {}
  }, [getDraftKey]);

  // 4) Firestore 안전 저장 (낙관적 락 & 트랜잭션 충돌 복사본 분기)
  const commitToFirestore = useCallback(async (): Promise<boolean> => {
    if (!userId || !sermonId) {
      setSyncStatus('saved');
      setIsDirty(false);
      return true;
    }

    // ✅ 클라우드 권한이 없는 회원은 로컬 기기 보관만으로 저장 완료 처리
    if (!canSyncCloud) {
      setSyncStatus('saved');
      setIsDirty(false);
      setLastSavedAt(Date.now());
      return true;
    }

    // 더티 체킹: 변경 사항이 전혀 없다면 네트워크 호출 단 1회도 발생하지 않음
    if (!checkIsDirty()) {
      setSyncStatus('saved');
      setIsDirty(false);
      return true;
    }

    // 저장 락(Mutex): 이미 저장 중이면 중복 요청 방어
    if (isSavingMutexRef.current) {
      return false;
    }

    isSavingMutexRef.current = true;
    setSyncStatus('saving');

    const titleToSave = currentDataRef.current.title.trim() || '제목 없음';
    const contentToSave = currentDataRef.current.content;
    const fontIdToSave = currentDataRef.current.fontId;
    const fontSizeToSave = currentDataRef.current.fontSize;
    const autoVerseConversionToSave = currentDataRef.current.autoVerseConversion;

    const baseVersion = lastCommittedDataRef.current.version;
    const currentDate = new Date().toISOString().split('T')[0];

    try {
      const docRef = doc(db, 'users', userId, 'sermons', sermonId);

      // Firestore 트랜잭션으로 낙관적 락(Optimistic Concurrency Control) 수행
      const transactionResult = await runTransaction(db, async (tx) => {
        const docSnap = await tx.get(docRef);

        const payloadToSave: any = {
          title: titleToSave,
          content: contentToSave,
          date: currentDate,
          updatedAt: Date.now(),
        };
        if (fontIdToSave !== undefined) payloadToSave.fontId = fontIdToSave;
        if (fontSizeToSave !== undefined) payloadToSave.fontSize = fontSizeToSave;
        if (autoVerseConversionToSave !== undefined) payloadToSave.autoVerseConversion = autoVerseConversionToSave;

        if (!docSnap.exists()) {
          // 문서가 없는 최초 저장 시점: version 1로 신규 생성
          payloadToSave.version = 1;
          tx.set(docRef, payloadToSave);
          return { status: 'created', newVersion: 1 };
        }

        const remoteData = docSnap.data();
        const serverVersion = typeof remoteData.version === 'number' ? remoteData.version : 1;

        // 충돌 검사: 서버 버전이 클라이언트 기준 버전보다 크면 다른 기기에서 저장한 것임!
        if (serverVersion > baseVersion) {
          return { status: 'conflict', serverVersion, remoteData };
        }

        // 버전 일치: 정상 업데이트 (version + 1)
        const nextVersion = serverVersion + 1;
        payloadToSave.version = nextVersion;
        tx.update(docRef, payloadToSave);

        return { status: 'updated', newVersion: nextVersion };
      });

      // --- 충돌 발생 시 분기 처리 ---
      if (transactionResult.status === 'conflict') {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const conflictDocId = `sermon-conflict-${Date.now()}`;
        const copyTitle = `[충돌 복사본] ${titleToSave} (${timeStr})`;

        // 원본 문서를 절대 덮어쓰지 않고, 현재 작성분을 별도 신규 문서로 보존
        const conflictRef = doc(db, 'users', userId, 'sermons', conflictDocId);
        await setDoc(conflictRef, {
          title: copyTitle,
          content: contentToSave,
          date: currentDate,
          version: 1,
          fontId: fontIdToSave,
          fontSize: fontSizeToSave,
          autoVerseConversion: autoVerseConversionToSave,
          updatedAt: Date.now(),
        });

        clearLocalDraft(sermonId);
        onConflictCreatedRef.current?.(conflictDocId, copyTitle);
        onWarningRef.current?.('다른 기기에서 수정된 최신 내용이 있어 현재 내용은 별도 [충돌 복사본]으로 안전하게 저장되었습니다.');

        setSyncStatus('saved');
        setIsDirty(false);
        return false;
      }

      // --- 정상 저장 완료 ---
      const resolvedVersion = transactionResult.newVersion || (baseVersion + 1);
      lastCommittedDataRef.current = {
        title: titleToSave,
        content: contentToSave,
        fontId: fontIdToSave,
        fontSize: fontSizeToSave,
        autoVerseConversion: autoVerseConversionToSave,
        version: resolvedVersion,
      };

      setCurrentVersion(resolvedVersion);
      clearLocalDraft(sermonId);
      setLastSavedAt(Date.now());
      setSyncStatus('saved');
      setIsDirty(false);
      return true;

    } catch (error: any) {
      console.error('[useSermonSync] Firestore 저장 실패:', error);
      // 오프라인이거나 네트워크 에러 시: 로컬에는 안전하게 남아있으므로 offline 상태 표기
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setSyncStatus('offline');
      } else {
        setSyncStatus('unsaved');
      }
      return false;
    } finally {
      isSavingMutexRef.current = false;
    }
  }, [userId, sermonId, canSyncCloud, checkIsDirty, clearLocalDraft]);

  // 5) 스로틀 큐잉 및 로컬 캐싱 트리거 (에디터 타이핑/서식 변경 시 호출)
  const notifyChange = useCallback((
    title: string, 
    content: string, 
    extra?: { fontId?: string; fontSize?: number; autoVerseConversion?: boolean }
  ) => {
    currentDataRef.current = { 
      title, 
      content,
      fontId: extra?.fontId !== undefined ? extra.fontId : currentDataRef.current.fontId,
      fontSize: extra?.fontSize !== undefined ? extra.fontSize : currentDataRef.current.fontSize,
      autoVerseConversion: extra?.autoVerseConversion !== undefined ? extra.autoVerseConversion : currentDataRef.current.autoVerseConversion,
    };
    const dirty = checkIsDirty();
    setIsDirty(dirty);

    if (!dirty) {
      setSyncStatus('saved');
      return;
    }

    setSyncStatus('unsaved');

    // [Local-First] 0.3초 디바운스로 로컬 저장소 즉시 보관
    if (sermonId) {
      if (localDraftTimerRef.current) clearTimeout(localDraftTimerRef.current);
      localDraftTimerRef.current = setTimeout(() => {
        saveLocalDraft(sermonId, title, content, {
          fontId: currentDataRef.current.fontId,
          fontSize: currentDataRef.current.fontSize,
          autoVerseConversion: currentDataRef.current.autoVerseConversion,
        });
      }, localDraftDebounceMs);
    }

    // [Throttle] 타이핑 중에는 항상 '로컬 보관됨(unsaved)' 상태로 유지되며, 60초 동안 서버 쓰기를 철저히 유예함
    // 이미 1분 지연 타이머가 걸려있지 않은 경우에만 60초 뒤 1회 실행 타이머 등록
    if (!throttleTimerRef.current) {
      throttleTimerRef.current = setTimeout(async () => {
        throttleTimerRef.current = null;
        await commitToFirestore();
      }, throttleMs);
    }
  }, [sermonId, checkIsDirty, saveLocalDraft, localDraftDebounceMs, throttleMs, commitToFirestore]);

  // 6) 플러시(Flush) - 즉각 저장
  const flushSave = useCallback(async (): Promise<boolean> => {
    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
    if (localDraftTimerRef.current) {
      clearTimeout(localDraftTimerRef.current);
      localDraftTimerRef.current = null;
    }
    return await commitToFirestore();
  }, [commitToFirestore]);

  // commitToFirestore 및 checkIsDirty 최신 참조 보관 (리렌더링 시 이펙트 클린업 오작동 원천 차단)
  const commitToFirestoreRef = useRef(commitToFirestore);
  commitToFirestoreRef.current = commitToFirestore;
  const checkIsDirtyRef = useRef(checkIsDirty);
  checkIsDirtyRef.current = checkIsDirty;

  // 7) 새 문서 진입 시 동기화 기준 초기화
  const resetSyncState = useCallback((docItem: { 
    id: string; 
    title: string; 
    content: string; 
    version?: number;
    fontId?: string;
    fontSize?: number;
    autoVerseConversion?: boolean;
  }) => {
    currentDataRef.current = { 
      title: docItem.title, 
      content: docItem.content,
      fontId: docItem.fontId,
      fontSize: docItem.fontSize,
      autoVerseConversion: docItem.autoVerseConversion,
    };
    lastCommittedDataRef.current = {
      title: docItem.title,
      content: docItem.content,
      fontId: docItem.fontId,
      fontSize: docItem.fontSize,
      autoVerseConversion: docItem.autoVerseConversion,
      version: docItem.version || 1,
    };
    setCurrentVersion(docItem.version || 1);
    setIsDirty(false);
    setSyncStatus('saved');
    nextScheduledSaveTimeRef.current = 0;
    if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current);
    if (localDraftTimerRef.current) clearTimeout(localDraftTimerRef.current);
  }, []);

  // 8) 생명주기 플러시 (창 전환, 탭 닫기, 노트북 덮개 닫기)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // 백그라운드 전환 시 즉시 플러시
        if (checkIsDirtyRef.current()) {
          commitToFirestoreRef.current();
        }
      }
    };

    const handlePageHide = () => {
      // 브라우저 닫기/새로고침 시 플러시
      if (checkIsDirtyRef.current()) {
        commitToFirestoreRef.current();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
    };
  }, []);

  // 9) 화면 복귀 시 최신본 자동 동기화 (Focus Re-validation)
  useEffect(() => {
    const handleFocus = async () => {
      if (!userId || !sermonId || !canSyncCloud) return;

      try {
        const docRef = doc(db, 'users', userId, 'sermons', sermonId);
        const snap = await getDoc(docRef);
        if (!snap.exists()) return;

        const remote = snap.data();
        const serverVersion = typeof remote.version === 'number' ? remote.version : 1;
        const localVersion = lastCommittedDataRef.current.version;

        // 다른 기기에서 저장하여 서버 버전이 더 높은 경우
        if (serverVersion > localVersion) {
          const currentlyDirty = checkIsDirtyRef.current();

          if (!currentlyDirty) {
            // 현재 기기에 미저장된 타이핑 분량이 없다면: 최신 내용으로 조용히 자동 갱신
            const updatedDoc: SermonDocument = {
              id: sermonId,
              title: remote.title || '',
              content: remote.content || '',
              date: remote.date || '',
              version: serverVersion,
            };
            resetSyncState(updatedDoc);
            onRemoteUpdatedRef.current?.(updatedDoc);
          } else {
            // 현재 기기에도 미저장 작업물이 있는 경우: 덮어쓰지 않고 경고 안내
            onWarningRef.current?.('다른 기기에서 새 변경 사항이 감지되었습니다. 현재 작성 중인 내용을 저장하면 안전하게 충돌 복사본이 보존됩니다.');
          }
        }
      } catch (err) {
        console.warn('[useSermonSync] Focus Re-validation 실패 (오프라인 등):', err);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [userId, sermonId, resetSyncState]);

  // 10) 언마운트 시 클린업 및 최종 플러시 (설교문 변경 시 또는 사이드바 닫힐 때만 1회 실행)
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (checkIsDirtyRef.current()) {
        commitToFirestoreRef.current();
      }
      if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current);
      if (localDraftTimerRef.current) clearTimeout(localDraftTimerRef.current);
    };
  }, [sermonId]);

  return {
    syncStatus,
    isDirty,
    lastSavedAt,
    currentVersion,
    flushSave,
    notifyChange,
    resetSyncState,
  };
}
