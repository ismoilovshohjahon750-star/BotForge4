import { setDoc, addDoc, updateDoc, deleteDoc, doc, collection, DocumentReference, CollectionReference, UpdateData, disableNetwork } from 'firebase/firestore';
import { db, secondaryDb } from './firebase';

let primaryQuotaExhausted = true;

// Immediately disable network on primary db to prevent SDK backoff retry loops
try {
  disableNetwork(db).catch(() => {});
} catch (_) {}

const withTimeout = <T>(promise: Promise<T>, timeoutMs = 2000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Firestore operation timed out')), timeoutMs))
  ]);
};

export function markPrimaryQuotaExhausted() {
  primaryQuotaExhausted = true;
  try {
    disableNetwork(db).catch(() => {});
  } catch (_) {}
}

export const markFirestoreQuotaExhausted = markPrimaryQuotaExhausted;

export function isPrimaryQuotaExhausted() {
  return primaryQuotaExhausted;
}

export const isFirestoreQuotaExhausted = isPrimaryQuotaExhausted;

export async function safeSetDoc(docRef: DocumentReference, data: any, options?: { merge?: boolean }) {
  // Try secondaryDb first if primary quota is known to be exhausted
  if (primaryQuotaExhausted && secondaryDb) {
    try {
      const secDocRef = doc(secondaryDb, docRef.path);
      await withTimeout(setDoc(secDocRef, data, options));
      return;
    } catch (_) {
      return;
    }
  }

  try {
    await withTimeout(setDoc(docRef, data, options));
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota limit exceeded')) {
      markPrimaryQuotaExhausted();
    }
  }

  // Backup write to Secondary Firebase database
  try {
    if (secondaryDb && docRef?.path) {
      const secDocRef = doc(secondaryDb, docRef.path);
      await withTimeout(setDoc(secDocRef, data, options), 1500);
    }
  } catch (_) {}
}

export async function safeAddDoc(collRef: CollectionReference, data: any) {
  let resultDoc: DocumentReference | null = null;

  if (primaryQuotaExhausted && secondaryDb) {
    try {
      const secCollRef = collection(secondaryDb, collRef.path);
      resultDoc = (await withTimeout(addDoc(secCollRef, data))) as DocumentReference;
      return resultDoc;
    } catch (_) {
      return ({ id: 'backup_' + Math.random().toString(36).substring(2, 9) } as unknown as DocumentReference);
    }
  }

  try {
    resultDoc = (await withTimeout(addDoc(collRef, data))) as DocumentReference;
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota limit exceeded')) {
      markPrimaryQuotaExhausted();
    }
  }

  // Backup write to Secondary Firebase database
  try {
    if (secondaryDb && collRef?.path) {
      const secCollRef = collection(secondaryDb, collRef.path);
      const secRes = await withTimeout(addDoc(secCollRef, data), 1500);
      if (!resultDoc) {
        resultDoc = secRes as DocumentReference;
      }
    }
  } catch (_) {}

  return resultDoc || ({ id: 'backup_' + Math.random().toString(36).substring(2, 9) } as unknown as DocumentReference);
}

export async function safeUpdateDoc(docRef: DocumentReference, data: UpdateData<any>) {
  if (primaryQuotaExhausted && secondaryDb) {
    try {
      const secDocRef = doc(secondaryDb, docRef.path);
      await withTimeout(updateDoc(secDocRef, data));
      return;
    } catch (_) {
      return;
    }
  }

  try {
    await withTimeout(updateDoc(docRef, data));
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota limit exceeded')) {
      markPrimaryQuotaExhausted();
    }
  }

  try {
    if (secondaryDb && docRef?.path) {
      const secDocRef = doc(secondaryDb, docRef.path);
      await withTimeout(updateDoc(secDocRef, data), 1500);
    }
  } catch (_) {}
}

export async function safeDeleteDoc(docRef: DocumentReference) {
  if (primaryQuotaExhausted && secondaryDb) {
    try {
      const secDocRef = doc(secondaryDb, docRef.path);
      await withTimeout(deleteDoc(secDocRef), 1500);
      return;
    } catch (_) {
      return;
    }
  }

  try {
    await withTimeout(deleteDoc(docRef));
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota limit exceeded')) {
      markPrimaryQuotaExhausted();
    }
  }

  try {
    if (secondaryDb && docRef?.path) {
      const secDocRef = doc(secondaryDb, docRef.path);
      await withTimeout(deleteDoc(secDocRef), 1500);
    }
  } catch (_) {}
}




