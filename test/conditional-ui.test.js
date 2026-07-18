import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  mountConditionalUI,
  CONDITIONAL_UI_AUTOCOMPLETE,
  __resetConditionalUIGuard,
} from '../src/conditional-ui.js';

import { installBrowserEnv, clearBrowserEnv, domError } from './helpers.js';

test('CONDITIONAL_UI_AUTOCOMPLETE token is exported', () => {
  assert.equal(CONDITIONAL_UI_AUTOCOMPLETE, 'webauthn');
});

test('validates required callbacks', async () => {
  await assert.rejects(
    () => mountConditionalUI({ onSuccess() {} }),
    TypeError
  );
  await assert.rejects(
    () => mountConditionalUI({ getRequestOptions: async () => ({}) }),
    TypeError
  );
});

test('does not start when WebAuthn unavailable → onUnavailable', async () => {
  const restore = clearBrowserEnv();
  __resetConditionalUIGuard();
  try {
    let unavailable = false;
    const handle = await mountConditionalUI({
      getRequestOptions: async () => ({}),
      onSuccess() {},
      onUnavailable: () => {
        unavailable = true;
      },
    });
    assert.equal(handle.started, false);
    assert.equal(handle.reason, 'unsupported');
    assert.equal(unavailable, true);
  } finally {
    restore();
  }
});

test('does not start when conditional mediation unavailable', async () => {
  const restore = installBrowserEnv({ conditional: false });
  __resetConditionalUIGuard();
  try {
    const handle = await mountConditionalUI({
      getRequestOptions: async () => ({}),
      onSuccess() {},
    });
    assert.equal(handle.started, false);
    assert.equal(handle.reason, 'unavailable');
  } finally {
    restore();
  }
});

test('starts and reports success with the credential', async () => {
  const cred = { id: 'passkey-1', type: 'public-key' };
  const restore = installBrowserEnv({ get: async () => cred });
  __resetConditionalUIGuard();
  try {
    let got;
    let usedMediation;
    // Wrap get to assert the mediation flag was passed.
    const originalGet = globalThis.navigator.credentials.get;
    globalThis.navigator.credentials.get = async (req) => {
      usedMediation = req.mediation;
      return originalGet(req);
    };

    const handle = await mountConditionalUI({
      getRequestOptions: async () => ({ challenge: 'abc' }),
      onSuccess: (c) => {
        got = c;
      },
    });
    assert.equal(handle.started, true);
    await handle.done;
    assert.equal(usedMediation, 'conditional');
    assert.deepEqual(got, cred);
  } finally {
    restore();
  }
});

test('accepts a { publicKey } wrapper from getRequestOptions', async () => {
  let received;
  const restore = installBrowserEnv({
    get: async (req) => {
      received = req.publicKey;
      return { id: 'ok' };
    },
  });
  __resetConditionalUIGuard();
  try {
    const handle = await mountConditionalUI({
      getRequestOptions: async () => ({ publicKey: { challenge: 'xyz' } }),
      onSuccess() {},
    });
    await handle.done;
    assert.deepEqual(received, { challenge: 'xyz' });
  } finally {
    restore();
  }
});

test('AbortError is swallowed (clean cancel), onError not called', async () => {
  const restore = installBrowserEnv({
    get: async () => {
      throw domError('AbortError');
    },
  });
  __resetConditionalUIGuard();
  try {
    let errored = false;
    const handle = await mountConditionalUI({
      getRequestOptions: async () => ({}),
      onSuccess() {},
      onError: () => {
        errored = true;
      },
    });
    await handle.done;
    assert.equal(errored, false);
  } finally {
    restore();
  }
});

test('genuine error is reported via onError with classification', async () => {
  const restore = installBrowserEnv({
    get: async () => {
      throw domError('SecurityError');
    },
  });
  __resetConditionalUIGuard();
  try {
    let info;
    const handle = await mountConditionalUI({
      getRequestOptions: async () => ({}),
      onSuccess() {},
      onError: (_err, i) => {
        info = i;
      },
    });
    await handle.done;
    assert.equal(info.kind, 'security');
    assert.equal(info.aborted, false);
  } finally {
    restore();
  }
});

test('call-once guard blocks a second concurrent mount', async () => {
  const restore = installBrowserEnv({
    get: () => new Promise(() => {}), // never resolves → stays in flight
  });
  __resetConditionalUIGuard();
  try {
    const first = await mountConditionalUI({
      getRequestOptions: async () => ({}),
      onSuccess() {},
    });
    assert.equal(first.started, true);

    const second = await mountConditionalUI({
      getRequestOptions: async () => ({}),
      onSuccess() {},
    });
    assert.equal(second.started, false);
    assert.equal(second.reason, 'already-started');

    first.abort();
  } finally {
    restore();
    __resetConditionalUIGuard();
  }
});
