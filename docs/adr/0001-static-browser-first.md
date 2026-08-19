# Keep production browser-first and static

Tikkun remains a browser-first static app because reading, playback, local persistence, search, and explicit Offline Downloads do not require a production server. SvelteKit prerenders deployable files; server infrastructure is added only when a future capability requires trusted remote state or authorization.
