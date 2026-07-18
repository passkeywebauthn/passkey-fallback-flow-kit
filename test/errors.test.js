import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyPasskeyError,
  isUserCancellation,
  isAbortError,
  errorName,
} from '../src/errors.js';

import { domError } from './helpers.js';

test('errorName reads .name defensively', () => {
  assert.equal(errorName(domError('NotAllowedError')), 'NotAllowedError');
  assert.equal(errorName(null), '');
  assert.equal(errorName('a string'), '');
  assert.equal(errorName({}), '');
});

test('classifyPasskeyError maps known DOMException names', () => {
  assert.equal(classifyPasskeyError(domError('AbortError')), 'aborted');
  assert.equal(classifyPasskeyError(domError('NotAllowedError')), 'cancelled-or-timeout');
  assert.equal(classifyPasskeyError(domError('InvalidStateError')), 'invalid-state');
  assert.equal(classifyPasskeyError(domError('SecurityError')), 'security');
  assert.equal(classifyPasskeyError(domError('NotSupportedError')), 'not-supported');
  assert.equal(classifyPasskeyError(domError('SomethingElse')), 'unknown');
});

test('isAbortError only true for AbortError', () => {
  assert.equal(isAbortError(domError('AbortError')), true);
  assert.equal(isAbortError(domError('NotAllowedError')), false);
});

test('isUserCancellation true for cancel/timeout and abort', () => {
  assert.equal(isUserCancellation(domError('NotAllowedError')), true);
  assert.equal(isUserCancellation(domError('AbortError')), true);
  assert.equal(isUserCancellation(domError('SecurityError')), false);
});
