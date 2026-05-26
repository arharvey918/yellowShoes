---
applyTo: "**/*.go"
---

Apply the rules from https://go.dev/wiki/CodeReviewComments.

- Format with `gofmt`/`goimports`; keep imports grouped with the standard library first; avoid import renames except for real collisions.
- Write Go-style comments: package comments must be adjacent to `package`; exported names and non-trivial unexported declarations need doc comments; declaration comments are full sentences that start with the declared name and end with a period. For `package main`, use a proper package comment such as `Command foo ...` or `Binary foo ...`.
- Pass `context.Context` explicitly as the first parameter for request-scoped work; do not store contexts in structs, invent context-like interfaces/types, or use `context.Background()` when a caller context should be propagated.
- Prefer concrete types on the implementor side; define interfaces where they are consumed, not for speculative mocking. Use clear package names that do not repeat in exported identifiers.
- Use Go naming: MixedCaps, correct initialisms (`ID`, `URL`, `HTTP`), short local names, descriptive broader-scope names, and short consistent receiver names; never use receiver names like `this`, `self`, or `me`.
- Keep the happy path minimally indented: handle errors immediately, never discard them, do not use `panic` for normal errors, and keep error strings lowercase with no trailing punctuation. Prefer explicit `(value, ok)` / `(value, err)` results over in-band sentinel values.
- Prefer `var s []T` for empty slices unless a non-nil empty slice is required by behavior such as JSON encoding; APIs should not distinguish nil and empty slices without a strong reason.
- Avoid copying values that should not be copied, especially types with pointer receivers or internal aliasing. Pass values unless mutation, shared state, or size clearly justifies pointers; do not use pointer parameters like `*string` or `*io.Reader` just to save bytes.
- Choose receiver types deliberately: pointer receivers for mutation, large structs, sync fields, shared mutable state, or when in doubt; value receivers only for small immutable value-like types. Do not mix pointer and value receivers on the same type.
- Avoid blank imports except for intentional side effects in `main` or tests. Avoid dot imports except the rare external-test cycle case.
- Prefer synchronous functions. When starting goroutines, make their lifetime and exit conditions obvious and documented to avoid leaks and races.
- Use named result parameters only when they improve clarity or are required (such as deferred mutation); avoid naked returns except in very small functions.
- Do not wrap lines mechanically to satisfy a fixed width; break lines based on readability and semantics, and refactor overly long names or signatures instead of forcing awkward wraps.
- For new packages, include runnable examples or complete usage tests. Make test failures useful: include the input plus `got` and `want` in that order.
- Use `crypto/rand`, not `math/rand`, for keys, tokens, or other security-sensitive randomness.
