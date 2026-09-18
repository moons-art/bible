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

// 30일 지난 만료 항목 자동 청소 및 현재 기록 목록 반환
export function getCommentaryHistory(): CommentaryHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const items: CommentaryHistoryItem[] = JSON.parse(raw);
    const now = Date.now();

    // 30일 이내의 유효한 기록만 필터링 (30일 경과 항목 자동 폐기)
    const validItems = items.filter(item => item.expiresAt > now);

    // 만료된 항목이 제거된 경우 스토리지 즉시 동기화
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

// 주석 분석 결과를 30일 보관용으로 저장
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));

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
