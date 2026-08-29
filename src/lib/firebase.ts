import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, GithubAuthProvider, browserLocalPersistence, inMemoryPersistence, setPersistence } from 'firebase/auth';
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

// Authentication (To'liq eski/asosiy loyihadan foydalanadi: Google, Github, Email)
export const auth = getAuth(originalApp);
setPersistence(auth, browserLocalPersistence).catch(() => {
  setPersistence(auth, inMemoryPersistence).catch(() => {});
});

export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();
githubProvider.addScope('repo');
githubProvider.addScope('read:user');
githubProvider.setCustomParameters({
  allow_signup: 'true'
});

export { originalApp, databaseApp, originalApp as primaryApp, databaseApp as secondaryApp };



