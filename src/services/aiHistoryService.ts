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
}

const STORAGE_KEY = 'nations_ai_commentary_history_v1';
const RETENTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30일 (밀리초)
const MAX_HISTORY_ITEMS = 30; // localStorage 5MB 초과 방지를 위한 최대 보관 개수

// 30일 지난 만료 항목 자동 청소 및 현재 기록 목록 반환
export function getCommentaryHistory(): CommentaryHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const items: CommentaryHistoryItem[] = JSON.parse(raw);
    const now = Date.now();

    // 30일 이내의 유효한 기록만 필터링 (30일 경과 항목 자동 폐기)
    // 단어 심층 연구, 구절 신학 연구 등 부속 연구는 제외하고 순수 성경 구절 주석만 유지
    const validItems = items.filter(item => {
      if (item.expiresAt <= now) return false;
      if (item.id && (item.id.includes('_etymology') || item.id.includes('_passage'))) return false;
      if ((item as any).type && (item as any).type !== 'commentary') return false;
      return true;
    });

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

// 주석 분석 결과를 30일 보관용으로 저장 (최대 30개 및 용량 안전 가드)
export function saveCommentaryToHistory(data: AiCommentaryData): void {
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
      expiresAt: now + RETENTION_PERIOD_MS,
      data,
    };

    filtered.unshift(newItem);
    const limited = filtered.slice(0, MAX_HISTORY_ITEMS);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
    } catch (quotaErr) {
      // 용량 초과(QuotaExceededError) 방어: 오래된 절반 폐기 후 재시도
      console.warn('[aiHistoryService] Storage quota exceeded, pruning old items:', quotaErr);
      const pruned = limited.slice(0, Math.max(5, Math.floor(limited.length / 2)));
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
  try {
    const history = getCommentaryHistory();
    if (history.length === 0) return 0;

    const { doc, getDoc, setDoc, updateDoc, increment } = await import('firebase/firestore');
    const { db } = await import('../api/firebaseConfig');

    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return 0;

    const profile = userSnap.data();
    const limit = profile.cloudCommentaryLimit || 0;
    if (limit <= 0) return 0; // 클라우드 구독 회원이 아니면 패스

    let syncedCount = 0;
    for (const item of history) {
      const docId = item.reference.replace(/\//g, '_').trim();
      const cloudRef = doc(db, 'users', uid, 'cloudCommentaries', docId);
      const existingSnap = await getDoc(cloudRef);

      if (!existingSnap.exists()) {
        await setDoc(cloudRef, {
          ...item.data,
          reference: item.reference,
          scriptureText: item.scriptureText,
          savedAt: item.createdAt || Date.now(),
          type: 'commentary',
          syncedFromLocal: true,
        }, { merge: true });
        syncedCount++;
      }
    }

    if (syncedCount > 0) {
      await updateDoc(userRef, {
        usedCloudCommentaryCount: increment(syncedCount)
      });
      console.log(`[aiHistoryService] ☁️ 로컬 주석 기록 ${syncedCount}개가 클라우드로 자동 동기화되었습니다.`);
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
        data: data as any,
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
    const { collection, getCountFromServer, query, where, doc, updateDoc, getDocs } = await import('firebase/firestore');
    const { db } = await import('../api/firebaseConfig');
    const colRef = collection(db, 'users', uid, 'cloudCommentaries');
    
    // 1. type == 'commentary' 쿼리로 0초 만에 고속 집계
    const q = query(colRef, where('type', '==', 'commentary'));
    const snap = await getCountFromServer(q);
    let count = snap.data().count;

    // 2. 만약 과거 문서 중 type 필드가 누락된 경우를 대비한 안전 체크
    if (count === 0) {
      const allSnap = await getCountFromServer(colRef);
      if (allSnap.data().count > 0) {
        const docsSnap = await getDocs(colRef);
        count = docsSnap.docs.filter(d => {
          const dt = d.data();
          return dt.type === 'commentary' || (!dt.type && !d.id.includes('_'));
        }).length;
      }
    }

    // 상위 유저 문서의 usedCloudCommentaryCount 필드도 순수 성경구절 주석 수로 백그라운드 자동 보정
    const userRef = doc(db, 'users', uid);
    updateDoc(userRef, { usedCloudCommentaryCount: count }).catch(() => {});

    return count;
  } catch (err) {
    console.warn('[aiHistoryService] getCloudCommentaryCount non-fatal:', err);
    return 0;
  }
}

