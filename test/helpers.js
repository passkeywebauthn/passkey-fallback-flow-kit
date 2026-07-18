/**
 * Shared test helpers: minimal WebAuthn / DOM stubs.
 *
 * Node has no `navigator.credentials`, `window`, or `PublicKeyCredential`, so
 * we install just enough of them onto `globalThis` to exercise the library.
 */

/**
 * Assign a global that may be defined as a read-only getter in some Node
 * versions (e.g. `navigator`). Uses `Object.defineProperty` so the assignment
 * always succeeds and stays configurable for later restore.
 * @param {string} key
 * @param {*} value
 */
function setGlobal(key, value) {
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

/** Capture a global's current descriptor so it can be restored exactly. */
function snapshotGlobal(key) {
  return {
    key,
    existed: key in globalThis,
    descriptor: Object.getOwnPropertyDescriptor(globalThis, key),
  };
}

/** @param {{key:string, existed:boolean, descriptor: PropertyDescriptor|undefined}} snap */
function restoreGlobal(snap) {
  if (snap.existed && snap.descriptor) {
    Object.defineProperty(globalThis, snap.key, snap.descriptor);
  } else {
    delete globalThis[snap.key];
  }
}

/**
 * Install a fake browser environment.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.secureContext=true]
 * @param {boolean} [opts.webauthn=true]        Expose PublicKeyCredential + credentials.
 * @param {boolean} [opts.platform=true]        UVPAA result.
 * @param {boolean} [opts.conditional=true]     Conditional mediation result.
 * @param {(req: any) => Promise<any>} [opts.get] Custom credentials.get impl.
 * @returns {() => void} restore function
 */
export function installBrowserEnv(opts = {}) {
  const {
    secureContext = true,
    webauthn = true,
    platform = true,
    conditional = true,
    get,
  } = opts;

  const snaps = [
    snapshotGlobal('window'),
    snapshotGlobal('navigator'),
    snapshotGlobal('PublicKeyCredential'),
  ];

  const credentials = webauthn
    ? {
        create: async () => ({ id: 'stub-create' }),
        get:
          get ||
          (async () => ({ id: 'stub-get', type: 'public-key' })),
      }
    : undefined;

  const navigator = { credentials };

  const PublicKeyCredential = webauthn
    ? function PublicKeyCredential() {}
    : undefined;
  if (PublicKeyCredential) {
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => platform;
    PublicKeyCredential.isConditionalMediationAvailable = async () => conditional;
  }

  const window = {
    isSecureContext: secureContext,
    navigator,
    PublicKeyCredential,
  };

  setGlobal('window', window);
  setGlobal('navigator', navigator);
  // Some helpers reference bare `PublicKeyCredential` / `navigator` too.
  setGlobal('PublicKeyCredential', PublicKeyCredential);

  return function restore() {
    snaps.forEach(restoreGlobal);
  };
}

/** Remove any browser globals so helpers see a bare (SSR-like) environment. */
export function clearBrowserEnv() {
  const snaps = [
    snapshotGlobal('window'),
    snapshotGlobal('navigator'),
    snapshotGlobal('PublicKeyCredential'),
  ];
  // Set to `undefined` (rather than delete) so it works even when a global is
  // defined as a non-configurable getter. `typeof x` is still 'undefined'.
  setGlobal('window', undefined);
  setGlobal('navigator', undefined);
  setGlobal('PublicKeyCredential', undefined);
  return function restore() {
    snaps.forEach(restoreGlobal);
  };
}

/** Build a DOMException-like error with a given `name`. */
export function domError(name, message = name) {
  const err = new Error(message);
  err.name = name;
  return err;
}

/**
 * A tiny DOM stub supporting just what `createCrossDevicePrompt` needs.
 * Elements support className, textContent, attributes, children, and a
 * synchronous click event dispatch.
 */
export function makeStubDocument() {
  function makeElement(tag) {
    const listeners = {};
    const el = {
      tagName: tag.toUpperCase(),
      className: '',
      _text: '',
      type: '',
      disabled: false,
      id: '',
      children: [],
      parentNode: null,
      attributes: {},
      classListSet: new Set(),
      classList: {
        toggle(name, force) {
          const has = el.classList._set.has(name);
          const shouldAdd = force === undefined ? !has : force;
          if (shouldAdd) el.classList._set.add(name);
          else el.classList._set.delete(name);
        },
        add(name) {
          el.classList._set.add(name);
        },
        contains(name) {
          return el.classList._set.has(name);
        },
        _set: new Set(),
      },
      setAttribute(k, v) {
        el.attributes[k] = String(v);
      },
      getAttribute(k) {
        return Object.prototype.hasOwnProperty.call(el.attributes, k)
          ? el.attributes[k]
          : null;
      },
      appendChild(child) {
        child.parentNode = el;
        el.children.push(child);
        return child;
      },
      prepend(child) {
        child.parentNode = el;
        el.children.unshift(child);
        return child;
      },
      removeChild(child) {
        const i = el.children.indexOf(child);
        if (i >= 0) el.children.splice(i, 1);
        child.parentNode = null;
        return child;
      },
      addEventListener(type, fn) {
        (listeners[type] || (listeners[type] = [])).push(fn);
      },
      removeEventListener(type, fn) {
        if (!listeners[type]) return;
        listeners[type] = listeners[type].filter((f) => f !== fn);
      },
      dispatchEvent(type) {
        (listeners[type] || []).forEach((fn) => fn({ type }));
      },
      click() {
        el.dispatchEvent('click');
      },
    };
    Object.defineProperty(el, 'textContent', {
      get() {
        return el._text;
      },
      set(v) {
        el._text = v == null ? '' : String(v);
      },
    });
    return el;
  }

  return {
    createElement: (tag) => makeElement(tag),
  };
}
