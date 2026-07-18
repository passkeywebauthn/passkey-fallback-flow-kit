/**
 * `mountConditionalUI()` — start a conditional-mediation (passkey autofill)
 * ceremony that surfaces passkeys in the browser's autofill dropdown.
 *
 * Conditional mediation lets `navigator.credentials.get()` run quietly in the
 * background: instead of a modal, matching passkeys appear as autofill
 * suggestions on your username/password fields. This helper:
 *   - gates the call on `isConditionalMediationAvailable()`,
 *   - wires an `AbortController` so you can cancel it cleanly,
 *   - is safe to call once (guards against double-mounting), and
 *   - normalises success/cancel/error into callbacks.
 *
 * IMPORTANT — markup requirement: your input must advertise WebAuthn to the
 * browser's autofill, e.g. `<input autocomplete="username webauthn">` (or
 * `"current-password webauthn"`). Without it the passkey suggestions won't
 * appear. See {@link CONDITIONAL_UI_AUTOCOMPLETE}.
 *
 * Guides:
 *   - Conditional mediation & autofill UI: https://www.passkeywebauthn.com/frontend-ux-and-conditional-mediation/conditional-mediation-and-autofill-ui/
 *   - Implementing with SimpleWebAuthn:    https://www.passkeywebauthn.com/frontend-ux-and-conditional-mediation/conditional-mediation-and-autofill-ui/implementing-conditional-ui-with-simplewebauthn/
 */

import { isConditionalMediationAvailable, isWebAuthnAvailable } from './feature-detect.js';
import { isAbortError, classifyPasskeyError } from './errors.js';

/**
 * The `autocomplete` token to add to a sign-in field so the browser offers
 * passkeys inline. Combine with the field's normal token, e.g.
 * `autocomplete="username webauthn"`.
 * @type {string}
 */
export const CONDITIONAL_UI_AUTOCOMPLETE = 'webauthn';

/**
 * @typedef {object} MountConditionalUIOptions
 * @property {() => Promise<PublicKeyCredentialRequestOptions|{ publicKey: PublicKeyCredentialRequestOptions }>} getRequestOptions
 *   Returns the assertion request options from your server (challenge, rpId,
 *   allowCredentials, …). May return either the bare options or a
 *   `{ publicKey }` wrapper — both are accepted.
 * @property {(credential: any) => (void|Promise<void>)} onSuccess
 *   Called with the credential/assertion when a passkey is selected.
 * @property {(error: unknown, info: { kind: string, aborted: boolean }) => void} [onError]
 *   Called on a genuine error. NOT called for a clean abort.
 * @property {() => void} [onUnavailable]
 *   Called (instead of starting) when conditional mediation isn't available.
 * @property {AbortController} [signalController]
 *   Provide your own controller to coordinate aborts (e.g. cancel autofill when
 *   the user starts a modal ceremony). One is created if omitted.
 */

/**
 * @typedef {object} ConditionalUIHandle
 * @property {boolean} started       Did the ceremony actually start?
 * @property {string}  [reason]      Why it didn't start ('unsupported' | 'unavailable' | 'already-started').
 * @property {() => void} abort      Cancel the in-flight conditional request.
 * @property {AbortController} controller  The controller wiring the request.
 * @property {Promise<void>} done    Resolves when the ceremony settles.
 */

// Module-level guard so `mountConditionalUI` is effectively call-once per page
// load unless the previous attempt was aborted/finished. Conditional get()
// calls conflict if two run at the same time.
let activeController = null;

/**
 * Start a conditional-mediation credential request.
 *
 * @param {MountConditionalUIOptions} options
 * @returns {Promise<ConditionalUIHandle>}
 */
export async function mountConditionalUI(options) {
  const {
    getRequestOptions,
    onSuccess,
    onError,
    onUnavailable,
    signalController,
  } = options || {};

  if (typeof getRequestOptions !== 'function') {
    throw new TypeError('mountConditionalUI: `getRequestOptions` function is required.');
  }
  if (typeof onSuccess !== 'function') {
    throw new TypeError('mountConditionalUI: `onSuccess` function is required.');
  }

  /** @param {ConditionalUIHandle} h */
  const notStarted = (reason) => ({
    started: false,
    reason,
    abort: () => {},
    controller: signalController || new AbortController(),
    done: Promise.resolve(),
  });

  if (!isWebAuthnAvailable()) {
    if (typeof onUnavailable === 'function') onUnavailable();
    return notStarted('unsupported');
  }

  if (!(await isConditionalMediationAvailable())) {
    if (typeof onUnavailable === 'function') onUnavailable();
    return notStarted('unavailable');
  }

  // Call-once guard: don't run two conditional gets concurrently.
  if (activeController) {
    return notStarted('already-started');
  }

  const controller = signalController || new AbortController();
  activeController = controller;

  const abort = () => {
    try {
      controller.abort();
    } catch {
      /* ignore */
    }
  };

  const done = (async () => {
    try {
      const raw = await getRequestOptions();
      const publicKey = raw && raw.publicKey ? raw.publicKey : raw;

      const credential = await navigator.credentials.get({
        mediation: 'conditional',
        publicKey,
        signal: controller.signal,
      });

      // A conditional get resolves with the credential once the user picks a
      // passkey. Null is unusual here but handled defensively.
      if (credential) {
        await onSuccess(credential);
      }
    } catch (error) {
      if (isAbortError(error)) {
        // Clean cancellation (we or the page aborted) — not an error.
        return;
      }
      if (typeof onError === 'function') {
        onError(error, {
          kind: classifyPasskeyError(error),
          aborted: false,
        });
      }
    } finally {
      if (activeController === controller) activeController = null;
    }
  })();

  return {
    started: true,
    abort,
    controller,
    done,
  };
}

/**
 * Test/SSR escape hatch: clear the module-level call-once guard.
 * Rarely needed in production; handy between unit tests.
 */
export function __resetConditionalUIGuard() {
  activeController = null;
}
