// tsx compiles with esbuild's keepNames, which injects calls to a `__name` helper into functions.
// snarkjs serializes one such function into its prover worker threads, where the helper is missing.
// Preloaded into every thread (workers inherit --import), this defines it.
globalThis.__name ??= (fn) => fn;
