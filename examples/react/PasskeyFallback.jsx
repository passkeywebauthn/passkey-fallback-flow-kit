/**
 * PasskeyFallback.jsx — documentation snippet (not part of the published
 * package; React is NOT a dependency of passkey-fallback-flow-kit).
 *
 * Shows how to wrap the framework-agnostic core in a React component. The core
 * functions return plain data/events and DOM nodes, so the adapter is thin: we
 * drive the state machine with `createPasskeyFlow`, mount the conditional-UI
 * request once, and portal the cross-device DOM node into a ref.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createPasskeyFlow,
  mountConditionalUI,
  createCrossDevicePrompt,
} from 'passkey-fallback-flow-kit';

/**
 * @param {object} props
 * @param {() => Promise<any>} props.getRequestOptions  Fetch assertion options from your server.
 * @param {(credential: any) => void} props.onSignedIn  Called with a verified credential.
 * @param {() => React.ReactNode} [props.renderFallback] Your password/OTP UI.
 */
export function PasskeyFallback({ getRequestOptions, onSignedIn, renderFallback }) {
  const [status, setStatus] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | authenticating | success | fallback | error
  const crossDeviceRef = useRef(null);
  const flowRef = useRef(null);

  // Build the flow once.
  if (!flowRef.current) {
    flowRef.current = createPasskeyFlow({
      authenticate: async () => {
        const options = await getRequestOptions();
        const publicKey = options.publicKey ?? options;
        return navigator.credentials.get({ publicKey });
      },
      onChange: (e) => {
        setPhase(e.state);
        setStatus(e.message);
        if (e.state === 'success') onSignedIn?.(e.result);
      },
    });
  }

  const start = useCallback(() => {
    flowRef.current.reset();
    flowRef.current.start();
  }, []);

  // Conditional UI (autofill): start once on mount, abort on unmount.
  useEffect(() => {
    const controller = new AbortController();
    const handlePromise = mountConditionalUI({
      getRequestOptions,
      signalController: controller,
      onSuccess: (credential) => onSignedIn?.(credential),
      onError: (err, info) => console.warn('conditional UI', info.kind, err),
    });
    return () => {
      controller.abort();
      handlePromise.then((h) => h.abort?.());
    };
  }, [getRequestOptions, onSignedIn]);

  // Cross-device prompt: mount the DOM node the core builds.
  useEffect(() => {
    const mountEl = crossDeviceRef.current;
    if (!mountEl) return;
    const prompt = createCrossDevicePrompt({
      onActivate: async () => {
        const options = await getRequestOptions();
        const publicKey = options.publicKey ?? options;
        const credential = await navigator.credentials.get({ publicKey });
        onSignedIn?.(credential);
      },
    });
    mountEl.appendChild(prompt.element);
    return () => prompt.destroy();
  }, [getRequestOptions, onSignedIn]);

  return (
    <div>
      <input type="text" autoComplete="username webauthn" placeholder="you@example.com" />

      <button type="button" onClick={start} disabled={phase === 'authenticating'}>
        Sign in with a passkey
      </button>

      <p role="status" aria-live="polite">{status}</p>

      <div ref={crossDeviceRef} />

      {phase === 'fallback' && (renderFallback ? renderFallback() : (
        <p>No passkey available — use your password or a one-time code.</p>
      ))}
    </div>
  );
}
