import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createPasskeyFlow } from '../src/fallback-flow.js';
import { installBrowserEnv, clearBrowserEnv, domError } from './helpers.js';

test('createPasskeyFlow requires an authenticate function', () => {
  assert.throws(() => createPasskeyFlow({}), TypeError);
  assert.throws(() => createPasskeyFlow(), TypeError);
});

test('successful passkey → success state with result', async () => {
  const restore = installBrowserEnv();
  try {
    const seen = [];
    const flow = createPasskeyFlow({
      authenticate: async () => ({ id: 'cred-1' }),
      onChange: (e) => seen.push(e.state),
    });
    const terminal = await flow.start();
    assert.equal(terminal, 'success');
    assert.equal(flow.getState(), 'success');
    assert.deepEqual(seen, ['authenticating', 'success']);
  } finally {
    restore();
  }
});

test('NotAllowedError (cancel/timeout) → fallback, not error', async () => {
  const restore = installBrowserEnv();
  try {
    const fallbackCtx = [];
    const flow = createPasskeyFlow({
      authenticate: async () => {
        throw domError('NotAllowedError');
      },
      fallback: (ctx) => fallbackCtx.push(ctx),
    });
    const terminal = await flow.start();
    assert.equal(terminal, 'fallback');
    assert.equal(fallbackCtx.length, 1);
    assert.equal(fallbackCtx[0].reason, 'cancelled');
  } finally {
    restore();
  }
});

test('AbortError → fallback with reason "aborted"', async () => {
  const restore = installBrowserEnv();
  try {
    let reason;
    const flow = createPasskeyFlow({
      authenticate: async () => {
        throw domError('AbortError');
      },
      onFallback: (e) => {
        reason = e.reason;
      },
    });
    const terminal = await flow.start();
    assert.equal(terminal, 'fallback');
    assert.equal(reason, 'aborted');
  } finally {
    restore();
  }
});

test('null result → fallback with reason "no-credential"', async () => {
  const restore = installBrowserEnv();
  try {
    let reason;
    const flow = createPasskeyFlow({
      authenticate: async () => null,
      onFallback: (e) => {
        reason = e.reason;
      },
    });
    const terminal = await flow.start();
    assert.equal(terminal, 'fallback');
    assert.equal(reason, 'no-credential');
  } finally {
    restore();
  }
});

test('genuine technical error → error state (not fallback)', async () => {
  const restore = installBrowserEnv();
  try {
    let errEvent;
    const flow = createPasskeyFlow({
      authenticate: async () => {
        throw domError('SecurityError', 'bad rpId');
      },
      onError: (e) => {
        errEvent = e;
      },
    });
    const terminal = await flow.start();
    assert.equal(terminal, 'error');
    assert.equal(errEvent.reason, 'failed');
    assert.equal(errEvent.error.name, 'SecurityError');
  } finally {
    restore();
  }
});

test('WebAuthn unavailable → immediate fallback with reason "unsupported"', async () => {
  const restore = clearBrowserEnv();
  try {
    let reason;
    const flow = createPasskeyFlow({
      authenticate: async () => {
        throw new Error('should not be called');
      },
      onFallback: (e) => {
        reason = e.reason;
      },
    });
    const terminal = await flow.start();
    assert.equal(terminal, 'fallback');
    assert.equal(reason, 'unsupported');
  } finally {
    restore();
  }
});

test('requireWebAuthn:false lets authenticate run even without the API', async () => {
  const restore = clearBrowserEnv();
  try {
    let called = false;
    const flow = createPasskeyFlow({
      requireWebAuthn: false,
      authenticate: async () => {
        called = true;
        return { id: 'x' };
      },
    });
    const terminal = await flow.start();
    assert.equal(called, true);
    assert.equal(terminal, 'success');
  } finally {
    restore();
  }
});

test('on() subscription fires and unsubscribes', async () => {
  const restore = installBrowserEnv();
  try {
    const states = [];
    const flow = createPasskeyFlow({ authenticate: async () => ({ id: 'y' }) });
    const off = flow.on('change', (e) => states.push(e.state));
    await flow.start();
    off();
    flow.reset(); // should not be recorded after unsubscribe
    assert.deepEqual(states, ['authenticating', 'success']);
    assert.equal(flow.getState(), 'idle');
  } finally {
    restore();
  }
});

test('concurrent start() calls are ignored while in flight', async () => {
  const restore = installBrowserEnv();
  try {
    let resolveAuth;
    const flow = createPasskeyFlow({
      authenticate: () =>
        new Promise((res) => {
          resolveAuth = res;
        }),
    });
    const p1 = flow.start();
    const p2 = flow.start(); // ignored, returns current state
    assert.equal(await p2, 'authenticating');
    resolveAuth({ id: 'z' });
    assert.equal(await p1, 'success');
  } finally {
    restore();
  }
});

test('a throwing listener never breaks the state machine', async () => {
  const restore = installBrowserEnv();
  try {
    const flow = createPasskeyFlow({
      authenticate: async () => ({ id: 'ok' }),
      onChange: () => {
        throw new Error('listener blew up');
      },
    });
    const terminal = await flow.start();
    assert.equal(terminal, 'success');
  } finally {
    restore();
  }
});
