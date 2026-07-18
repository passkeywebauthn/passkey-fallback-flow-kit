/**
 * Feature detection helpers for WebAuthn / passkeys.
 *
 * Every helper is defensive: it never throws, and it degrades gracefully when
 * the relevant API is missing, when running outside a secure context, or when
 * `window` / `navigator` are unavailable (e.g. server-side rendering).
 *
 * See the guide on feature-detecting passkey support:
 * https://www.passkeywebauthn.com/frontend-ux-and-conditional-mediation/progressive-enhancement-and-fallback-flows/feature-detecting-passkey-support/
 */

/**
 * Is there a `window` object at all? Guards against SSR / worker contexts.
 * @returns {boolean}
 */
function hasWindow() {
  return typeof window !== 'undefined' && window !== null;
}

/**
 * Are we in a secure context (https or localhost)? WebAuthn requires it.
 * When the API is unavailable we assume `false` to stay on the safe side.
 * @returns {boolean}
 */
export function isSecureContextAvailable() {
  if (!hasWindow()) return false;
  // `isSecureContext` is widely supported; treat undefined as not-secure.
  return window.isSecureContext === true;
}

/**
 * Is the core WebAuthn API present?
 *
 * Checks for `PublicKeyCredential` and `navigator.credentials.create/get`.
 * Does NOT require a secure context by itself — call `isSecureContextAvailable()`
 * if you need that guarantee. (Most browsers only expose the API in secure
 * contexts anyway, but this keeps the check honest.)
 *
 * @returns {boolean}
 */
export function isWebAuthnAvailable() {
  if (!hasWindow()) return false;
  try {
    if (typeof window.PublicKeyCredential !== 'function') return false;
    const creds = window.navigator && window.navigator.credentials;
    if (!creds) return false;
    return (
      typeof creds.create === 'function' && typeof creds.get === 'function'
    );
  } catch {
    return false;
  }
}

/**
 * Is a user-verifying platform authenticator (Touch ID, Windows Hello,
 * Android biometrics, …) available on this device?
 *
 * Wraps `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`.
 * Resolves to `false` (never rejects) when the API or platform support is
 * missing.
 *
 * @returns {Promise<boolean>}
 */
export async function isPlatformAuthenticatorAvailable() {
  if (!isWebAuthnAvailable()) return false;
  const PKC = window.PublicKeyCredential;
  if (typeof PKC.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
    return false;
  }
  try {
    return (await PKC.isUserVerifyingPlatformAuthenticatorAvailable()) === true;
  } catch {
    return false;
  }
}

/**
 * Is conditional mediation (passkey autofill) available?
 *
 * Wraps `PublicKeyCredential.isConditionalMediationAvailable()`. Resolves to
 * `false` (never rejects) when the API is missing or throws.
 *
 * See the browser support matrix:
 * https://www.passkeywebauthn.com/frontend-ux-and-conditional-mediation/conditional-mediation-and-autofill-ui/browser-support-matrix-for-conditional-mediation/
 *
 * @returns {Promise<boolean>}
 */
export async function isConditionalMediationAvailable() {
  if (!isWebAuthnAvailable()) return false;
  const PKC = window.PublicKeyCredential;
  if (typeof PKC.isConditionalMediationAvailable !== 'function') {
    return false;
  }
  try {
    return (await PKC.isConditionalMediationAvailable()) === true;
  } catch {
    return false;
  }
}

/**
 * Convenience: gather a full capability snapshot in one call.
 *
 * @returns {Promise<{
 *   secureContext: boolean,
 *   webauthn: boolean,
 *   platformAuthenticator: boolean,
 *   conditionalMediation: boolean,
 * }>}
 */
export async function getPasskeyCapabilities() {
  const webauthn = isWebAuthnAvailable();
  const [platformAuthenticator, conditionalMediation] = await Promise.all([
    isPlatformAuthenticatorAvailable(),
    isConditionalMediationAvailable(),
  ]);
  return {
    secureContext: isSecureContextAvailable(),
    webauthn,
    platformAuthenticator,
    conditionalMediation,
  };
}
