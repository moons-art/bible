import { collection, addDoc } from 'firebase/firestore';
import { db } from '../api/firebaseConfig';

const lastLogTimes: Record<string, number> = {};

export const logActivity = async (action: string, details?: string) => {
  const now = Date.now();
  // 중복 로깅 방지: 같은 액션은 5초 이내에 다시 기록하지 않음
  if (lastLogTimes[action] && now - lastLogTimes[action] < 5000) {
    return;
  }
  lastLogTimes[action] = now;

  try {
    const profileStr = localStorage.getItem('offline_user_profile');
    
    // Only log if we have user info
    if (!profileStr) {
      return;
    }
    const profile = JSON.parse(profileStr);

    const logsCollection = collection(db, 'activity_logs');
    await addDoc(logsCollection, {
      userEmail: profile.email,
      userName: profile.name || 'Unknown',
      action: action,
      details: details || '',
      timestamp: new Date().toISOString()
    });
    console.log(`[Logger] Logged action: ${action}`);
  } catch (error) {
    console.error('[Logger] Failed to log activity:', error);
  }
};
