import {
  auth,
  signInWithEmailAndPassword as fbSignInWithEmail,
  createUserWithEmailAndPassword as fbCreateUserWithEmail,
} from './firebase';
import type { UserCredential } from 'firebase/auth';

/**
 * Categorized Firebase Auth Error Codes
 * Used for safe, user-friendly error messaging
 */
export const AUTH_ERROR_CODES = {
  // Operation-related
  OPERATION_NOT_ALLOWED: 'auth/operation-not-allowed',
  UNAUTHORIZED_DOMAIN: 'auth/unauthorized-domain',
  
  // Credential-related
  INVALID_EMAIL: 'auth/invalid-email',
  INVALID_CREDENTIAL: 'auth/invalid-credential',
  WRONG_PASSWORD: 'auth/wrong-password',
  USER_NOT_FOUND: 'auth/user-not-found',
  
  // Account-related
  EMAIL_ALREADY_IN_USE: 'auth/email-already-in-use',
  ACCOUNT_EXISTS_WITH_DIFFERENT_CREDENTIAL: 'auth/account-exists-with-different-credential',
  WEAK_PASSWORD: 'auth/weak-password',
  
  // Rate limiting / Security
  TOO_MANY_REQUESTS: 'auth/too-many-requests',
  USER_DISABLED: 'auth/user-disabled',
  
  // Popup/Network
  POPUP_CLOSED_BY_USER: 'auth/popup-closed-by-user',
  NETWORK_REQUEST_FAILED: 'auth/network-request-failed',
} as const;

/**
 * Safe, user-friendly error messages for each error code.
 * Never exposes raw Firebase error details to the user.
 */
export const USER_FRIENDLY_MESSAGES: Record<string, string> = {
  [AUTH_ERROR_CODES.OPERATION_NOT_ALLOWED]:
    '[ERR_AUTH] Email login is currently disabled by the administrator.',
  
  [AUTH_ERROR_CODES.UNAUTHORIZED_DOMAIN]:
    'This domain is not authorized for Google Sign-In in Firebase Console. Please add this domain to Firebase Authorized Domains or use Email & Password sign-in.',
  
  [AUTH_ERROR_CODES.INVALID_EMAIL]:
    'The email address format is invalid. Please check and try again.',
  
  [AUTH_ERROR_CODES.INVALID_CREDENTIAL]:
    'The email or password you entered is incorrect. Please try again.',
  
  [AUTH_ERROR_CODES.WRONG_PASSWORD]:
    'The password you entered is incorrect. Please try again.',
  
  [AUTH_ERROR_CODES.USER_NOT_FOUND]:
    'No account found with this email. Please sign up first.',
  
  [AUTH_ERROR_CODES.EMAIL_ALREADY_IN_USE]:
    'This email is already registered. Please sign in instead.',
  
  [AUTH_ERROR_CODES.ACCOUNT_EXISTS_WITH_DIFFERENT_CREDENTIAL]:
    'An account with this email exists but was created with a different sign-in method (e.g., Google). Please use that method to sign in.',
  
  [AUTH_ERROR_CODES.WEAK_PASSWORD]:
    'Your password is too weak. Please use at least 6 characters.',
  
  [AUTH_ERROR_CODES.TOO_MANY_REQUESTS]:
    'Too many failed sign-in attempts. Please try again later.',
  
  [AUTH_ERROR_CODES.USER_DISABLED]:
    'This account has been disabled. Please contact support.',
  
  [AUTH_ERROR_CODES.NETWORK_REQUEST_FAILED]:
    'Network error. Please check your connection and try again.',
};

/**
 * Generic fallback message for unknown errors
 */
const UNKNOWN_ERROR_MESSAGE =
  'An authentication error occurred. Please try again.';

/**
 * Extract the error code from a Firebase Auth error.
 * Safely handles various error types (Error objects, plain objects, strings, etc.)
 */
