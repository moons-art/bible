import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../api/firebaseConfig';
import { addCreditsToUser } from './userService';

// ── 1. 프로모션 설정 인터페이스 ─────────────────────────────────────────
export interface PromotionSettings {
  enabled: boolean;
  name: string;
  description: string;
  bonusCredits: number; // 10, 50, 100 등
  updatedAt?: number;
}

export const DEFAULT_PROMOTION_SETTINGS: PromotionSettings = {
  enabled: true,
  name: '특별혜택기간',
  description: '200크래딧 제공',
  bonusCredits: 200,
};

// ── 2. 추천인 혜택 설정 인터페이스 ─────────────────────────────────────
export interface ReferralSettings {
  bonusCredits: number; // 50 또는 100
  updatedAt?: number;
}

export const DEFAULT_REFERRAL_SETTINGS: ReferralSettings = {
  bonusCredits: 50,
};

// ── 3. 친구 추천 신청 요청 인터페이스 ──────────────────────────────────
export interface ReferralRequest {
  id: string;
  referrerName: string;
  referrerEmail: string;
  referrerUid?: string;
  friendName?: string;
  friendEmail?: string;
  bonusCredits: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  approvedAt?: number;
  note?: string;
}

/**
 * 프로모션 설정 조회
 */
export async function getPromotionSettings(): Promise<PromotionSettings> {
  try {
    const snap = await getDoc(doc(db, 'system_settings', 'promotion'));
    if (snap.exists()) {
      return { ...DEFAULT_PROMOTION_SETTINGS, ...snap.data() } as PromotionSettings;
    }
  } catch (e) {
    console.warn('[promotionService] getPromotionSettings failed, using default:', e);
  }
  return DEFAULT_PROMOTION_SETTINGS;
}

/**
 * 프로모션 설정 저장 (관리자 전용)
 */
export async function savePromotionSettings(settings: PromotionSettings): Promise<void> {
  const ref = doc(db, 'system_settings', 'promotion');
  await setDoc(ref, {
    ...settings,
    updatedAt: Date.now()
  }, { merge: true });
}

/**
 * 추천인 혜택 설정 조회
 */
export async function getReferralSettings(): Promise<ReferralSettings> {
  try {
    const snap = await getDoc(doc(db, 'system_settings', 'referral'));
    if (snap.exists()) {
      return { ...DEFAULT_REFERRAL_SETTINGS, ...snap.data() } as ReferralSettings;
    }
  } catch (e) {
    console.warn('[promotionService] getReferralSettings failed, using default:', e);
  }
  return DEFAULT_REFERRAL_SETTINGS;
}

/**
 * 추천인 혜택 설정 저장 (관리자 전용)
 */
export async function saveReferralSettings(settings: ReferralSettings): Promise<void> {
  const ref = doc(db, 'system_settings', 'referral');
  await setDoc(ref, {
    ...settings,
    updatedAt: Date.now()
  }, { merge: true });
}

/**
 * 이용권 결제창에서 친구 추천 신청 접수
 */
export async function submitReferralRequest(params: {
  referrerName: string;
  referrerEmail: string;
  referrerUid?: string;
  friendName?: string;
  friendEmail?: string;
  bonusCredits: number;
}): Promise<string> {
  const col = collection(db, 'referral_requests');
  const cleanFriendName = (params.friendName || '').trim();
  const cleanFriendEmail = (params.friendEmail || '').trim().toLowerCase();
  const cleanReferrerEmail = params.referrerEmail.trim().toLowerCase();

  const docRef = await addDoc(col, {
    referrerName: params.referrerName.trim(),
    referrerEmail: cleanReferrerEmail,
    referrerUid: params.referrerUid || '',
    friendName: cleanFriendName,
    friendEmail: cleanFriendEmail || cleanFriendName,
    bonusCredits: params.bonusCredits,
    status: 'pending',
    createdAt: Date.now(),
  });

  return docRef.id;
}

/**
 * [관리자 전용] 추천 신청 전체 목록 실시간 구독
 */
export function subscribeReferralRequests(
  onUpdate: (requests: ReferralRequest[]) => void
) {
  const col = collection(db, 'referral_requests');
  const q = query(col, orderBy('createdAt', 'desc'));

  return onSnapshot(q, (snap) => {
    const list: ReferralRequest[] = [];
    snap.forEach((d) => {
      list.push({ id: d.id, ...d.data() } as ReferralRequest);
    });
    onUpdate(list);
  }, (err) => {
    console.warn('[promotionService] subscribeReferralRequests error:', err);
  });
}

/**
 * [관리자 전용] 추천 신청 승인 및 혜택 즉시 지급
 */
export async function approveReferralRequest(
  request: ReferralRequest
): Promise<void> {
  const reqRef = doc(db, 'referral_requests', request.id);

  // 1. 추천인에게 크레딧 지급 (UID 또는 이메일 기반 전파)
  const targetUid = request.referrerUid || ('user_' + request.referrerEmail.replace(/[^a-zA-Z0-9]/g, '_'));
  await addCreditsToUser(
    targetUid, 
    request.bonusCredits, 
    `친구 추천 혜택 (${request.friendEmail})`
  );

  // 2. 신청 상태를 'approved'로 갱신
  await updateDoc(reqRef, {
    status: 'approved',
    approvedAt: Date.now()
  });
}

/**
 * [관리자 전용] 추천 신청 반려 또는 삭제
 */
export async function deleteReferralRequest(requestId: string): Promise<void> {
  await deleteDoc(doc(db, 'referral_requests', requestId));
}

/**
 * [관리자 전용] 추천 가입자 수동 혜택 즉시 지급
 */
export async function manualGrantReferralBonus(params: {
  referrerEmail: string;
  friendEmail: string;
  bonusCredits: number;
}): Promise<void> {
  const cleanEmail = params.referrerEmail.trim().toLowerCase();
  const fallbackUid = 'user_' + cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');

  await addCreditsToUser(
    fallbackUid,
    params.bonusCredits,
    `관리자 수동 추천 혜택 (친구: ${params.friendEmail.trim()})`
  );

  // 활동 로그 겸 추천 기록에도 남김
  const col = collection(db, 'referral_requests');
  await addDoc(col, {
    referrerName: cleanEmail.split('@')[0],
    referrerEmail: cleanEmail,
    friendEmail: params.friendEmail.trim().toLowerCase(),
    bonusCredits: params.bonusCredits,
    status: 'approved',
    createdAt: Date.now(),
    approvedAt: Date.now(),
    note: '관리자 수동 즉시 지급'
  });
}
