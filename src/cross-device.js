/**
 * `createCrossDevicePrompt()` — an accessible "Use a passkey on another device"
 * affordance.
 *
 * This does NOT reimplement the platform QR code. Cross-device sign-in (a.k.a.
 * hybrid transport / "caBLE") is driven entirely by the operating system and
 * browser: when you run a normal passkey ceremony, the platform decides whether
 * to show a QR code, a nearby-device prompt, etc. This component simply gives
 * the user a clear, keyboard-operable button that triggers the standard
 * ceremony and explains what will happen ("scan the QR shown by your browser
 * with your phone").
 *
 * It returns a real DOM element so it drops into any page. It works unstyled;
 * opt into the theme by importing `src/styles.css`.
 *
 * Guide: hybrid transport & cross-device passkeys:
 * https://www.passkeywebauthn.com/webauthn-fido2-protocol-fundamentals/platform-vs-roaming-authenticator-trade-offs/hybrid-transport-and-cross-device-passkeys/
 */

/**
 * @typedef {object} CrossDevicePromptOptions
 * @property {() => (void|Promise<void>)} onActivate
 *   Called when the user activates the button. Kick off your normal passkey
 *   ceremony here (e.g. `navigator.credentials.get(...)`); the platform will
 *   present the QR / nearby-device UI as appropriate.
 * @property {string} [label]
 *   Button label. Default: "Use a passkey on another device".
 * @property {string} [description]
 *   Helper text under the button. Default explains hybrid transport.
 * @property {boolean} [showHint=true]
 *   Whether to render the explanatory helper text.
 * @property {Document} [document]
 *   Document to create elements in (injectable for testing/SSR frameworks).
 */

const DEFAULT_LABEL = 'Use a passkey on another device';
const DEFAULT_DESCRIPTION =
  'Your browser will show a QR code. Scan it with the phone or tablet that ' +
  'has your passkey, then approve the sign-in there.';

/**
 * Build the cross-device prompt component.
 *
 * @param {CrossDevicePromptOptions} options
 * @returns {{
 *   element: HTMLElement,
 *   button: HTMLButtonElement,
 *   setBusy: (busy: boolean) => void,
 *   setStatus: (message: string) => void,
 *   destroy: () => void,
 * }}
 */
export function createCrossDevicePrompt(options) {
  const {
    onActivate,
    label = DEFAULT_LABEL,
    description = DEFAULT_DESCRIPTION,
    showHint = true,
    document: doc = typeof document !== 'undefined' ? document : undefined,
  } = options || {};

  if (typeof onActivate !== 'function') {
    throw new TypeError('createCrossDevicePrompt: `onActivate` function is required.');
  }
  if (!doc) {
    throw new Error(
      'createCrossDevicePrompt: no `document` available. Pass one via options.document when running outside a browser.'
    );
  }

  const element = doc.createElement('div');
  element.className = 'pfk pfk-cross-device';

  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'pfk-button pfk-cross-device__button';
  button.textContent = label;

  // Accessible icon marker (decorative — hidden from AT).
  const icon = doc.createElement('span');
  icon.className = 'pfk-cross-device__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '⧉';
  button.prepend(icon);

  element.appendChild(button);

  let hint = null;
  if (showHint) {
    hint = doc.createElement('p');
    hint.className = 'pfk-cross-device__hint';
    hint.id = `pfk-cross-device-hint-${Math.random().toString(36).slice(2, 8)}`;
    hint.textContent = description;
    button.setAttribute('aria-describedby', hint.id);
    element.appendChild(hint);
  }

  // Polite live region for status updates ("Waiting for your other device…").
  const status = doc.createElement('p');
  status.className = 'pfk-cross-device__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  element.appendChild(status);

  /** @param {boolean} busy */
  function setBusy(busy) {
    button.disabled = busy;
    button.setAttribute('aria-busy', busy ? 'true' : 'false');
    element.classList.toggle('pfk-is-busy', busy);
  }

  /** @param {string} message */
  function setStatus(message) {
    status.textContent = message || '';
  }

  async function handleActivate() {
    setBusy(true);
    setStatus('Waiting for your other device…');
    try {
      await onActivate();
      // Caller decides the terminal message; clear our interim one.
      setStatus('');
    } catch {
      // Errors are the caller's to report (via their ceremony handler); we just
      // release the busy state so the button is usable again.
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  button.addEventListener('click', handleActivate);

  function destroy() {
    button.removeEventListener('click', handleActivate);
    if (element.parentNode) element.parentNode.removeChild(element);
  }

  return { element, button, setBusy, setStatus, destroy };
}
