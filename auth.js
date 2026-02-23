// ============================================================
//  auth.js — MC Store Authentication Manager v2
//  Handles: Signup, Smart Login (email/phone), Google Login,
//           Forgot Password, Persistence, Auto-Login, Logout
//  Firebase config is embedded here.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { saveSession, clearSession, getSession } from "./session.js";

// ─────────────────────────────────────────
//  FIREBASE CONFIG
//  Replace placeholder values with your real
//  credentials from Firebase Console →
//  Project Settings → Your Apps → SDK setup
// ─────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyC7trJbzcIix4HgPEHCybb6E7Ztkc39kfw",
  authDomain:        "mc-store-b6beb.firebaseapp.com",
  projectId:         "mc-store-b6beb",
  storageBucket:     "mc-store-b6beb.firebasestorage.app",
  messagingSenderId: "930964754103",
  appId:             "1:930964754103:web:0e79c3dcd6bcc4dafc8732"
};

// ─────────────────────────────────────────
//  INITIALISE FIREBASE
// ─────────────────────────────────────────
const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getFirestore(app);
const provider = new GoogleAuthProvider();

// Always show Google account picker
provider.setCustomParameters({ prompt: "select_account" });

// ─────────────────────────────────────────
//  DETECT INPUT TYPE
//  Returns 'email' or 'phone'
//  Used by smart login + forgot password
// ─────────────────────────────────────────
function detectInputType(value) {
  const cleaned = value.replace(/\s/g, "");
  const isPhone = /^(\+?234|0)[789][01]\d{8}$/.test(cleaned);
  return isPhone ? "phone" : "email";
}

// ─────────────────────────────────────────
//  SET PERSISTENCE
//  Called before every login.
//  rememberMe = true  → survives browser close
//  rememberMe = false → clears on browser close
// ─────────────────────────────────────────
async function mcSetPersistence(rememberMe) {
  const mode = rememberMe ? browserLocalPersistence : browserSessionPersistence;
  await setPersistence(auth, mode);
}

// ─────────────────────────────────────────
//  SIGN UP
//  Called after Step 2 of signup.html
// ─────────────────────────────────────────
async function mcSignUp({ fullName, email, password, phone, address }) {
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const user = credential.user;

    await updateProfile(user, { displayName: fullName });

    await setDoc(doc(db, "users", user.uid), {
      uid:       user.uid,
      fullName,
      email,
      phone,
      address,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
      role:      "customer",
      provider:  "email"
    });

    await saveSession({
      uid:      user.uid,
      fullName,
      email,
      phone,
      address,
      loginAt:  new Date().toISOString()
    });

    window.location.href = "app-skeleton.html";

  } catch (error) {
    throw mcAuthError(error.code, error);
  }
}

// ─────────────────────────────────────────
//  LOGIN — EMAIL
//  Direct email + password login
// ─────────────────────────────────────────
async function mcLogin({ email, password, rememberMe = false }) {
  try {
    await mcSetPersistence(rememberMe);

    const credential = await signInWithEmailAndPassword(auth, email, password);
    const user       = credential.user;

    const snap    = await getDoc(doc(db, "users", user.uid));
    const profile = snap.exists() ? snap.data() : {};

    if (snap.exists()) {
      await updateDoc(doc(db, "users", user.uid), {
        lastLogin: serverTimestamp()
      });
    }

    await saveSession({
      uid:       user.uid,
      fullName:  profile.fullName || user.displayName || "",
      email:     user.email,
      phone:     profile.phone    || "",
      address:   profile.address  || "",
      loginAt:   new Date().toISOString(),
      rememberMe
    });

    window.location.href = "app-skeleton.html";

  } catch (error) {
    throw mcAuthError(error.code, error);
  }
}

// ─────────────────────────────────────────
//  LOGIN — PHONE
//  Looks up email linked to phone in
//  Firestore, then logs in with email+password
// ─────────────────────────────────────────
async function mcLoginWithPhone({ phone, password, rememberMe = false }) {
  try {
    const cleaned  = phone.replace(/\s/g, "");
    const q        = query(collection(db, "users"), where("phone", "==", cleaned));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      throw new Error(
        "No account found with this phone number. Try logging in with your email address instead."
      );
    }

    const userData = snapshot.docs[0].data();
    await mcLogin({ email: userData.email, password, rememberMe });

  } catch (error) {
    if (error.message) throw error;
    throw mcAuthError(error.code, error);
  }
}

// ─────────────────────────────────────────
//  SMART LOGIN
//  Auto-detects email or phone and routes
//  to the right function automatically.
//  This is what login.html always calls.
// ─────────────────────────────────────────
async function mcSmartLogin({ identifier, password, rememberMe = false }) {
  const type = detectInputType(identifier.trim());

  if (type === "phone") {
    await mcLoginWithPhone({
      phone: identifier.trim(),
      password,
      rememberMe
    });
  } else {
    await mcLogin({
      email: identifier.trim(),
      password,
      rememberMe
    });
  }
}

