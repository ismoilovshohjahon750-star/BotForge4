import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { 
  initializeAuth,
  getAuth,
  GoogleAuthProvider, 
  GithubAuthProvider, 
  browserLocalPersistence, 
  browserSessionPersistence,
  indexedDBLocalPersistence,
  inMemoryPersistence, 
  setPersistence,
  Auth
} from 'firebase/auth';
import { initializeFirestore, Firestore } from 'firebase/firestore';
import primaryConfig from '../../firebase-applet-config.json';

// Secondary Fresh Firebase Config for Database (database-1edc1)
export const databaseFirebaseConfig = {
  apiKey: "AIzaSyCtVOlL6cBTQjvKFU_gBzRUYrmz97wxyiA",
  authDomain: "database-1edc1.firebaseapp.com",
  projectId: "database-1edc1",
  storageBucket: "database-1edc1.firebasestorage.app",
  messagingSenderId: "52074671370",
  appId: "1:52074671370:web:5d8059beb4835e3af45ef3",
  measurementId: "G-98V935W9BK"
};

// 1. Original Firebase App (Used for Authentication / Ro'yxatdan o'tish / OAuth)
let originalApp: FirebaseApp;
const existingApps = getApps();
if (!existingApps.length) {
  originalApp = initializeApp(primaryConfig, "[DEFAULT]");
} else {
  originalApp = existingApps.find(a => a.name === "[DEFAULT]") || existingApps[0];
}

// 2. Fresh Database Firebase App
let databaseApp: FirebaseApp;
const foundDbApp = getApps().find(a => a.name === "databaseApp");
if (!foundDbApp) {
  try {
    databaseApp = initializeApp(databaseFirebaseConfig, "databaseApp");
  } catch {
    databaseApp = originalApp;
  }
} else {
  databaseApp = foundDbApp;
}

// Primary Firestore Database (matches Auth and Firestore rules)
export const db: Firestore = initializeFirestore(originalApp, {
  experimentalAutoDetectLongPolling: true,
}, (primaryConfig as any).firestoreDatabaseId);

let secDbInstance: Firestore;
try {
  secDbInstance = initializeFirestore(databaseApp, {
    experimentalAutoDetectLongPolling: true,
  });
} catch {
  secDbInstance = db;
}
export const secondaryDb: Firestore = secDbInstance;

// Authentication with comprehensive fallback persistence for older browsers, private mode & WebViews
let authInstance: Auth;
try {
  // initializeAuth allows specifying an ordered list of persistence mechanisms
  // so if indexedDB fails or localStorage is blocked in older browsers, it gracefully falls back
  authInstance = initializeAuth(originalApp, {
    persistence: [
      indexedDBLocalPersistence,
      browserLocalPersistence,
      browserSessionPersistence,
      inMemoryPersistence
    ]
  });
} catch {
  // If already initialized or fallback needed
  authInstance = getAuth(originalApp);
  setPersistence(authInstance, browserLocalPersistence)
    .catch(() => setPersistence(authInstance, browserSessionPersistence))
    .catch(() => setPersistence(authInstance, inMemoryPersistence))
    .catch(() => {});
}

export const auth = authInstance;

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.addScope('openid');
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export const githubProvider = new GithubAuthProvider();
githubProvider.addScope('repo');
githubProvider.addScope('read:user');
githubProvider.setCustomParameters({
  allow_signup: 'true'
});

export { originalApp, databaseApp, originalApp as primaryApp, databaseApp as secondaryApp };



