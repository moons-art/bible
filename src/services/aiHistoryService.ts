// NATIONS BIBLE AI 주석 30일간 로컬 기기 보관 서비스
import type { AiCommentaryData } from './geminiCommentaryService';

export interface CommentaryHistoryItem {
  id: string; // reference 기반 고유 ID (예: '창세기 1:1')
  reference: string;
  bookName: string;
  chapter: number;
  verse: number;
  scriptureText: string;
  createdAt: number;
  expiresAt: number; // createdAt + 30일 (ms)
  data: AiCommentaryData;
  storageType?: 'cloud' | 'local'; // 'cloud'는 서버 영구 보관, 'local'은 해당 기기 30일 보관
}

const STORAGE_KEY = 'nations_ai_commentary_history_v1';
const RETENTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30일 (밀리초)

// 동일 세션 내 syncLocalHistoryToCloud 중복 실행 방지 메모리 가드
const syncedSessions = new Set<string>();

// 30일 지난 만료 항목 자동 청소 및 현재 기록 목록 반환
export function getCommentaryHistory(): CommentaryHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const items: CommentaryHistoryItem[] = JSON.parse(raw);
    const now = Date.now();

    // 30일 이내의 유효한 기록만 필터링 (30일 경과 항목은 순차적으로 자동 폐기)
    // 단어 심층 연구, 구절 신학 연구 등 부속 연구는 제외하고 순수 성경 구절 주석만 유지
    const validItems = items.filter(item => {
      if (item.expiresAt <= now) return false;
      if (item.id && (item.id.includes('_etymology') || item.id.includes('_passage'))) return false;
      if ((item as any).type && (item as any).type !== 'commentary') return false;
      return true;
    }).map(item => ({
      ...item,
      storageType: item.storageType || 'local' as const
    }));

    // 만료된 항목이나 부속 연구가 제거된 경우 스토리지 즉시 동기화
    if (validItems.length !== items.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validItems));
    }

    // 최신 생성순 정렬
    return validItems.sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    console.error('Failed to load AI commentary history:', err);
    return [];
  }
}

// 특정 구절이 30일 내 기록에 존재하는지 확인 및 반환
export function getCommentaryFromHistory(reference: string): AiCommentaryData | null {
  const history = getCommentaryHistory();
  const normalizedRef = reference.trim();
  const found = history.find(item => item.reference.trim() === normalizedRef);
  if (found && found.expiresAt > Date.now()) {
    return found.data;
  }
  return null;
}

// 주석 분석 결과를 30일 보관용으로 저장 (개수 제한 없이 30일간 보관, 30일 경과 시 순차 삭제)
export function saveCommentaryToHistory(data: AiCommentaryData, storageType: 'cloud' | 'local' = 'local'): void {
  try {
    const now = Date.now();
    const history = getCommentaryHistory();
    const normalizedRef = data.reference.trim();

    // 기존 동일 구절이 있다면 갱신 처리
    const filtered = history.filter(item => item.reference.trim() !== normalizedRef);

    const newItem: CommentaryHistoryItem = {
      id: normalizedRef,
      reference: normalizedRef,
      bookName: data.reference.split(' ')[0] || '',
      chapter: parseInt(data.reference.split(' ')[1]?.split(':')[0] || '1', 10),
      verse: parseInt(data.reference.split(':')[1] || '1', 10),
      scriptureText: data.scriptureText,
      createdAt: now,
      expiresAt: now + RETENTION_PERIOD_MS, // 생성일로부터 30일 뒤 만료
      data,
      storageType,
    };

    filtered.unshift(newItem);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (quotaErr) {
      // 브라우저 5MB 용량 한도(QuotaExceededError)에 도달할 경우에만
      // 만료일이 가장 가까운 오래된 항목부터 점진적으로 정리하여 에러 방어
      console.warn('[aiHistoryService] Storage quota exceeded, pruning oldest items:', quotaErr);
      const sortedByOldest = [...filtered].sort((a, b) => a.expiresAt - b.expiresAt);
      const pruned = sortedByOldest.slice(Math.ceil(sortedByOldest.length * 0.2)); // 가장 오래된 20%만 안전 정리
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
      } catch (e) {}
    }

    // 기록 갱신 이벤트 전파
    window.dispatchEvent(new CustomEvent('ai-history-updated'));
  } catch (err) {
    console.error('Failed to save commentary to history:', err);
  }
}