// ─────────────────────────────────────────
//  GOOGLE LOGIN
//  Opens Google popup, creates Firestore
//  profile if new user, saves session,
//  then redirects to app.
// ─────────────────────────────────────────
async function mcGoogleLogin({ rememberMe = false } = {}) {
  try {
    await mcSetPersistence(rememberMe);

    const result = await signInWithPopup(auth, provider);
    const user   = result.user;

    const snap = await getDoc(doc(db, "users", user.uid));

    if (!snap.exists()) {
      // New Google user — create full profile
      await setDoc(doc(db, "users", user.uid), {
        uid:       user.uid,
        fullName:  user.displayName || "",
        email:     user.email       || "",
        phone:     "",
        address:   "",
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
        role:      "customer",
        provider:  "google"
      });
    } else {
      await updateDoc(doc(db, "users", user.uid), {
        lastLogin: serverTimestamp()
      });
    }

    const profile = snap.exists() ? snap.data() : {};

    await saveSession({
      uid:       user.uid,
      fullName:  user.displayName  || profile.fullName || "",
      email:     user.email        || "",
      phone:     profile.phone     || "",
      address:   profile.address   || "",
      loginAt:   new Date().toISOString(),
      rememberMe,
      provider:  "google"
    });

    window.location.href = "app-skeleton.html";

  } catch (error) {
    // User just closed the popup — not an error
    if (
      error.code === "auth/popup-closed-by-user" ||
      error.code === "auth/cancelled-popup-request"
    ) return;

    throw mcAuthError(error.code, error);
  }
}

// ─────────────────────────────────────────
//  FORGOT PASSWORD
//  Sends Firebase reset email.
//  If phone detected → friendly message to
//  use email instead.
// ─────────────────────────────────────────
async function mcForgotPassword(identifier) {
  const trimmed = identifier.trim();
  const type    = detectInputType(trimmed);

  if (type === "phone") {
    throw new Error(
      "Password reset works via email only. Please enter the email address linked to your MC Store account."
    );
  }

  try {
    await sendPasswordResetEmail(auth, trimmed);
    return { sent: true };
  } catch (error) {
    throw mcAuthError(error.code, error);
  }
}

// ─────────────────────────────────────────
//  AUTO-LOGIN CHECK
//  Call on login.html page load.
//  If IndexedDB has a session AND Firebase
//  confirms the user is still logged in →
//  redirect straight to app-skeleton.html.
// ─────────────────────────────────────────
async function mcCheckAutoLogin() {
  try {
    const session = await getSession();
    if (!session || !session.uid) return false;

    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        if (user && user.uid === session.uid) {
          window.location.href = "app-skeleton.html";
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────
//  LOGOUT
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
//  REQUIRE AUTH — Page Guard
//  Import and call on any protected page.
//  Redirects to login.html if not logged in.
//
//  Usage:
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
//  HELPERS
// ─────────────────────────────────────────
function getCurrentUser() {
  return auth.currentUser;
}

async function getUserProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : null;
  } catch (error) {
    console.error("getUserProfile error:", error);
    return null;
  }
}

// ─────────────────────────────────────────
//  ERROR TRANSLATOR
//  Friendly Nigerian-context error messages
// ─────────────────────────────────────────
function mcAuthError(code, originalError) {
  // Log the real error so developer can debug
  if (originalError) {
    console.error("MC Store Auth Error:", {
      code:    originalError.code,
      message: originalError.message
    });
  }

  const messages = {
    // Account errors
    "auth/email-already-in-use":                     "An account with this email already exists. Please log in instead.",
    "auth/user-not-found":                           "No account found with these details. Please check or create an account.",
    "auth/user-disabled":                            "This account has been disabled. Please contact MC Store support.",

    // Password / credential errors
    "auth/wrong-password":                           "Incorrect password. Please try again.",
    "auth/invalid-password":                         "Incorrect password. Please try again.",
    "auth/invalid-credential":                       "Incorrect email or password. Please check and try again.",
    "auth/invalid-login-credentials":                "Incorrect email or password. Please check and try again.",
    "auth/missing-password":                         "Please enter your password.",
    "auth/INVALID_LOGIN_CREDENTIALS":                "Incorrect email or password. Please check and try again.",

    // Email errors
    "auth/invalid-email":                            "Please enter a valid email address.",
    "auth/missing-email":                            "Please enter your email address.",

    // Rate / network
    "auth/too-many-requests":                        "Too many failed attempts. Please wait a few minutes and try again.",
    "auth/network-request-failed":                   "Network error. Please check your internet connection and try again.",
    "auth/timeout":                                  "Request timed out. Please check your connection.",

    // Password strength
    "auth/weak-password":                            "Your password must be at least 6 characters long.",

    // Google / popup
    "auth/popup-blocked":                            "Please allow popups in your browser to use Google Sign-In.",
    "auth/popup-closed-by-user":                     "Google sign-in was cancelled. Please try again.",
    "auth/cancelled-popup-request":                  "Google sign-in was cancelled. Please try again.",
    "auth/account-exists-with-different-credential": "An account with this email already exists. Please log in with your password.",

    // Session
    "auth/requires-recent-login":                    "Please log in again to continue.",
    "auth/user-token-expired":                       "Your session has expired. Please log in again.",
  };

  // Use friendly message if code is known
  if (code && messages[code]) return new Error(messages[code]);

  // Use original error message if it is not a raw Firebase one
  if (originalError && originalError.message &&
      !originalError.message.toLowerCase().includes("firebase") &&
      !originalError.message.toLowerCase().includes("(auth/")) {
    return new Error(originalError.message);
  }

  return new Error("Something went wrong. Please check your details and try again.");
}

// ─────────────────────────────────────────
//  EXPORTS
// ─────────────────────────────────────────
export {
  mcSignUp,
  mcLogin,
  mcSmartLogin,
  mcGoogleLogin,
  mcForgotPassword,
  mcCheckAutoLogin,
  mcLogout,
  mcSetPersistence,
  detectInputType,
  requireAuth,
  getCurrentUser,
  getUserProfile,
  auth,
  db
};