export function extractErrorCode(error: unknown): string {
  if (error instanceof Error) {
    // Firebase AuthError has a 'code' property
    const authError = error as any;
    if (authError.code && typeof authError.code === 'string') {
      return authError.code;
    }
    // Fallback to message parsing for unexpected formats
    return error.message || UNKNOWN_ERROR_MESSAGE;
  }

  if (typeof error === 'object' && error !== null) {
    const obj = error as any;
    if (obj.code && typeof obj.code === 'string') {
      return obj.code;
    }
    if (obj.message && typeof obj.message === 'string') {
      return obj.message;
    }
  }

  return String(error) || UNKNOWN_ERROR_MESSAGE;
}

/**
 * Get a safe, user-friendly error message for a Firebase Auth error code.
 * If the error code is unknown, returns a generic message.
 */
export function getErrorMessage(errorCode: string): string {
  return USER_FRIENDLY_MESSAGES[errorCode] || UNKNOWN_ERROR_MESSAGE;
}

/**
 * Categorize an error as actionable or not.
 * Used to determine if the user should retry or if the error requires admin intervention.
 */
export function categorizeError(
  errorCode: string
): 'user_input_error' | 'rate_limit' | 'service_unavailable' | 'admin_required' | 'unknown' {
  // User provided wrong email/password
  if (
    errorCode === AUTH_ERROR_CODES.INVALID_EMAIL ||
    errorCode === AUTH_ERROR_CODES.INVALID_CREDENTIAL ||
    errorCode === AUTH_ERROR_CODES.WRONG_PASSWORD ||
    errorCode === AUTH_ERROR_CODES.USER_NOT_FOUND ||
    errorCode === AUTH_ERROR_CODES.EMAIL_ALREADY_IN_USE ||
    errorCode === AUTH_ERROR_CODES.ACCOUNT_EXISTS_WITH_DIFFERENT_CREDENTIAL ||
    errorCode === AUTH_ERROR_CODES.WEAK_PASSWORD
  ) {
    return 'user_input_error';
  }

  // Rate limiting - user should retry later
  if (errorCode === AUTH_ERROR_CODES.TOO_MANY_REQUESTS) {
    return 'rate_limit';
  }

  // Network issue - user should retry when connection is stable
  if (errorCode === AUTH_ERROR_CODES.NETWORK_REQUEST_FAILED) {
    return 'service_unavailable';
  }

  // Admin needs to enable email/password provider
  if (
    errorCode === AUTH_ERROR_CODES.OPERATION_NOT_ALLOWED ||
    errorCode === AUTH_ERROR_CODES.USER_DISABLED
  ) {
    return 'admin_required';
  }

  return 'unknown';
}

/**
 * Production-ready email sign-up function.
 * Handles Firebase errors and returns structured result.
 *
 * @param email - User email
 * @param password - User password (min 6 chars)
 * @returns { success: boolean; userCredential?: UserCredential; errorCode?: string; errorMessage?: string }
 */
export async function signUpWithEmail(
  email: string,
  password: string
): Promise<{
  success: boolean;
  userCredential?: UserCredential;
  errorCode?: string;
  errorMessage?: string;
}> {
  // Input validation
  if (!email || !password) {
    return {
      success: false,
      errorCode: 'INVALID_INPUT',
      errorMessage: 'Email and password are required.',
    };
  }

  if (password.length < 6) {
    return {
      success: false,
      errorCode: AUTH_ERROR_CODES.WEAK_PASSWORD,
      errorMessage: getErrorMessage(AUTH_ERROR_CODES.WEAK_PASSWORD),
    };
  }

  try {
    const userCredential = await fbCreateUserWithEmail(auth, email, password);
    return {
      success: true,
      userCredential,
    };
  } catch (error) {
    console.error('[v0] Sign-up error:', error);

    const errorCode = extractErrorCode(error);
    const errorMessage = getErrorMessage(errorCode);
    const category = categorizeError(errorCode);

    console.error('[v0] Error category:', category);

    return {
      success: false,
      errorCode,
      errorMessage,
    };
  }
}

