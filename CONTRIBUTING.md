# Contributing

Thanks for your interest in improving `passkey-fallback-flow-kit`. This is a
small, dependency-free library, and we'd like to keep it that way.

## Ground rules

- **Zero runtime dependencies.** The core must stay importable as plain ESM with
  no build step. No CDNs, no framework deps. Dev-only tooling is fine if it
  earns its place.
- **Accessibility is not optional.** New UI must be keyboard operable, announce
  status through `aria-live`/`role`, respect `prefers-reduced-motion`, and work
  unstyled.
- **Defensive by default.** Feature-detection and error helpers must never throw
  and must degrade gracefully when APIs are absent or you're outside a secure
  context.

## Getting set up

```sh
git clone https://github.com/passkeywebauthn/passkey-fallback-flow-kit.git
cd passkey-fallback-flow-kit
npm test
```

There is no install step for the library itself (zero deps). Node ≥ 18 is
required for the test runner.

## Tests

- Tests use the built-in Node runner: `node --test "test/*.test.js"`.
- There's no real browser, so `test/helpers.js` provides a minimal
  DOM/WebAuthn stub. Prefer unit-testing logic (state transitions, error
  classification, availability gating) against those stubs.
- Every behavioural change needs a test. Keep the suite green before opening a
  PR.

## Pull requests

1. Branch from `main`.
2. Keep changes focused; one concern per PR.
3. Update the `README.md` API table and relevant JSDoc when you change public
   API.
4. Run `npm test` and confirm it passes.

## Reporting bugs

Open an issue with a minimal reproduction — the browser/OS, whether a secure
context was in use, and the exact error `name` (e.g. `NotAllowedError`) are the
most useful details for passkey problems.

## Learn more

Background guides and the wider engineering hub live at
[passkeywebauthn.com](https://www.passkeywebauthn.com).
