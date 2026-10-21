import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';

// 1. 바이블 앱 고유 데이터 저장소 (ym-bible) - 설교노트, 구절메모, AI주석, 앱 고유 크레딧 등 100% 보존
const firebaseConfig = {
  apiKey: "AIzaSyA6hBoSPjoeYbxrEYfRB-HmFjoDFT0vahQ",
  authDomain: "bible.thenations.kr",
  projectId: "ym-bible",
  storageBucket: "ym-bible.firebasestorage.app",
  messagingSenderId: "841079778199",
  appId: "1:841079778199:web:52a42bf34891f972a5b2d2"
};

// 2. 네이션스 통합 인증 허브 (sermon-ym) - 4개 앱 통합 로그인 및 중앙 회원 레지스트리 전용
const sermonFirebaseConfig = {
  apiKey: "AIzaSyDP3M5o7eNBJ1dsxq_54BBW03ZgUijHh5A",
  authDomain: "sermon-ym.firebaseapp.com",
  projectId: "sermon-ym",
  storageBucket: "sermon-ym.firebasestorage.app",
  messagingSenderId: "833556498310",
  appId: "1:833556498310:web:a38ea2f5baf012851ace07"
};

// Initialize Content Firebase (ym-bible)
const app = initializeApp(firebaseConfig);

// Initialize Auth Hub Firebase (sermon-ym)
export const authApp = initializeApp(sermonFirebaseConfig, 'AUTH_APP');

// Initialize Firestore with offline persistence for Bible app data (ym-bible)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// Initialize Hub Firestore for central user registry sync (sermon-ym)
export const authDb = getFirestore(authApp);

// Initialize Unified Auth with permanent local persistence (sermon-ym)
export const auth = getAuth(authApp);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('[firebaseConfig] Auth persistence set error:', err);
});
export const googleProvider = new GoogleAuthProvider();

// Initialize Functions (ym-bible 서울 리전)
export const functions = getFunctions(app, 'asia-northeast3');
