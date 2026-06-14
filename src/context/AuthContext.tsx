import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, signInWithEmailAndPassword, signOut, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { doc, getDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { UserProfile, UserRole, Store } from '../types/models';
import { getUserProfile, subscribeToUserProfile, updateUserProfile } from '../services/dbService';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  logout: () => Promise<void>;
  isAdmin: () => boolean;
  isStoreUser: () => boolean;
  hasStoreAccess: (storeId: string | null) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Explicitly configure production-grade session persistence (clears when tab/window is closed)
    setPersistence(auth, browserSessionPersistence).catch((err) => {
      console.error('Failed to configure session persistence:', err);
    });

    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = auth.onAuthStateChanged(async (firebaseUser) => {
      // Clean up previous profile listener if any
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (firebaseUser) {
        setUser(firebaseUser);
        setError(null);

        // Subscribe to real-time updates for user profile
        unsubscribeProfile = subscribeToUserProfile(firebaseUser.uid, (userProfile) => {
          if (userProfile) {
            if (userProfile.status === 'suspended') {
              setError('Your account has been suspended. Please contact your system administrator.');
              signOut(auth);
              setProfile(null);
              setUser(null);
            } else {
              setProfile(userProfile);
              setError(null);

              // Automatically and quietly update lastLoginAt if undefined or > 5 mins old
              const now = Timestamp.now();
              const lastLogin = userProfile.lastLoginAt;
              if (!lastLogin || (now.seconds - lastLogin.seconds > 300)) {
                updateUserProfile(firebaseUser.uid, { lastLoginAt: now }, {
                  userId: firebaseUser.uid,
                  userName: userProfile.name,
                  userEmail: userProfile.email
                }).catch((err) => {
                  console.error('Failed to update lastLoginAt in AuthContext:', err);
                });
              }
            }
          } else {
            // Profile document doesn't exist yet (not provisioned)
            setProfile(null);
            
            // Check if system is bootstrapped. If yes, this is an unauthorized account, sign out immediately!
            const checkUnauthorized = async () => {
              try {
                const bootstrapRef = doc(db, 'system', 'bootstrap');
                const snap = await getDoc(bootstrapRef);
                if (snap.exists()) {
                  setError('Your email is not added by the admin. Access restricted.');
                  await signOut(auth);
                  setUser(null);
                } else {
                  setError('Your account profile has not been configured. Contact an administrator.');
                }
              } catch (err) {
                console.error('Bootstrap check failed in AuthContext:', err);
                setError('Your account profile has not been configured. Contact an administrator.');
              }
            };
            checkUnauthorized();
          }
          setLoading(false);
        });
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, []);

  useEffect(() => {
    if (!user || !profile || profile.role !== 'store_user' || !profile.assignedStoreId) {
      return;
    }

    const storeRef = doc(db, 'stores', profile.assignedStoreId);
    const unsubscribeStore = onSnapshot(storeRef, (docSnap) => {
      if (docSnap.exists()) {
        const storeData = docSnap.data() as Store;
        if (storeData.status === 'disabled') {
          setError('Your assigned store has been disabled. Please contact your system administrator.');
          signOut(auth);
          setProfile(null);
          setUser(null);
        }
      }
    });

    return () => {
      unsubscribeStore();
    };
  }, [user, profile]);

  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Automatic logout after 20 minutes of inactivity
  useEffect(() => {
    if (!user) return;

    let timeoutId: any;
    const INACTIVITY_TIMEOUT = 20 * 60 * 1000; // 20 minutes

    const handleInactivityLogout = () => {
      console.log('Inactivity limit reached. Automatically logging out user...');
      logout();
    };

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(handleInactivityLogout, INACTIVITY_TIMEOUT);
    };

    // Initialize the timer
    resetTimer();

    // Attach activity event listeners to window
    const events = ['mousemove', 'keydown', 'mousedown', 'click', 'scroll', 'touchstart'];
    events.forEach(event => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user]);

  const isAdmin = (): boolean => {
    return profile?.role === 'admin';
  };

  const isStoreUser = (): boolean => {
    return profile?.role === 'store_user';
  };

  // Checks if user can read/write data for a specific store.
  // Admins can access all stores. Managers/Storekeepers can only access their assigned store.
  const hasStoreAccess = (storeId: string | null): boolean => {
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    if (!storeId) return false; // Non-admins must have a store context
    return profile.assignedStoreId === storeId;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        error,
        logout,
        isAdmin,
        isStoreUser,
        hasStoreAccess,
      }}
    >
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
