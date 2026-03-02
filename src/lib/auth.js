/**
 * GRAVI Local Auth
 * Network-free authentication using a password stored in Vercel env vars.
 * No Supabase auth calls — works on any network, any ISP.
 */

const SESSION_KEY = 'gravi_local_auth';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

/**
 * Returns the password set in the environment.
 * Set VITE_APP_PASSWORD in Vercel environment variables.
 * Falls back to a default dev password if env var is missing.
 */
function getAppPassword() {
    return import.meta.env.VITE_APP_PASSWORD || 'gravi2024';
}

/** Attempt to sign in. Returns { success: true } or { success: false, error: string } */
export function localSignIn(password) {
    if (!password || password.trim() === '') {
        return { success: false, error: 'Please enter a password.' };
    }
    if (password !== getAppPassword()) {
        return { success: false, error: 'Incorrect password. Please try again.' };
    }
    // Store session with expiry
    const session = {
        loggedIn: true,
        expiresAt: Date.now() + SESSION_DURATION_MS,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { success: true };
}

/** Check if a valid local session exists. */
export function getLocalSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw);
        if (!session?.loggedIn) return null;
        if (Date.now() > session.expiresAt) {
            localStorage.removeItem(SESSION_KEY);
            return null;
        }
        return session;
    } catch {
        return null;
    }
}

/** Sign out — clears the local session. */
export function localSignOut() {
    localStorage.removeItem(SESSION_KEY);
}