// 특정 기록 삭제
export function deleteCommentaryHistoryItem(reference: string): void {
  try {
    const history = getCommentaryHistory();
    const filtered = history.filter(item => item.reference.trim() !== reference.trim());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));

    // 로그인된 회원의 경우 클라우드에서도 비동기 삭제 및 카운트 동기화
    import('../api/firebaseConfig').then(({ auth, db }) => {
      if (auth.currentUser) {
        const uid = auth.currentUser.uid;
        import('firebase/firestore').then(async ({ doc, deleteDoc }) => {
          try {
            const docId = reference.trim().replace(/\s+/g, '_');
            const docRef = doc(db, 'users', uid, 'cloudCommentaries', docId);
            await deleteDoc(docRef);
            await getCloudCommentaryCount(uid);
            window.dispatchEvent(new CustomEvent('ai-history-updated'));
          } catch (e) {
            console.warn('[aiHistoryService] Cloud delete error:', e);
          }
        });
      }
    });

    window.dispatchEvent(new CustomEvent('ai-history-updated'));
  } catch (err) {
    console.error('Failed to delete history item:', err);
  }
}

// 전체 기록 삭제
export function clearAllCommentaryHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('ai-history-updated'));
  } catch (err) {
    console.error('Failed to clear history:', err);
  }
}

