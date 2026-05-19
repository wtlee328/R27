import { useEffect } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { COLLECTIONS } from '@/lib/constants'
import type { AppUser } from '@/types'

// ─── Bootstrap auth listener ──────────────────────────────────
export function useAuthListener() {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true) // Start loading as soon as we detect a change
      if (!firebaseUser) {
        setUser(null)
        setLoading(false)
        return
      }

      try {
        // Load or create user doc
        const userRef = doc(db, COLLECTIONS.USERS, firebaseUser.uid)
        const userSnap = await getDoc(userRef)

        let appUser: AppUser

        if (userSnap.exists()) {
          appUser = { uid: firebaseUser.uid, ...userSnap.data() } as AppUser
        } else {
          // First login — create user doc
          const adminEmails = ['wtlee328@gmail.com', 'admin@r27.com', 'lins92142t@gmail.com']
          const isAdminEmail = adminEmails.includes(firebaseUser.email ?? '')
          const role = isAdminEmail ? 'admin' : 'trainer'
          
          const newUser = {
            email: firebaseUser.email ?? '',
            displayName: firebaseUser.displayName ?? firebaseUser.email ?? '',
            role,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
          await setDoc(userRef, newUser)
          appUser = { uid: firebaseUser.uid, ...newUser } as unknown as AppUser
        }

        setUser(appUser)
      } catch (err) {
        console.error('Auth state error:', err)
        setUser(null)
      } finally {
        setLoading(false)
      }
    })

    return unsub
  }, [setUser, setLoading])
}

// ─── Sign in ──────────────────────────────────────────────────
export async function signIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password)
}

// ─── Sign up ──────────────────────────────────────────────────
export async function signUp(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password)
}

// ─── Sign out ─────────────────────────────────────────────────
export async function signOut() {
  return firebaseSignOut(auth)
}

// ─── Change password ──────────────────────────────────────────
export async function changePassword(
  currentPassword: string,
  newPassword: string
) {
  const user = auth.currentUser
  if (!user || !user.email) throw new Error('未登入')

  const credential = EmailAuthProvider.credential(user.email, currentPassword)
  await reauthenticateWithCredential(user, credential)
  await updatePassword(user, newPassword)
}
