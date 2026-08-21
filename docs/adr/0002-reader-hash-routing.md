# Use Reader hash routing

Public pages use clean SvelteKit paths while Reader routes remain browser-local hashes under `/reader/`. This keeps the static build and offline navigation simple while giving Reader Route sole ownership of reader state.
