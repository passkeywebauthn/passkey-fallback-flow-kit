import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCrossDevicePrompt } from '../src/cross-device.js';
import { makeStubDocument } from './helpers.js';

test('requires an onActivate callback', () => {
  const doc = makeStubDocument();
  assert.throws(() => createCrossDevicePrompt({ document: doc }), TypeError);
});

test('requires a document when none is global', () => {
  assert.throws(
    () => createCrossDevicePrompt({ onActivate() {} }),
    /no `document` available/
  );
});

test('builds an accessible button with label + described hint', () => {
  const doc = makeStubDocument();
  const { element, button } = createCrossDevicePrompt({
    onActivate() {},
    document: doc,
  });
  assert.equal(button.tagName, 'BUTTON');
  assert.equal(button.type, 'button');
  // Label text present (icon is prepended, so check inclusion).
  assert.match(button.textContent, /Use a passkey on another device/);
  // aria-describedby wired to the hint element.
  const describedBy = button.getAttribute('aria-describedby');
  assert.ok(describedBy);
  const hint = element.children.find((c) => c.id === describedBy);
  assert.ok(hint, 'hint element should exist and match aria-describedby');
  // A polite live region is present.
  const status = element.children.find(
    (c) => c.getAttribute('role') === 'status'
  );
  assert.ok(status);
  assert.equal(status.getAttribute('aria-live'), 'polite');
});

test('custom label + hint can be suppressed', () => {
  const doc = makeStubDocument();
  const { element, button } = createCrossDevicePrompt({
    onActivate() {},
    label: 'Continue on phone',
    showHint: false,
    document: doc,
  });
  assert.match(button.textContent, /Continue on phone/);
  assert.equal(button.getAttribute('aria-describedby'), null);
  const hint = element.children.find((c) =>
    c.className.includes('hint')
  );
  assert.equal(hint, undefined);
});

test('activating the button toggles busy state and invokes onActivate', async () => {
  const doc = makeStubDocument();
  let resolveActivate;
  let activated = false;
  const { button } = createCrossDevicePrompt({
    onActivate: () =>
      new Promise((res) => {
        activated = true;
        resolveActivate = res;
      }),
    document: doc,
  });

  button.click();
  assert.equal(activated, true);
  assert.equal(button.disabled, true);
  assert.equal(button.getAttribute('aria-busy'), 'true');

  resolveActivate();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('aria-busy'), 'false');
});

test('setStatus / setBusy are exposed and update the DOM', () => {
  const doc = makeStubDocument();
  const { element, setStatus, setBusy, button } = createCrossDevicePrompt({
    onActivate() {},
    document: doc,
  });
  setStatus('Waiting…');
  const status = element.children.find(
    (c) => c.getAttribute('role') === 'status'
  );
  assert.equal(status.textContent, 'Waiting…');
  setBusy(true);
  assert.equal(button.disabled, true);
  assert.equal(button.classList.contains('pfk-is-busy'), false); // toggled on element, not button
  assert.equal(element.classList.contains('pfk-is-busy'), true);
});

test('destroy detaches from parent and removes listeners', () => {
  const doc = makeStubDocument();
  const parent = doc.createElement('div');
  let calls = 0;
  const prompt = createCrossDevicePrompt({
    onActivate: () => {
      calls += 1;
    },
    document: doc,
  });
  parent.appendChild(prompt.element);
  assert.equal(prompt.element.parentNode, parent);
  prompt.destroy();
  assert.equal(prompt.element.parentNode, null);
  // Click after destroy should not call onActivate.
  prompt.button.click();
  assert.equal(calls, 0);
});
