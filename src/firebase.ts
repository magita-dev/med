import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type { LanguageCode, MechanismTargetId, VerificationReport } from './types/medguard.ts';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export interface UserProfileDoc {
  uid: string;
  displayName: string;
  email: string;
  preferredLanguage: LanguageCode;
}

export interface SavedCheckRecord {
  id: string;
  userId: string;
  patientCondition: string;
  patientAge: number;
  verdict: VerificationReport['overallVerdict'];
  verdictHeadline: string;
  medicineCount: number;
  medicineSummary: string;
  primaryMechanismId: MechanismTargetId;
  createdAtLabel: string;
}

export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function signOutAccount() {
  return signOut(auth);
}

export async function ensureUserProfile(
  uid: string,
  displayName: string,
  email: string,
  preferredLanguage: LanguageCode
): Promise<UserProfileDoc> {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      return {
        uid,
        displayName: String(data.displayName || displayName).slice(0, 120),
        email: String(data.email || email).slice(0, 180),
        preferredLanguage: (['en', 'ta', 'hi'].includes(data.preferredLanguage)
          ? data.preferredLanguage
          : preferredLanguage) as LanguageCode,
      };
    }

    const safeName = (displayName || email.split('@')[0] || 'MedGuard User').trim().slice(0, 120);
    const safeEmail = email.trim().slice(0, 180);
    await setDoc(ref, {
      uid,
      displayName: safeName,
      email: safeEmail,
      preferredLanguage,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { uid, displayName: safeName, email: safeEmail, preferredLanguage };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateUserPreferredLanguage(
  uid: string,
  preferredLanguage: LanguageCode
) {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      preferredLanguage,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveVerificationCheck(
  uid: string,
  report: VerificationReport,
  medicineNames: string[]
): Promise<string> {
  const checkId = `chk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `users/${uid}/checks/${checkId}`;
  const condition = (report.patientCondition || 'General Review').trim().slice(0, 160) || 'General Review';
  const headline = (report.verdictHeadline || 'Verification Summary').trim().slice(0, 200) || 'Verification Summary';
  const summary = (medicineNames.join(', ') || 'Prescription Check').trim().slice(0, 400) || 'Prescription Check';
  const safeAge = Math.max(0, Math.min(120, Math.round(Number(report.patientAge) || 0)));
  const safeCount = Math.max(1, Math.min(50, medicineNames.length || 1));

  try {
    await setDoc(doc(db, 'users', uid, 'checks', checkId), {
      id: checkId,
      userId: uid,
      patientCondition: condition,
      patientAge: safeAge,
      verdict: report.overallVerdict,
      verdictHeadline: headline,
      medicineCount: safeCount,
      medicineSummary: summary,
      primaryMechanismId: report.primaryMechanismId,
      createdAt: serverTimestamp(),
    });
    return checkId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchUserSavedChecks(uid: string): Promise<SavedCheckRecord[]> {
  const path = `users/${uid}/checks`;
  try {
    const q = query(
      collection(db, 'users', uid, 'checks'),
      where('userId', '==', uid),
      limit(25)
    );
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => {
      const data = d.data();
      const ts = data.createdAt?.toDate ? (data.createdAt.toDate() as Date) : null;
      return {
        id: String(data.id || d.id),
        userId: String(data.userId || uid),
        patientCondition: String(data.patientCondition || ''),
        patientAge: Number(data.patientAge || 0),
        verdict: data.verdict as VerificationReport['overallVerdict'],
        verdictHeadline: String(data.verdictHeadline || ''),
        medicineCount: Number(data.medicineCount || 1),
        medicineSummary: String(data.medicineSummary || ''),
        primaryMechanismId: data.primaryMechanismId as MechanismTargetId,
        createdAtMs: ts ? ts.getTime() : 0,
        createdAtLabel: ts
          ? ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          : 'Just now',
      };
    });
    rows.sort((a, b) => b.createdAtMs - a.createdAtMs);
    return rows.slice(0, 12).map(({ createdAtMs: _ms, ...rest }) => rest);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function deleteSavedCheck(uid: string, checkId: string) {
  const path = `users/${uid}/checks/${checkId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'checks', checkId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
