import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { safeSetDoc } from '../lib/safeFirestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    // Process redirect sign-in if returning from redirect
    getRedirectResult(auth).catch((err) => {
      console.warn('Redirect sign-in check:', err?.message || err);
    });

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        if (user.email === 'ismoilovshohjahon750@gmail.com') {
          setIsAdmin(true);
        }

        // Run profile and role sync asynchronously in background without blocking Auth loading
        (async () => {
          try {
            const profileRef = doc(db, 'profiles', user.uid);
            const username = user.displayName || user.email?.split('@')[0] || 'User';
            const photoURL = user.photoURL || (user.email ? `https://unavatar.io/${encodeURIComponent(user.email)}?fallback=https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=0284c7&color=ffffff&bold=true` : '');
            
            await safeSetDoc(profileRef, {
              email: user.email || '',
              displayName: user.displayName || username,
              username: username.toLowerCase(),
              photoURL: photoURL,
              updatedAt: serverTimestamp()
            }, { merge: true });

            if (user.email !== 'ismoilovshohjahon750@gmail.com') {
              const roleRef = doc(db, 'user_roles', user.uid);
              const roleSnap = await getDoc(roleRef);
              if (roleSnap.exists() && roleSnap.data().role === 'admin') {
                setIsAdmin(true);
              }
            }
          } catch (e: any) {
            console.warn('Background profile/role sync notice:', e?.message || e);
          }
        })();
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    if (isAuthenticating) return;
    try {
      setIsAuthenticating(true);
      setLoading(true);
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
        try {
          await signInWithRedirect(auth, googleProvider);
        } catch (redirErr) {
          console.warn('Redirect login warning:', redirErr);
        }
      } else if (error.code === 'auth/popup-closed-by-user') {
        console.warn('Foydalanuvchi oynani yopib qo\'ydi.');
      } else {
        console.error('Kirishda xatolik:', error);
      }
    } finally {
      setIsAuthenticating(false);
      setLoading(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
