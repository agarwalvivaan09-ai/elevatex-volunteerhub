import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { fromFirestore } from '../lib/api';
import { access } from '../lib/access';
import type { UserProfile } from '../lib/types';

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'noProfile'; user: User }
  | { status: 'removed'; user: User; profile: UserProfile }
  | { status: 'alumni'; user: User; profile: UserProfile }
  | { status: 'active'; user: User; profile: UserProfile };

const AuthContext = createContext<AuthState>({ status: 'loading' });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubProfile?.();
      unsubProfile = undefined;
      if (!user) {
        setState({ status: 'signedOut' });
        return;
      }
      setState({ status: 'loading' });
      unsubProfile = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          if (!snap.exists()) return setState({ status: 'noProfile', user });
          const profile = fromFirestore<UserProfile>(snap.id, snap.data());
          setState(profile.status === 'active' ? { status: 'active', user, profile } : profile.status === 'alumni' ? { status: 'alumni', user, profile } : { status: 'removed', user, profile });
        },
        () => setState({ status: 'noProfile', user }),
      );
    });
    return () => {
      unsubProfile?.();
      unsubAuth();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuthState = () => useContext(AuthContext);

/** Only call inside the signed-in area of the app. `can` describes what this person may do. */
export function useMe() {
  const s = useContext(AuthContext);
  if (s.status !== 'active') throw new Error('useMe used outside an active session');
  const { profile } = s;
  const can = useMemo(() => access(profile), [profile]);
  return { user: s.user, profile, can };
}
