import { collection, addDoc } from 'firebase/firestore';
import { db, auth } from '../api/firebaseConfig';

const lastLogTimes: Record<string, number> = {};

// 찬송가 잔재 기능 및 단순 UI 조작 액션은 Firestore 쓰기 대상에서 제외 (쓰기 할당량 보호)
const IGNORED_ACTIONS = ['콘티', '뷰어', '앨범', '악보', '찬송가', 'conti', 'viewer'];

export const logActivity = async (action: string, details?: string, customUser?: { email?: string; name?: string }) => {
  // 찬송가 잔재 및 단순 화면 전환 액션은 DB 쓰기 없이 안전하게 조기 반환
  const lowerAction = (action || '').toLowerCase();
  if (IGNORED_ACTIONS.some(keyword => lowerAction.includes(keyword))) {
    return;
  }

  const now = Date.now();
  // 중복 로깅 방지: 같은 액션은 3초 이내에 다시 기록하지 않음
  if (lastLogTimes[action] && now - lastLogTimes[action] < 3000) {
    return;
  }
  lastLogTimes[action] = now;

  try {
    let email = customUser?.email || '';
    let name = customUser?.name || '';

    // 1. Firebase Auth 현재 사용자 확인
    if (!email && auth.currentUser) {
      email = auth.currentUser.email || '';
      name = auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || '';
    }

    // 2. localStorage offline_user_profile 확인 (Google Drive 사용자)
    if (!email) {
      try {
        const profileStr = localStorage.getItem('offline_user_profile');
        if (profileStr) {
          const p = JSON.parse(profileStr);
          email = p.email || '';
          name = p.name || '';
        }
      } catch (e) {}
    }

    // 사용자 정보가 전혀 없으면 게스트로 기록
    if (!email) {
      email = 'guest@anonymous.local';
      name = '비로그인 이용자';
    }

    const logsCollection = collection(db, 'activity_logs');
    await addDoc(logsCollection, {
      userEmail: email,
      userName: name || email.split('@')[0] || 'Unknown',
      action: action,
      details: details || '',
      timestamp: new Date().toISOString()
    });
    console.log(`[Logger] ✅ Logged action: ${action} (${email})`);
  } catch (error) {
    console.error('[Logger] Failed to log activity:', error);
  }
};
