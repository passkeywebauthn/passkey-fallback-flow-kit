# React adapter (documentation)

This folder is documentation only. **React is not a dependency** of
`passkey-fallback-flow-kit` — the core ships as framework-agnostic functions, so
wrapping it in React is a thin adapter you own.

See [`PasskeyFallback.jsx`](./PasskeyFallback.jsx) for a complete component that:

- drives the `createPasskeyFlow` state machine and mirrors its events into React
  state,
- starts `mountConditionalUI` (passkey autofill) on mount and aborts it on
  unmount via an `AbortController`,
- mounts the DOM node returned by `createCrossDevicePrompt` into a `ref`, and
  tears it down with `destroy()` on unmount.

## Why the adapter is small

The core never imports a framework. It returns plain data, dispatches events on
an `EventTarget`, and hands you real DOM nodes. That means:

- **State machine** → subscribe with `flow.on('change', ...)` or the `onChange`
  callback and copy the state into `useState`.
- **Conditional UI** → call `mountConditionalUI` inside a `useEffect`; pass your
  own `AbortController` so cleanup is deterministic.
- **Cross-device prompt** → `createCrossDevicePrompt().element` is a DOM node;
  append it to a `ref`'d container and call `destroy()` on cleanup.

## Usage

```jsx
import { PasskeyFallback } from './PasskeyFallback.jsx';

function SignInForm() {
  return (
    <PasskeyFallback
      getRequestOptions={() => fetch('/webauthn/options').then((r) => r.json())}
      onSignedIn={(credential) => {
        // POST the credential to your server for verification.
      }}
      renderFallback={() => <PasswordForm />}
    />
  );
}
```

Vue, Svelte, and Solid adapters follow the same shape — subscribe to events, and
mount/destroy the DOM helpers in your framework's lifecycle hooks.

For deeper background on these UX patterns, see the
[progressive enhancement and fallback flows guide](https://www.passkeywebauthn.com/frontend-ux-and-conditional-mediation/progressive-enhancement-and-fallback-flows/).
