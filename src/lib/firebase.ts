import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const env = import.meta.env;
export const useEmulators = env.VITE_USE_EMULATORS === 'true';

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || (useEmulators ? 'demo-key' : undefined),
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  // Emulator mode always uses the local demo project, never the real one.
  projectId: useEmulators ? 'demo-elevatex' : env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

/** True when .env.local is missing — the app shows setup instructions instead of crashing. */
export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

const emulatorHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

function connect(auth: Auth) {
  if (useEmulators) connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
}

export const app: FirebaseApp = initializeApp(firebaseConfigured ? config : { apiKey: 'missing', projectId: 'missing' });
export const auth = getAuth(app);
export const db = getFirestore(app);
connect(auth);
if (useEmulators) connectFirestoreEmulator(db, emulatorHost, 8080);

/**
 * Creates a Firebase Auth account for a new member WITHOUT signing the admin out.
 * It uses a second, throw-away Firebase app instance, so it works on the free
 * Spark plan with no Cloud Functions. The member then receives a "set your
 * password" email (a password-reset email) and chooses their own password.
 */
export async function createAuthAccount(email: string): Promise<string> {
  const secondary = getApps().find((a) => a.name === 'member-creator') ?? initializeApp(app.options, 'member-creator');
  const secondaryAuth = getAuth(secondary);
  if (useEmulators && !(secondaryAuth as unknown as { _emulatorConnected?: boolean })._emulatorConnected) {
    connect(secondaryAuth);
    (secondaryAuth as unknown as { _emulatorConnected?: boolean })._emulatorConnected = true;
  }
  const tempPassword = crypto.getRandomValues(new Uint32Array(4)).join('-') + 'Aa!';
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
  await signOut(secondaryAuth);
  return cred.user.uid;
}
