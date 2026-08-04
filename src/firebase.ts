// ==================== FIREBASE (Google 로그인 + 클라우드 동기화) ====================
// 이 파일은 .env 에 VITE_FIREBASE_* 값이 설정되어 있지 않아도 앱이 죽지 않도록
// "설정 안 됨" 상태를 안전하게 처리합니다. (isFirebaseConfigured === false)
import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth'
import { getFirestore, doc, getDoc, runTransaction, type Firestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)

let app: FirebaseApp | null = null
let authInstance: Auth | null = null
let dbInstance: Firestore | null = null

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig)
  authInstance = getAuth(app)
  dbInstance = getFirestore(app)
}

export type SyncUser = { uid: string; email: string | null; displayName: string | null; photoURL: string | null }

function toSyncUser(u: User): SyncUser {
  return { uid: u.uid, email: u.email, displayName: u.displayName, photoURL: u.photoURL }
}

export function onAuthChange(cb: (user: SyncUser | null) => void): () => void {
  if (!authInstance) return () => {}
  return onAuthStateChanged(authInstance, u => cb(u ? toSyncUser(u) : null))
}

export async function signInWithGoogle(): Promise<SyncUser> {
  if (!authInstance) throw new Error('Firebase가 설정되지 않았습니다.')
  const provider = new GoogleAuthProvider()
  const result = await signInWithPopup(authInstance, provider)
  return toSyncUser(result.user)
}

export async function signOutUser(): Promise<void> {
  if (!authInstance) return
  await signOut(authInstance)
}

// 사용자의 클라우드(Firestore) 저장 데이터를 가져옵니다. 저장된 적이 없으면 null.
export async function fetchRemoteData<T>(uid: string): Promise<T | null> {
  if (!dbInstance) return null
  const ref = doc(dbInstance, 'users', uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return snap.data() as T
}

// 트랜잭션 안에서 최신 원격본을 다시 읽고 병합한 뒤 저장합니다.
// 여러 기기가 동시에 저장해도 다른 날짜의 기록을 통째로 덮어쓰지 않습니다.
export async function syncRemoteData<T extends object>(
  uid: string,
  localData: T,
  merge: (local: T, remote: T) => T,
): Promise<T> {
  if (!dbInstance) return localData
  const ref = doc(dbInstance, 'users', uid)
  return runTransaction(dbInstance, async transaction => {
    const snap = await transaction.get(ref)
    const merged = snap.exists() ? merge(localData, snap.data() as T) : localData
    transaction.set(ref, merged)
    return merged
  })
}
