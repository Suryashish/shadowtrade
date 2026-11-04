# Engineering Guidelines

Instructions for any AI or developer working on this codebase. Follow these on every change.

## Core principles
- **Simplest thing that works.** Solve the actual problem, not an imagined future one. No speculative abstractions, config options or layers.
- **Use what exists.** Prefer the platform, the framework and well-maintained libraries over custom code. Don't rebuild what an SDK already does.
- **Read before writing.** Understand the surrounding code and match its patterns, naming and structure. Reuse existing helpers instead of duplicating them.
- **Small, focused changes.** One concern per change. Don't refactor unrelated code along the way.
- **Verify, don't assume.** Check docs, types and real behavior. If unsure about an API, look it up instead of guessing.

## Code quality
- Clear names over comments. Comment only the *why*, never the obvious *what*.
- Small functions with one job. Flat over nested; return early.
- Strict TypeScript. No `any`, no ignored errors, no dead code or leftover logs.
- Keep logic out of UI components. Separate data, business logic and presentation.
- Handle errors where they can be handled meaningfully; surface the rest with a clear message. Never fail silently.

## Security (non-negotiable)
- Treat all input as untrusted, both from users and from the chain/APIs. Validate at the boundaries.
- Never commit secrets. Use environment variables; keep private keys client-side and out of logs, storage and network calls unless required.
- Least privilege everywhere: minimal approvals, minimal permissions, minimal data kept.
- For smart contracts and transactions: check-effects-interactions, explicit gas limits, handle reverts, and never assume a transaction succeeded until confirmed.
- Prefer audited, widely used libraries over hand-rolled crypto or protocol code.

## Performance
- Measure before optimizing, but avoid obvious waste: no unnecessary re-renders, network calls or chain reads.
- Batch and cache reads where safe. Load only what the current screen needs.
- Keep the bundle lean; don't add a dependency for something a few lines can do.

## Reliability
- Design for failure: network drops, RPC errors, rejected wallet prompts, slow confirmations. Every async action needs loading, success and error handling.
- Make operations idempotent and safe to retry where possible.
- Test the critical paths (anything touching funds, keys or state) before calling work done.

## Before finishing a change
1. It builds, lints and type-checks cleanly.
2. The feature works end to end, including the error and edge cases.
3. No secrets, debug code or unused files remain.
4. The code is as simple as it can be while still being correct.
