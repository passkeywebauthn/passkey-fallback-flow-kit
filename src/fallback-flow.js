/**
 * `createPasskeyFlow()` — a tiny, framework-agnostic state machine that
 * orchestrates a passkey sign-in attempt and its fallback path.
 *
 * The flow:
 *   idle → authenticating → (success)
 *                         → (fallback) when no passkey / user cancels
 *                         → (error)    on a genuine technical failure
 *
 * You supply the two async operations. The kit supplies the orchestration,
 * error classification, and a clean event API. It renders no UI of its own so
 * it composes with React, Vue, or plain DOM.
 *
 * Design notes:
 *   - `NotAllowedError` (cancel/timeout) and "no credential" route to the
 *     FALLBACK state, not the ERROR state — the user can still sign in.
 *   - A programmatic abort routes to fallback too (nothing went wrong).
 *   - Genuine technical failures route to ERROR.
 *
 * Guides:
 *   - Password → passkey fallback patterns: https://www.passkeywebauthn.com/frontend-ux-and-conditional-mediation/progressive-enhancement-and-fallback-flows/password-to-passkey-fallback-ui-patterns/
 *   - Progressive enhancement overview:     https://www.passkeywebauthn.com/frontend-ux-and-conditional-mediation/progressive-enhancement-and-fallback-flows/
 */

import { isWebAuthnAvailable } from './feature-detect.js';
import { classifyPasskeyError, isUserCancellation } from './errors.js';

/**
 * @typedef {'idle'|'authenticating'|'success'|'fallback'|'error'} PasskeyFlowState
 */

/**
 * @typedef {object} PasskeyFlowEvent
 * @property {PasskeyFlowState} state       Current state after the transition.
 * @property {PasskeyFlowState} [prevState] State we transitioned from.
 * @property {unknown}          [result]    Credential/result on success.
 * @property {unknown}          [error]     Raw error, when state === 'error'.
 * @property {string}           [reason]    Machine reason: 'cancelled', 'no-credential', 'unsupported', 'aborted', 'failed'.
 * @property {string}           [message]   Human-readable status message.
 */

/**
 * @typedef {object} PasskeyFlowOptions
 * @property {() => Promise<any>} authenticate
 *   Runs the passkey ceremony (e.g. calls `navigator.credentials.get(...)`
 *   with your server-issued options) and resolves with the credential/assertion
 *   or your verified result. Reject to trigger fallback/error handling.
 * @property {(ctx: { reason: string, error?: unknown }) => (void|Promise<any>)} [fallback]
 *   Invoked when the passkey path cannot complete (cancel, no credential,
 *   unsupported, abort). Show your password/OTP UI here. Optional — you may
 *   also just listen for the `'fallback'` event.
 * @property {(event: PasskeyFlowEvent) => void} [onChange]  Called on every transition.
 * @property {(event: PasskeyFlowEvent) => void} [onSuccess] Called on success.
 * @property {(event: PasskeyFlowEvent) => void} [onFallback] Called when falling back.
 * @property {(event: PasskeyFlowEvent) => void} [onError]   Called on genuine error.
 * @property {boolean} [requireWebAuthn=true]
 *   When true and WebAuthn is unavailable, `start()` goes straight to fallback
 *   (reason `'unsupported'`) instead of attempting the ceremony.
 */

const MESSAGES = {
  idle: '',
  authenticating: 'Waiting for your passkey…',
  success: 'Signed in with your passkey.',
  cancelled: 'Passkey sign-in was cancelled. You can try another way to sign in.',
  'no-credential': 'No passkey was found on this device. Try another sign-in method.',
  unsupported: 'Passkeys are not available here. Use another sign-in method.',
  aborted: 'Passkey sign-in was stopped. You can try another way to sign in.',
  failed: 'Something went wrong with passkey sign-in. Please try another method.',
};

/**
 * Create a passkey sign-in flow controller.
 *
 * @param {PasskeyFlowOptions} options
 * @returns {{
 *   start: () => Promise<PasskeyFlowState>,
 *   getState: () => PasskeyFlowState,
 *   reset: () => void,
 *   on: (type: string, listener: (e: PasskeyFlowEvent) => void) => () => void,
 *   events: EventTarget,
 * }}
 */
