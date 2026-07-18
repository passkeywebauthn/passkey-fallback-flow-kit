import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isWebAuthnAvailable,
  isPlatformAuthenticatorAvailable,
  isConditionalMediationAvailable,
  isSecureContextAvailable,
  getPasskeyCapabilities,
} from '../src/feature-detect.js';

import { installBrowserEnv, clearBrowserEnv } from './helpers.js';

test('isWebAuthnAvailable → false when there is no window (SSR)', () => {
  const restore = clearBrowserEnv();
  try {
    assert.equal(isWebAuthnAvailable(), false);
    assert.equal(isSecureContextAvailable(), false);
  } finally {
    restore();
  }
});

test('isWebAuthnAvailable → true when API present', () => {
  const restore = installBrowserEnv();
  try {
    assert.equal(isWebAuthnAvailable(), true);
    assert.equal(isSecureContextAvailable(), true);
  } finally {
    restore();
  }
});

test('isWebAuthnAvailable → false when PublicKeyCredential missing', () => {
  const restore = installBrowserEnv({ webauthn: false });
  try {
    assert.equal(isWebAuthnAvailable(), false);
  } finally {
    restore();
  }
});

test('async availability helpers resolve false gracefully without APIs', async () => {
  const restore = clearBrowserEnv();
  try {
    assert.equal(await isPlatformAuthenticatorAvailable(), false);
    assert.equal(await isConditionalMediationAvailable(), false);
  } finally {
    restore();
  }
});

test('platform + conditional availability reflect the underlying API', async () => {
  const restore = installBrowserEnv({ platform: true, conditional: false });
  try {
    assert.equal(await isPlatformAuthenticatorAvailable(), true);
    assert.equal(await isConditionalMediationAvailable(), false);
  } finally {
    restore();
  }
});

test('async helpers never reject even if the underlying API throws', async () => {
  const restore = installBrowserEnv();
  try {
    // Make the platform check throw.
    globalThis.window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable =
      async () => {
        throw new Error('boom');
      };
    assert.equal(await isPlatformAuthenticatorAvailable(), false);
  } finally {
    restore();
  }
});

test('getPasskeyCapabilities returns a full snapshot', async () => {
  const restore = installBrowserEnv({
    platform: true,
    conditional: true,
    secureContext: true,
  });
  try {
    const caps = await getPasskeyCapabilities();
    assert.deepEqual(caps, {
      secureContext: true,
      webauthn: true,
      platformAuthenticator: true,
      conditionalMediation: true,
    });
  } finally {
    restore();
  }
});

test('getPasskeyCapabilities all-false in a bare environment', async () => {
  const restore = clearBrowserEnv();
  try {
    const caps = await getPasskeyCapabilities();
    assert.deepEqual(caps, {
      secureContext: false,
      webauthn: false,
      platformAuthenticator: false,
      conditionalMediation: false,
    });
  } finally {
    restore();
  }
});
