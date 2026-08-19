# Retain Reader hash routing

Public pages use clean SvelteKit paths while Reader routes remain browser-local hashes under `/reader/`. This preserves mature deep links, static hosting, offline navigation, and Reader Route ownership; migration requires a concrete product benefit large enough to justify compatibility work.