export function createPasskeyFlow(options) {
  if (!options || typeof options.authenticate !== 'function') {
    throw new TypeError('createPasskeyFlow: `authenticate` function is required.');
  }
  const {
    authenticate,
    fallback,
    onChange,
    onSuccess,
    onFallback,
    onError,
    requireWebAuthn = true,
  } = options;

  const events = new EventTarget();
  /** @type {PasskeyFlowState} */
  let state = 'idle';
  let inFlight = false;

  /**
   * @param {PasskeyFlowState} next
   * @param {Partial<PasskeyFlowEvent>} [detail]
   */
  function transition(next, detail = {}) {
    const prevState = state;
    state = next;
    const event = /** @type {PasskeyFlowEvent} */ ({
      state: next,
      prevState,
      message: detail.message ?? MESSAGES[next] ?? MESSAGES.idle,
      ...detail,
    });

    // Custom events (for `on()` / `events` consumers).
    events.dispatchEvent(new CustomEvent('change', { detail: event }));
    events.dispatchEvent(new CustomEvent(next, { detail: event }));

    // Direct callbacks.
    if (typeof onChange === 'function') safeCall(onChange, event);
    if (next === 'success' && typeof onSuccess === 'function') safeCall(onSuccess, event);
    if (next === 'fallback' && typeof onFallback === 'function') safeCall(onFallback, event);
    if (next === 'error' && typeof onError === 'function') safeCall(onError, event);

    return event;
  }

  /**
   * @param {(e: PasskeyFlowEvent) => void} fn
   * @param {PasskeyFlowEvent} event
   */
  function safeCall(fn, event) {
    try {
      fn(event);
    } catch {
      /* never let a listener break the state machine */
    }
  }

  /**
   * Route into the fallback state and invoke the caller's fallback handler.
   * @param {string} reason
   * @param {unknown} [error]
   */
  async function goFallback(reason, error) {
    const event = transition('fallback', {
      reason,
      error,
      message: MESSAGES[reason] ?? MESSAGES.failed,
    });
    if (typeof fallback === 'function') {
      try {
        await fallback({ reason, error });
      } catch {
        /* the fallback UI owns its own error handling */
      }
    }
    return event;
  }

  /**
   * Begin the passkey attempt. Safe to await; resolves with the terminal state
   * (`'success' | 'fallback' | 'error'`). Ignores concurrent calls while a run
   * is already in flight.
   * @returns {Promise<PasskeyFlowState>}
   */
  async function start() {
    if (inFlight) return state;
    inFlight = true;
    try {
      if (requireWebAuthn && !isWebAuthnAvailable()) {
        await goFallback('unsupported');
        return state;
      }

      transition('authenticating');

      let result;
      try {
        result = await authenticate();
      } catch (error) {
        // A null/empty resolution is handled below; here we handle rejections.
        if (isUserCancellation(error)) {
          const kind = classifyPasskeyError(error);
          const reason = kind === 'aborted' ? 'aborted' : 'cancelled';
          await goFallback(reason, error);
          return state;
        }
        transition('error', {
          error,
          reason: 'failed',
          message: MESSAGES.failed,
        });
        return state;
      }

      // Some flows resolve with null/undefined to signal "no credential".
      if (result === null || result === undefined) {
        await goFallback('no-credential');
        return state;
      }

      transition('success', { result });
      return state;
    } finally {
      inFlight = false;
    }
  }

  /** Reset back to `idle` so the flow can be re-run. */
  function reset() {
    if (inFlight) return;
    transition('idle');
  }

  /**
   * Subscribe to a flow event: `'change'`, `'authenticating'`, `'success'`,
   * `'fallback'`, `'error'`, or `'idle'`. Returns an unsubscribe function.
   * @param {string} type
   * @param {(e: PasskeyFlowEvent) => void} listener
   * @returns {() => void}
   */
  function on(type, listener) {
    const wrapped = (/** @type {Event} */ e) => listener(/** @type {CustomEvent} */ (e).detail);
    events.addEventListener(type, wrapped);
    return () => events.removeEventListener(type, wrapped);
  }

  return {
    start,
    getState: () => state,
    reset,
    on,
    events,
  };
}
