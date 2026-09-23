import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyA6hBoSPjoeYbxrEYfRB-HmFjoDFT0vahQ",
  authDomain: "bible.thenations.kr",
  projectId: "ym-bible",
  storageBucket: "ym-bible.firebasestorage.app",
  messagingSenderId: "841079778199",
  appId: "1:841079778199:web:52a42bf34891f972a5b2d2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with offline persistence (auto cache + multi-tab support)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// Initialize Auth with permanent local persistence (자동 로그인 보장)
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('[firebaseConfig] Auth persistence set error:', err);
});
export const googleProvider = new GoogleAuthProvider();
