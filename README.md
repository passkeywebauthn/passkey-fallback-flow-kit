# passkey-fallback-flow-kit

Drop-in, framework-agnostic UI building blocks for the tricky passkey UX edge
cases — feature detection, conditional-mediation autofill, the "no passkey
found" fallback, and cross-device hand-off. **Zero runtime dependencies, no
build step, accessible by default.**

Passkeys are easy when everything works. The hard part is everything else: the
browser that doesn't support conditional mediation, the `NotAllowedError` that
could mean "cancelled" or "timed out" or "no credential", the user on a device
with no passkey who needs a graceful path to their password, and the person
whose passkey lives on their phone. This kit gives you tested, accessible
primitives for exactly those moments.

Built and maintained by the team behind [passkeywebauthn.com — the Passkey & WebAuthn Engineering Hub](https://www.passkeywebauthn.com).

## Why

- **Zero dependencies, vanilla ESM.** Import `src/index.js` directly. Works from
  React, Vue, Svelte, or plain HTML.
- **Accessible defaults.** Correct roles, `aria-live` status announcements,
  keyboard operability, focus management, and `prefers-reduced-motion` support.
- **Themeable, optional CSS.** Components work unstyled; opt into a light
  "fresh greens / soft neutrals" theme via CSS custom properties.
- **Honest about the platform.** It does not reimplement the OS QR code or fake
  capabilities — it detects, orchestrates, and guides.

## Install

```sh
npm install passkey-fallback-flow-kit
```

Or vendor `src/` directly — it is plain ES modules with no build step. Requires
Node ≥ 18 for tooling/tests; the runtime code targets any modern browser.

```js
import {
  isWebAuthnAvailable,
  isPlatformAuthenticatorAvailable,
  isConditionalMediationAvailable,
  mountConditionalUI,
  createPasskeyFlow,
  createCrossDevicePrompt,
} from 'passkey-fallback-flow-kit';
```

Optional theme:

```js
import 'passkey-fallback-flow-kit/styles.css';
```

## The four building blocks

### 1. Feature detection

Defensive helpers that never throw and degrade gracefully when APIs are missing
or you're outside a secure context (or server-rendering).

```js
import {
  isWebAuthnAvailable,
  isPlatformAuthenticatorAvailable,
  isConditionalMediationAvailable,
  getPasskeyCapabilities,
} from 'passkey-fallback-flow-kit';

if (isWebAuthnAvailable()) {
  const platform = await isPlatformAuthenticatorAvailable(); // Touch ID / Hello / …
  const autofill = await isConditionalMediationAvailable();  // passkey autofill?
}

// One-shot snapshot:
const caps = await getPasskeyCapabilities();
// { secureContext, webauthn, platformAuthenticator, conditionalMediation }
```

Deep dive: [feature-detecting passkey support](https://www.passkeywebauthn.com/frontend-ux-and-conditional-mediation/progressive-enhancement-and-fallback-flows/feature-detecting-passkey-support/).

### 2. Conditional UI / autofill

Start a background `navigator.credentials.get({ mediation: 'conditional' })` so
matching passkeys appear in the browser's autofill dropdown. Gated on
availability, wired to an `AbortController`, and safe to call once.

```js
import { mountConditionalUI } from 'passkey-fallback-flow-kit';

const handle = await mountConditionalUI({
  getRequestOptions: () => fetch('/webauthn/options').then((r) => r.json()),
  onSuccess: (credential) => postToServer(credential),
  onError: (err, info) => console.warn(info.kind, err),
  onUnavailable: () => {/* no autofill here; that's fine */},
});

// Later, e.g. when the user starts a modal ceremony:
handle.abort();
```

Your input must advertise WebAuthn to autofill:

```html
<input autocomplete="username webauthn" />
```

Deep dives: [conditional mediation & autofill UI](https://www.passkeywebauthn.com/frontend-ux-and-conditional-mediation/conditional-mediation-and-autofill-ui/),
[implementing conditional UI with SimpleWebAuthn](https://www.passkeywebauthn.com/frontend-ux-and-conditional-mediation/conditional-mediation-and-autofill-ui/implementing-conditional-ui-with-simplewebauthn/),
and the [browser support matrix for conditional mediation](https://www.passkeywebauthn.com/frontend-ux-and-conditional-mediation/conditional-mediation-and-autofill-ui/browser-support-matrix-for-conditional-mediation/).

### 3. "No passkey found" fallback flow

A tiny state machine — `idle → authenticating → success | fallback | error` —
that routes user-cancel, timeout, no-credential, and abort to a **fallback**
path (show your password/OTP UI) while reserving the **error** state for genuine
technical failures.

```js
import { createPasskeyFlow } from 'passkey-fallback-flow-kit';

const flow = createPasskeyFlow({
  authenticate: async () => {
    const options = await fetch('/webauthn/options').then((r) => r.json());
    return navigator.credentials.get(options); // { publicKey } or bare
  },
  fallback: ({ reason }) => {
    // reason: 'cancelled' | 'no-credential' | 'unsupported' | 'aborted'
    showPasswordForm();
  },
  onSuccess: ({ result }) => postToServer(result),
  onError: ({ error }) => reportError(error), // real failures only
});

flow.on('change', (e) => announce(e.message)); // aria-live friendly
await flow.start();
```

Why cancel and timeout both land in *fallback*: the WebAuthn spec collapses
"user cancelled", "timed out", and often "no credential" into a single
`NotAllowedError`. This kit classifies that as *recoverable* — the user can
still sign in another way — and only surfaces `error` for `SecurityError`,
`NotSupportedError`, and friends. Use an explicit `AbortController` so genuine
aborts arrive as `AbortError` (reason `'aborted'`).

Deep dives: [password-to-passkey fallback UI patterns](https://www.passkeywebauthn.com/frontend-ux-and-conditional-mediation/progressive-enhancement-and-fallback-flows/password-to-passkey-fallback-ui-patterns/),
[fixing NotAllowedError in WebAuthn](https://www.passkeywebauthn.com/frontend-ux-and-conditional-mediation/debugging-and-observability/fixing-notallowederror-in-webauthn/),
and [resolving WebAuthn timeout and AbortError](https://www.passkeywebauthn.com/frontend-ux-and-conditional-mediation/debugging-and-observability/resolving-webauthn-timeout-and-aborterror/).

### 4. Cross-device QR hand-off affordance

An accessible "Use a passkey on another device" button. It does **not**
reimplement the QR code — cross-device sign-in (hybrid transport) is driven by
the OS and browser. This component triggers the standard ceremony and guides the
user through what happens.

```js
import { createCrossDevicePrompt } from 'passkey-fallback-flow-kit';

const prompt = createCrossDevicePrompt({
  onActivate: async () => {
    const options = await fetch('/webauthn/options').then((r) => r.json());
    await navigator.credentials.get(options); // platform shows the QR
  },
});
document.querySelector('#signin').appendChild(prompt.element);
```

Deep dive: [hybrid transport and cross-device passkeys](https://www.passkeywebauthn.com/webauthn-fido2-protocol-fundamentals/platform-vs-roaming-authenticator-trade-offs/hybrid-transport-and-cross-device-passkeys/).

## Examples

- [`examples/vanilla/index.html`](examples/vanilla/index.html) — a fully working,
  self-contained page (no CDN) that renders every UI state. It uses a clearly
  labelled **mock** `getRequestOptions`, so you can see the flows without a
  backend. Serve the repo over `http://localhost` (WebAuthn needs a secure
  context) and open the page.
- [`examples/react/`](examples/react/) — a documentation-only React adapter
  (`PasskeyFallback.jsx`). React is **not** a dependency.

## Accessibility

- Status changes are announced through `role="status"` / `aria-live="polite"`
  regions.
- The cross-device button is keyboard operable, exposes `aria-busy`, and links
  its helper text with `aria-describedby`.
- Focus is moved to the fallback input when the flow falls back (in the vanilla
  example) — the core leaves focus policy to you where it belongs.
- The optional theme honours `prefers-reduced-motion` and ships light/dark via
  `prefers-color-scheme`.

## Theming

Everything is driven by `--pfk-*` CSS custom properties. Override them on
`:root` (or any ancestor) to retheme without touching the stylesheet:

```css
:root {
  --pfk-color-accent: #6d28d9;
  --pfk-radius: 6px;
}
```

## API reference (quick)

| Export | Kind | Summary |
| --- | --- | --- |
| `isWebAuthnAvailable()` | `boolean` | Core WebAuthn API present. |
| `isPlatformAuthenticatorAvailable()` | `Promise<boolean>` | UVPAA (biometrics) available. |
| `isConditionalMediationAvailable()` | `Promise<boolean>` | Passkey autofill available. |
| `isSecureContextAvailable()` | `boolean` | https / localhost. |
| `getPasskeyCapabilities()` | `Promise<object>` | Full capability snapshot. |
| `mountConditionalUI(opts)` | `Promise<handle>` | Start autofill ceremony; returns `{ started, abort, done }`. |
| `CONDITIONAL_UI_AUTOCOMPLETE` | `string` | The `"webauthn"` autocomplete token. |
| `createPasskeyFlow(opts)` | `object` | State machine: `start`, `getState`, `reset`, `on`, `events`. |
| `createCrossDevicePrompt(opts)` | `object` | DOM component: `element`, `button`, `setBusy`, `setStatus`, `destroy`. |
| `classifyPasskeyError(err)` | `string` | Coarse error kind. |
| `isUserCancellation(err)` / `isAbortError(err)` | `boolean` | Error predicates. |

## Development

```sh
npm test    # node --test "test/*.test.js"
```

Tests run on Node ≥ 18 with a minimal DOM/WebAuthn stub — no browser required.
They cover feature-detection degradation, error classification, the fallback
state machine's transitions, conditional-UI gating, and the cross-device
component.

## License

[MIT](LICENSE) © 2026 passkeywebauthn

## Related tools

Part of a small set of open-source WebAuthn tools:

- [passkey-inspect](https://github.com/passkeywebauthn/passkey-inspect) — decode WebAuthn payloads (attestationObject, authenticatorData, COSE keys) from the CLI or as a library.
- [webauthn-ceremony-inspector](https://github.com/passkeywebauthn/webauthn-ceremony-inspector) — a browser DevTools panel that captures and decodes live WebAuthn ceremonies.
- [passkey-fixture-generator](https://github.com/passkeywebauthn/passkey-fixture-generator) — deterministic, valid registration/authentication test fixtures for backend verification.
- [rp-id-doctor](https://github.com/passkeywebauthn/rp-id-doctor) — validate your rpId, origins, and .well-known/webauthn configuration in CI.
- [authenticator-support-matrix](https://github.com/passkeywebauthn/authenticator-support-matrix) — a filterable feature matrix of platform and roaming authenticators.
