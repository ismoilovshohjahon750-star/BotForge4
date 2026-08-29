import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

if (!getApps().length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      if (serviceAccount.private_key && typeof serviceAccount.private_key === 'string') {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || firebaseConfig.projectId,
      });
      console.log("Firebase Admin initialized with FIREBASE_SERVICE_ACCOUNT successfully.");
    } catch (error) {
      console.error("FIREBASE_SERVICE_ACCOUNT JSON.parse xatoligi, standart config ishlatilmoqda:", error);
      initializeApp({
        projectId: firebaseConfig.projectId,
      });
    }
  } else {
    initializeApp({
      projectId: firebaseConfig.projectId,
    });
  }
}

export const adminAuth = getAuth();
export const adminDb = getFirestore(firebaseConfig.firestoreDatabaseId || '(default)');

