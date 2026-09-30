import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult, 
  signOut,
  signInWithCredential,
  GoogleAuthProvider 
} from 'firebase/auth';
import { auth, googleProvider, browserPopupRedirectResolver } from '../lib/firebase';
import { doc, serverTimestamp } from 'firebase/firestore';
import { safeSetDoc, safeGetDoc } from '../lib/safeFirestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  login: () => Promise<void>;
  loginWithGoogleCredential: (idToken: string) => Promise<User>;
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
    let isMounted = true;
    getRedirectResult(auth, browserPopupRedirectResolver).then((result) => {
      if (result?.user && isMounted) {
        setUser(result.user);
      }
    }).catch((err) => {
      // Benign redirect check warning
      if (err?.code !== 'auth/null-user') {
        console.warn('Redirect sign-in notice:', err?.message || err);
      }
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
            const token = await user.getIdToken();
            fetch('/api/auth/sync', {
              method: 'POST',
              headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ agreedToTerms: true, termsAgreedAt: new Date().toISOString() })
            }).catch(() => {});

            const profileRef = doc(db, 'profiles', user.uid);
            const username = user.displayName || user.email?.split('@')[0] || 'User';
            const photoURL = user.photoURL || (user.email ? `https://unavatar.io/${encodeURIComponent(user.email)}?fallback=https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=0284c7&color=ffffff&bold=true` : '');
            
            await safeSetDoc(profileRef, {
              email: user.email || '',
              displayName: user.displayName || username,
              username: username.toLowerCase(),
              photoURL: photoURL,
              isOnline: true,
              lastSeen: serverTimestamp(),
              agreedToTerms: true,
              termsAgreedAt: new Date().toISOString(),
              updatedAt: serverTimestamp()
            }, { merge: true });

            if (user.email !== 'ismoilovshohjahon750@gmail.com') {
              const roleRef = doc(db, 'user_roles', user.uid);
              const roleSnap = await safeGetDoc(roleRef);
              if (roleSnap && roleSnap.exists() && roleSnap.data().role === 'admin') {
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

    // Real-time online heartbeat and visibility tracker for active users
    let heartbeatInterval: any = null;
    const updatePresence = (online: boolean) => {
      if (auth.currentUser) {
        const uid = auth.currentUser.uid;
        const profileRef = doc(db, 'profiles', uid);
        safeSetDoc(profileRef, {
          isOnline: online,
          lastSeen: serverTimestamp(),
        }, { merge: true }).catch(() => {});
      }
    };

    // Heartbeat every 45 seconds to keep presence fresh
    heartbeatInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && auth.currentUser) {
        updatePresence(true);
      }
    }, 45000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updatePresence(true);
      } else {
        // Tab hidden / minimized
        updatePresence(false);
      }
    };

    const handleBeforeUnload = () => {
      updatePresence(false);
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Safety fallback: if onAuthStateChanged is delayed, resolve loading after 2.5s
    const authSafetyTimer = setTimeout(() => {
      setLoading(false);
    }, 2500);

    return () => {
      unsubscribe();
      clearTimeout(authSafetyTimer);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const login = async () => {
    if (isAuthenticating) return;
    try {
      setIsAuthenticating(true);
      setLoading(true);
      await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
    } catch (error: any) {
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
        try {
          await signInWithRedirect(auth, googleProvider, browserPopupRedirectResolver);
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

  const loginWithGoogleCredential = async (idToken: string): Promise<User> => {
    try {
      setIsAuthenticating(true);
      setLoading(true);
      const credential = GoogleAuthProvider.credential(idToken);
      const res = await signInWithCredential(auth, credential);
      return res.user;
    } finally {
      setIsAuthenticating(false);
      setLoading(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, login, loginWithGoogleCredential, logout }}>
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
