/**
 * Error classification helpers for WebAuthn ceremonies.
 *
 * The hardest part of passkey UX is telling apart the several very different
 * situations that all surface as a `NotAllowedError`:
 *   - the user actively cancelled the prompt,
 *   - the ceremony timed out,
 *   - no usable credential was found, or
 *   - the request was aborted programmatically (AbortController).
 *
 * These helpers normalise a caught error into a small, stable shape so callers
 * can branch on intent rather than on brittle string matching.
 *
 * Background reading:
 *   - Fixing NotAllowedError: https://www.passkeywebauthn.com/frontend-ux-and-conditional-mediation/debugging-and-observability/fixing-notallowederror-in-webauthn/
 *   - Timeout & AbortError:   https://www.passkeywebauthn.com/frontend-ux-and-conditional-mediation/debugging-and-observability/resolving-webauthn-timeout-and-aborterror/
 */

/**
 * @typedef {(
 *   'aborted' |
 *   'cancelled-or-timeout' |
 *   'no-credential' |
 *   'invalid-state' |
 *   'security' |
 *   'not-supported' |
 *   'unknown'
 * )} PasskeyErrorKind
 */

/**
 * Read a DOMException-ish `name` off an unknown error, defensively.
 * @param {unknown} err
 * @returns {string}
 */
export function errorName(err) {
  if (err && typeof err === 'object' && typeof (/** @type {any} */ (err).name) === 'string') {
    return /** @type {any} */ (err).name;
  }
  return '';
}

/**
 * Classify a WebAuthn error into a coarse, actionable kind.
 *
 * Note the deliberate limitation: the WebAuthn spec collapses "user cancelled",
 * "timed out", and (often) "no credential" all into `NotAllowedError`, so this
 * function returns `'cancelled-or-timeout'` for a bare `NotAllowedError`. Use
 * {@link isUserCancellation} together with your own timing/telemetry if you
 * need a finer distinction, and prefer an explicit `AbortController` so genuine
 * aborts surface as `AbortError` instead.
 *
 * @param {unknown} err
 * @returns {PasskeyErrorKind}
 */
export function classifyPasskeyError(err) {
  const name = errorName(err);
  switch (name) {
    case 'AbortError':
      return 'aborted';
    case 'NotAllowedError':
      return 'cancelled-or-timeout';
    case 'InvalidStateError':
      // Typically: this authenticator is already registered (during create).
      return 'invalid-state';
    case 'SecurityError':
      return 'security';
    case 'NotSupportedError':
    case 'ConstraintError':
      return 'not-supported';
    default:
      return 'unknown';
  }
}

/**
 * Did the ceremony end because it was aborted programmatically
 * (e.g. an AbortController we own signalled)?
 * @param {unknown} err
 * @returns {boolean}
 */
export function isAbortError(err) {
  return errorName(err) === 'AbortError';
}

/**
 * Best-effort: does this look like the user declining / dismissing the prompt
 * (as opposed to a technical failure)?
 *
 * Because the platform conflates cancel and timeout under `NotAllowedError`,
 * this returns `true` for both. It is intended to drive "no harm done, here
 * are other ways to sign in" messaging rather than error reporting.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isUserCancellation(err) {
  const kind = classifyPasskeyError(err);
  return kind === 'cancelled-or-timeout' || kind === 'aborted';
}
