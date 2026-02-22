// ============================================================
//  auth.js — MC Store Authentication Manager
//  Handles: Signup, Login, Logout, Auth State
//  Firebase config is embedded here.
//  DO NOT expose this file publicly without environment rules.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { saveSession, clearSession } from "./session.js";

// ─────────────────────────────────────────
//  FIREBASE CONFIG
//  Replace these placeholder values with
//  your actual Firebase project credentials
//  from: Firebase Console → Project Settings
// ─────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// ─────────────────────────────────────────
//  INITIALISE FIREBASE
// ─────────────────────────────────────────
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ─────────────────────────────────────────
//  SIGN UP
//  Called after Step 2 is completed.
//  Creates Firebase Auth user, saves profile
//  to Firestore, then saves session to
//  IndexedDB via session.js
// ─────────────────────────────────────────
async function mcSignUp({ fullName, email, password, phone, address }) {
  try {
    // 1. Create Firebase Auth account
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const user = credential.user;

    // 2. Update Firebase display name
    await updateProfile(user, { displayName: fullName });

    // 3. Save full profile to Firestore
    const userDoc = {
      uid:          user.uid,
      fullName,
      email,
      phone,
      address,
      createdAt:    serverTimestamp(),
      lastLogin:    serverTimestamp(),
      role:         "customer"
    };
    await setDoc(doc(db, "users", user.uid), userDoc);

    // 4. Save session to IndexedDB (session.js handles this)
    await saveSession({
      uid:          user.uid,
      fullName,
      email,
      phone,
      address,
      loginAt:      new Date().toISOString()
    });

    // 5. Redirect to app
    window.location.href = "app-skeleton.html";

  } catch (error) {
    throw mcAuthError(error.code);
  }
}

// ─────────────────────────────────────────
//  LOG IN
//  Called from login.html
// ─────────────────────────────────────────
async function mcLogin({ email, password }) {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const user = credential.user;

    // Fetch user profile from Firestore
    const snap = await getDoc(doc(db, "users", user.uid));
    const profile = snap.exists() ? snap.data() : {};

    // Save session to IndexedDB
    await saveSession({
      uid:      user.uid,
      fullName: profile.fullName  || user.displayName || "",
      email:    user.email,
      phone:    profile.phone     || "",
      address:  profile.address   || "",
      loginAt:  new Date().toISOString()
    });

    window.location.href = "app-skeleton.html";

  } catch (error) {
    throw mcAuthError(error.code);
  }
}

// ─────────────────────────────────────────
//  LOG OUT
//  Called from any page with a logout button
// ─────────────────────────────────────────
async function mcLogout() {
  try {
    await signOut(auth);
    await clearSession();
    window.location.href = "index.html";
  } catch (error) {
    console.error("Logout error:", error);
  }
}

// ─────────────────────────────────────────
//  AUTH STATE WATCHER
//  Use this on protected pages to check
//  if a user is logged in. Redirects to
//  login.html if not authenticated.
//
//  Usage in any page:
//    import { requireAuth } from './auth.js';
//    requireAuth();
// ─────────────────────────────────────────
function requireAuth(redirectTo = "login.html") {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      if (user) {
        resolve(user);
      } else {
        window.location.href = redirectTo;
        reject("Not authenticated");
      }
    });
  });
}

// ─────────────────────────────────────────
//  GET CURRENT USER (Firebase Auth)
// ─────────────────────────────────────────
function getCurrentUser() {
  return auth.currentUser;
}

// ─────────────────────────────────────────
//  FETCH USER PROFILE FROM FIRESTORE
// ─────────────────────────────────────────
async function getUserProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : null;
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }
}

// ─────────────────────────────────────────
//  ERROR TRANSLATOR
//  Converts Firebase error codes into
//  friendly, human-readable messages
// ─────────────────────────────────────────
function mcAuthError(code) {
  const messages = {
    "auth/email-already-in-use":    "An account with this email already exists. Please log in.",
    "auth/invalid-email":           "Please enter a valid email address.",
    "auth/weak-password":           "Your password must be at least 6 characters.",
    "auth/user-not-found":          "No account found with this email address.",
    "auth/wrong-password":          "Incorrect password. Please try again.",
    "auth/too-many-requests":       "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed":  "Network error. Please check your connection.",
    "auth/invalid-credential":      "Invalid login details. Please check and try again.",
  };
  return new Error(messages[code] || "Something went wrong. Please try again.");
}

// ─────────────────────────────────────────
//  EXPORTS
//  Import these into signup.html, login.html,
//  and any protected page that needs auth
// ─────────────────────────────────────────
export {
  mcSignUp,
  mcLogin,
  mcLogout,
  requireAuth,
  getCurrentUser,
  getUserProfile,
  auth,
  db
};
