/**
 * passkey-fallback-flow-kit — public API barrel.
 *
 * Framework-agnostic, zero-dependency UI building blocks for the tricky passkey
 * UX edge cases: feature detection, conditional-mediation autofill, the
 * "no passkey found" fallback flow, and a cross-device hand-off affordance.
 *
 * Import what you need:
 *   import {
 *     isWebAuthnAvailable,
 *     mountConditionalUI,
 *     createPasskeyFlow,
 *     createCrossDevicePrompt,
 *   } from 'passkey-fallback-flow-kit';
 *
 * Docs & guides: https://www.passkeywebauthn.com/
 */

// 1. Feature detection
export {
  isWebAuthnAvailable,
  isPlatformAuthenticatorAvailable,
  isConditionalMediationAvailable,
  isSecureContextAvailable,
  getPasskeyCapabilities,
} from './feature-detect.js';

// Error classification (shared helpers, useful on their own)
export {
  classifyPasskeyError,
  isUserCancellation,
  isAbortError,
  errorName,
} from './errors.js';

// 2. Conditional UI / autofill
export {
  mountConditionalUI,
  CONDITIONAL_UI_AUTOCOMPLETE,
  __resetConditionalUIGuard,
} from './conditional-ui.js';

// 3. "No passkey found" fallback flow
export { createPasskeyFlow } from './fallback-flow.js';

// 4. Cross-device QR hand-off affordance
export { createCrossDevicePrompt } from './cross-device.js';

/** Library version (kept in sync with package.json). */
export const VERSION = '0.1.0';
