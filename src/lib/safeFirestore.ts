import { setDoc, addDoc, updateDoc, deleteDoc, doc, collection, DocumentReference, CollectionReference, UpdateData } from 'firebase/firestore';
import { secondaryDb } from './firebase';

const withTimeout = <T>(promise: Promise<T>, timeoutMs = 2500): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Firestore operation timed out')), timeoutMs))
  ]);
};

export async function safeSetDoc(docRef: DocumentReference, data: any, options?: { merge?: boolean }) {
  try {
    await withTimeout(setDoc(docRef, data, options));
  } catch (err) {
    // Primary quota or offline or timeout
  }

  // Backup / Dual-Write to Secondary Firebase database
  try {
    if (secondaryDb && docRef?.path) {
      const secDocRef = doc(secondaryDb, docRef.path);
      await withTimeout(setDoc(secDocRef, data, options), 1500);
    }
  } catch {
    // Silent secondary failover
  }
}

export async function safeAddDoc(collRef: CollectionReference, data: any) {
  let resultDoc: DocumentReference | null = null;
  try {
    resultDoc = (await withTimeout(addDoc(collRef, data))) as DocumentReference;
  } catch {
    // Primary quota or offline or timeout
  }

  // Backup / Dual-Write to Secondary Firebase database
  try {
    if (secondaryDb && collRef?.path) {
      const secCollRef = collection(secondaryDb, collRef.path);
      const secRes = await withTimeout(addDoc(secCollRef, data), 1500);
      if (!resultDoc) {
        resultDoc = secRes as DocumentReference;
      }
    }
  } catch {
    // Silent secondary failover
  }

  return resultDoc || ({ id: 'backup_' + Math.random().toString(36).substring(2, 9) } as unknown as DocumentReference);
}

export async function safeUpdateDoc(docRef: DocumentReference, data: UpdateData<any>) {
  try {
    await withTimeout(updateDoc(docRef, data));
  } catch {
    // Primary quota or offline or timeout
  }

  // Backup / Dual-Write to Secondary Firebase database
  try {
    if (secondaryDb && docRef?.path) {
      const secDocRef = doc(secondaryDb, docRef.path);
      await withTimeout(updateDoc(secDocRef, data), 1500);
    }
  } catch {
    // Silent secondary failover
  }
}

export async function safeDeleteDoc(docRef: DocumentReference) {
  try {
    await withTimeout(deleteDoc(docRef));
  } catch {
    // Primary quota or offline or timeout
  }

  // Backup / Dual-Write to Secondary Firebase database
  try {
    if (secondaryDb && docRef?.path) {
      const secDocRef = doc(secondaryDb, docRef.path);
      await withTimeout(deleteDoc(secDocRef), 1500);
    }
  } catch {
    // Silent secondary failover
  }
}



