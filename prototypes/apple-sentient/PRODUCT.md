# Tikkun Korim Product Context

## Product

Tikkun Korim is a browser-based practice reader for people preparing to read Torah. It combines the familiar Torah page, aliyah boundaries, recordings, and synchronized word highlighting so a reader can listen without losing their place.

## Primary User And Outcome

- Primary user: a Torah reader preparing an aliyah.
- Primary outcome: choose a reading, play its recording, and follow each word in the original page layout.
- Trust requirement: availability and progress must come from the real recording catalog and timing tracker. Do not invent readings, counts, notes, or completion states.

## Public Journey

- Home explains the product and sends readers directly into a real reading.
- Readings and coverage exposes what can be practiced now and what is still in progress.
- Tidbits holds practical notes without fabricating content when none are published.
- About explains the recordings, hand-timed word alignment, and open-source project.

## Product Boundary

The public site is SvelteKit. The mature reader is isolated at `/reader/` with its own hash routing, local preferences, accessibility behaviors, and compact/wide layouts. This redesign may present authentic reader screenshots, but it must not change reader implementation without separate approval.

## Experience Constraints

- Mobile is the first design target.
- Public pages should feel related to the reader without repeating one cinematic image treatment everywhere.
- The reader's Automatic, Light, Sepia, and Dark themes are product identity, not decorative color variants.
- Motion must explain focus, progression, or a theme change and must respect reduced-motion preferences.
- Existing navigation, search, filters, empty states, and direct reader links remain functional.
