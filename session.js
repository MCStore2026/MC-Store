// ============================================================
//  session.js — MC Store Session Manager
//  Controls IndexedDB for local session storage.
//  Stores: UID, Full Name, Email, Phone,
//          Delivery Address, Login Timestamp
//
//  Used by: auth.js, signup.html, login.html,
//           app-skeleton.html, any protected page
// ============================================================

const DB_NAME    = "MCStoreDB";
const DB_VERSION = 1;
const STORE_NAME = "session";
const SESSION_KEY = "currentUser";

// ─────────────────────────────────────────
//  OPEN / INITIALISE IndexedDB
// ─────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess  = (e) => resolve(e.target.result);
    request.onerror    = (e) => reject(e.target.error);
  });
}

// ─────────────────────────────────────────
//  SAVE SESSION
//  Called after successful signup or login.
//  Stores all user data into IndexedDB.
//
//  @param {Object} userData - user profile
//    { uid, fullName, email, phone, address, loginAt }
// ─────────────────────────────────────────
async function saveSession(userData) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const record = {
        key:       SESSION_KEY,
        uid:       userData.uid       || "",
        fullName:  userData.fullName  || "",
        email:     userData.email     || "",
        phone:     userData.phone     || "",
        address:   userData.address   || "",
        loginAt:   userData.loginAt   || new Date().toISOString(),
        savedAt:   new Date().toISOString()
      };

      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror   = (e) => reject(e.target.error);
    });
  } catch (error) {
    console.error("saveSession error:", error);
    throw error;
  }
}

// ─────────────────────────────────────────
//  GET SESSION
//  Returns the stored user session object,
//  or null if no session exists.
//
//  Usage:
//    const user = await getSession();
//    if (!user) window.location.href = 'login.html';
// ─────────────────────────────────────────
async function getSession() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req   = store.get(SESSION_KEY);

      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror   = (e) => reject(e.target.error);
    });
  } catch (error) {
    console.error("getSession error:", error);
    return null;
  }
}

// ─────────────────────────────────────────
//  CLEAR SESSION
//  Called on logout. Wipes local session
//  from IndexedDB completely.
// ─────────────────────────────────────────
async function clearSession() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req   = store.delete(SESSION_KEY);

      req.onsuccess = () => resolve(true);
      req.onerror   = (e) => reject(e.target.error);
    });
  } catch (error) {
    console.error("clearSession error:", error);
    throw error;
  }
}

// ─────────────────────────────────────────
//  UPDATE SESSION FIELD
//  Update a single field in the session
//  without wiping the whole record.
//
//  Usage:
//    await updateSession('phone', '08012345678');
// ─────────────────────────────────────────
async function updateSession(field, value) {
  try {
    const current = await getSession();
    if (!current) throw new Error("No active session to update.");
    current[field] = value;
    current.savedAt = new Date().toISOString();
    await saveSession(current);
    return true;
  } catch (error) {
    console.error("updateSession error:", error);
    throw error;
  }
}

// ─────────────────────────────────────────
//  IS LOGGED IN
//  Quick boolean check — useful for
//  guarding pages or showing/hiding UI.
//
//  Usage:
//    if (!(await isLoggedIn())) {
//      window.location.href = 'login.html';
//    }
// ─────────────────────────────────────────
async function isLoggedIn() {
  const session = await getSession();
  return session !== null && session.uid !== "";
}

// ─────────────────────────────────────────
//  EXPORTS
// ─────────────────────────────────────────
export {
  saveSession,
  getSession,
  clearSession,
  updateSession,
  isLoggedIn
};
