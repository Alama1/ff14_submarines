import { initializeApp, FirebaseApp, FirebaseOptions } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

interface RuntimeEnv {
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_ALLOWED_ADMIN_EMAILS?: string;
  VITE_CRAFTERS_SHEET_URL?: string;
}

declare global {
  interface Window {
    env?: RuntimeEnv;
  }
}

export const getEnv = (key: keyof RuntimeEnv): string => {
  return window.env?.[key] || (import.meta.env[key] as string) || '';
};

const firebaseConfig: FirebaseOptions = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY'),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('VITE_FIREBASE_APP_ID'),
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let isFirebaseConfigured = false;

const projectId = firebaseConfig.projectId;
const apiKey = firebaseConfig.apiKey;

if (
  projectId &&
  projectId !== 'your_project_id' &&
  apiKey &&
  apiKey !== 'your_api_key_here'
) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    isFirebaseConfigured = true;
  } catch (error) {
    console.error('Error initializing Firebase:', error);
  }
}

const allowedAdminEmails = getEnv('VITE_ALLOWED_ADMIN_EMAILS')
  ? getEnv('VITE_ALLOWED_ADMIN_EMAILS').split(',').map((e) => e.trim().toLowerCase())
  : [];

export { db, auth, isFirebaseConfigured, allowedAdminEmails };
