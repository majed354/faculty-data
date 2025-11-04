// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCXUfVZgac28hxezDCc6l4h7sC5au7zctA",
  authDomain: "faculty-data-f2ceb.firebaseapp.com",
  projectId: "faculty-data-f2ceb",
  storageBucket: "faculty-data-f2ceb.firebasestorage.app",
  messagingSenderId: "1045696055217",
  appId: "1:1045696055217:web:8c45657364b3cb99ff1f90",
  measurementId: "G-FB38DKBV8Q"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

// أداة: جلب المستخدم والمطالبات (claims)
export async function getUserWithClaims() {
  const user = auth.currentUser;
  if (!user) return { user: null, claims: {} };
  const t = await getIdTokenResult(user, /*forceRefresh*/ true);
  return { user, claims: t.claims || {} };
}

// نُصدّر كل ما قد نحتاجه في app.js (لراحة الاستيراد الموحد)
export {
  collection, getDocs, getDoc, doc, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, writeBatch, serverTimestamp,
  signInWithPopup, signOut, onAuthStateChanged, getIdTokenResult
};