/**
 * Production-ready email sign-in function.
 * Handles Firebase errors and returns structured result.
 *
 * @param email - User email
 * @param password - User password
 * @returns { success: boolean; userCredential?: UserCredential; errorCode?: string; errorMessage?: string }
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<{
  success: boolean;
  userCredential?: UserCredential;
  errorCode?: string;
  errorMessage?: string;
}> {
  // Input validation
  if (!email || !password) {
    return {
      success: false,
      errorCode: 'INVALID_INPUT',
      errorMessage: 'Email and password are required.',
    };
  }

  try {
    const userCredential = await fbSignInWithEmail(auth, email, password);
    return {
      success: true,
      userCredential,
    };
  } catch (error) {
    console.error('[v0] Sign-in error:', error);

    const errorCode = extractErrorCode(error);
    const errorMessage = getErrorMessage(errorCode);
    const category = categorizeError(errorCode);

    console.error('[v0] Error category:', category);

    // Special handling for account conflict (signed up with Google, trying email)
    if (errorCode === AUTH_ERROR_CODES.ACCOUNT_EXISTS_WITH_DIFFERENT_CREDENTIAL) {
      return {
        success: false,
        errorCode,
        errorMessage:
          'This email is already linked to a Google account. Please sign in with Google instead.',
      };
    }

    return {
      success: false,
      errorCode,
      errorMessage,
    };
  }
}

/**
 * Firebase Console Configuration Checklist
 * This is a utility function to document the required setup.
 */
export const FIREBASE_CONFIG_CHECKLIST = `
================================================================================
FIREBASE CONSOLE CONFIGURATION CHECKLIST
================================================================================

STEP 1: Navigate to Firebase Console
  1. Go to https://console.firebase.google.com
  2. Select your project (Flux P2P)
  3. Click "Authentication" in the left sidebar
  
STEP 2: Enable Email/Password Provider
  1. Click the "Sign-in method" tab
  2. In the "Native providers" section, look for "Email/Password"
  3. If it's DISABLED (grayed out):
     a. Click on "Email/Password"
     b. Toggle the "Enable" switch to ON
     c. Make sure "Email/Password" checkbox is checked
     d. Click "Save"
  4. Wait 1-2 minutes for the change to propagate

STEP 3: Verify OAuth Redirect URIs (if using Google Sign-In)
  1. Click the "Settings" gear icon (top left)
  2. Go to "Project settings"
  3. Click the "Authorized domains" tab
  4. Ensure your domain is listed:
     - Development: localhost:3000 (or your dev port)
     - Production: your-domain.com
  5. Add domain if missing: Click "Add domain" and enter it

STEP 4: Verify Email Verification Settings (Optional but Recommended)
  1. Go back to Authentication > Sign-in method
  2. Click on "Email/Password" provider
  3. Check "Email enumeration protection" is enabled (prevents user enumeration attacks)
  4. For production, enable "Email link (passwordless sign-in)" for extra security
  5. Click "Save"

TROUBLESHOOTING:

Q: I still get "auth/operation-not-allowed" error after enabling Email/Password
A: 
  - Clear browser cache and reload
  - Wait 2-3 minutes for Firebase to sync changes
  - Check that you're in the correct Firebase project
  - Try signing in from an incognito window
  
Q: How do I reset this if I accidentally disabled email/password?
A:
  - Go to Authentication > Sign-in method
  - Click "Email/Password" provider
  - Toggle the Enable switch back ON
  - Save changes

Q: Can I use the same email for both Email/Password AND Google Sign-In?
A:
  - Yes, Firebase automatically links accounts if the email matches
  - User will see: "Account exists with different method" error
  - They can still access their account via either method
  - The account linking is automatic after first successful sign-in

PRODUCTION CHECKLIST:
  [ ] Email/Password provider is ENABLED in Firebase Console
  [ ] OAuth redirect URIs include your production domain
  [ ] Email verification is configured (recommended)
  [ ] Password requirements are set (min 6 chars for demo, consider 12+ for production)
  [ ] You have a password reset flow (Firebase provides this by default)
  [ ] Error messages are user-friendly (not raw Firebase errors)
`;

/**
 * Log the Firebase configuration checklist to console for reference
 */
export function logConfigChecklist() {
  console.log(FIREBASE_CONFIG_CHECKLIST);
}
