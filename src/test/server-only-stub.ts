// Vitest aliases the `server-only` package to this no-op so route handlers and
// data modules (which import "server-only") can be exercised in the node test
// environment. In real builds the genuine package still guards against client
// imports.
export {};