// 남은 일수 계산 헬퍼 (예: 'D-9', '9일 남음')
export function getRemainingDays(expiresAt: number): number {
  const diffMs = expiresAt - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// 주석 클라우드 구독 시, 기존 로컬 30일 보관 기록을 Firestore 클라우드로 자동 안전 동기화(이동/승격)
export async function syncLocalHistoryToCloud(uid: string): Promise<number> {
  // 세션당 1회만 실행하도록 무한 반복 원천 차단
  if (syncedSessions.has(uid)) return 0;
  syncedSessions.add(uid);

  try {
    const history = getCommentaryHistory();
    if (history.length === 0) return 0;

    const { doc, getDoc, setDoc, updateDoc, increment, collection, getDocs } = await import('firebase/firestore');
    const { db } = await import('../api/firebaseConfig');

    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return 0;

    const profile = userSnap.data();
    const limit = profile.cloudCommentaryLimit || 0;
    if (limit <= 0) return 0; // 클라우드 구독 회원이 아니면 패스

    // 기존 클라우드 문서 ID들을 1회의 getDocs로 수집하여 개별 getDoc 30회 폭증 방지
    const cloudColRef = collection(db, 'users', uid, 'cloudCommentaries');
    const existingSnap = await getDocs(cloudColRef);
    const existingIds = new Set(existingSnap.docs.map(d => d.id));

    let syncedCount = 0;
    for (const item of history) {
      const docId = item.reference.replace(/\//g, '_').trim();
      if (!existingIds.has(docId)) {
        const cloudRef = doc(db, 'users', uid, 'cloudCommentaries', docId);
        await setDoc(cloudRef, {
          ...item.data,
          reference: item.reference,
          scriptureText: item.scriptureText,
          savedAt: item.createdAt || Date.now(),
          type: 'commentary',
          syncedFromLocal: true,
        }, { merge: true });
        existingIds.add(docId);
        syncedCount++;
      }
    }

    if (syncedCount > 0) {
      await updateDoc(userRef, {
        usedCloudCommentaryCount: increment(syncedCount)
      });
      console.log(`[aiHistoryService] ☁️ 로컬 주석 기록 ${syncedCount}개가 클라우드로 안전하게 일괄 동기화되었습니다.`);
    }

    return syncedCount;
  } catch (err) {
    console.error('[aiHistoryService] Failed to sync local history to cloud:', err);
    return 0;
  }
}

/**
 * Firestore cloudCommentaries 서브컬렉션에서 저장된 모든 주석 목록을 조회하여 로컬 형식으로 변환
 * (단어 심층 연구, 구절 신학 연구 등 부속 연구 문서는 제외하고 순수 성경 구절 주석만 로드)
 */
export async function fetchCloudCommentaryHistory(uid: string): Promise<CommentaryHistoryItem[]> {
  try {
    const { collection, getDocs } = await import('firebase/firestore');
    const { db } = await import('../api/firebaseConfig');
    const colRef = collection(db, 'users', uid, 'cloudCommentaries');
    const snap = await getDocs(colRef);
    const list: CommentaryHistoryItem[] = [];

    snap.forEach(d => {
      const data = d.data();
      // 단어 심층 연구(word), 구절 신학 연구(passage) 등 부속 연구 문서는 제외하고 순수 성경 구절 주석만 로드
      if (data.type && data.type !== 'commentary') return;
      if (d.id.includes('_etymology') || d.id.includes('_passage')) return;

      const ref = data.reference || d.id.replace(/_/g, ' ');
      const bookName = ref.split(' ')[0] || '';
      const chVs = ref.split(' ')[1] || '';
      const chapter = parseInt(chVs.split(':')[0] || '1', 10);
      const verse = parseInt(chVs.split(':')[1] || '1', 10);

      list.push({
        id: d.id,
        reference: ref,
        bookName,
        chapter,
        verse,
        scriptureText: data.scriptureText || '',
        createdAt: data.savedAt || Date.now(),
        expiresAt: Date.now() + 100 * 365 * 24 * 60 * 60 * 1000, // 클라우드 영구 보관 (100년)
        data: (data.data || data) as any,
        storageType: 'cloud',
      });
    });

    list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  } catch (err) {
    console.error('[aiHistoryService] Failed to fetch cloud commentary history:', err);
    return [];
  }
}

/**
 * Firestore cloudCommentaries 서브컬렉션의 순수 성경 구절 주석(type: 'commentary') 문서 수를 0초 만에 집계
 * (단어 심층 연구, 구절 신학 연구 등은 제외하고 순수 성경 구절 주석 개수만 정확히 집계)
 * 동시에 상위 유저 문서(users/{uid})의 usedCloudCommentaryCount 필드를 자동 동기화
 */
export async function getCloudCommentaryCount(uid: string): Promise<number> {
  try {
    const { collection, getCountFromServer, doc, getDoc, query, where } = await import('firebase/firestore');
    const { db } = await import('../api/firebaseConfig');

    // 1. 상위 유저 문서(users/{uid})의 usedCloudCommentaryCount 캐시 필드 먼저 확인 (0~1회 가벼운 읽기)
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (typeof userData.usedCloudCommentaryCount === 'number') {
        return userData.usedCloudCommentaryCount;
      }
    }

    // 2. 캐시가 없는 경우 문서 본문 다운로드(getDocs) 대신 getCountFromServer와 type: 'commentary' 쿼리로 정밀 집계
    //    (원어 단어 연구 _etymology, 구절 신학 연구 _passage 등의 부속 문서 제외)
    const colRef = collection(db, 'users', uid, 'cloudCommentaries');
    const q = query(colRef, where('type', '==', 'commentary'));
    const countSnap = await getCountFromServer(q);
    return countSnap.data().count;
  } catch (err) {
    console.warn('[aiHistoryService] getCloudCommentaryCount non-fatal:', err);
    return 0;
  }
}

/**
 * AI 패널의 historyList와 100% 동일하게 로컬과 클라우드를 합산한 총 주석 개수를 계산
 */
export async function getTotalMergedCommentaryCount(uid?: string | null): Promise<number> {
  const local = getCommentaryHistory();
  if (!uid) {
    return local.length;
  }

  try {
    const cloudItems = await fetchCloudCommentaryHistory(uid);
    if (!cloudItems || cloudItems.length === 0) {
      return local.length;
    }

    const mergedMap = new Map<string, boolean>();
    local.forEach(item => mergedMap.set(item.reference.trim(), true));
    cloudItems.forEach(item => mergedMap.set(item.reference.trim(), true));
    return mergedMap.size;
  } catch (err) {
    console.warn('[aiHistoryService] getTotalMergedCommentaryCount fallback:', err);
    return local.length;
  }
}


