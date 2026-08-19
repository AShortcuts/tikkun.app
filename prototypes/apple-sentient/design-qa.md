# Apple / Sentient Prototype QA - 2026-08-07

## Comparison target

- Source visual truth: `.impeccable/mocks/home-mobile-approved.png` (853 x 1844 px).
- Implementation screenshot: `.impeccable/qa/home-mobile-final.jpg` (390 x 844 px).
- Normalized source: `.impeccable/qa/home-mobile-approved-normalized.png` (390 x 844 px).
- Full comparison: `.impeccable/qa/home-mobile-comparison-final.png` (approved target left, implementation right).
- Supporting responsive evidence: `.impeccable/qa/home-desktop-final.jpg` (1440 x 1005 px).
- State: prototype home, System theme resolved to Dark, initial scroll position, mobile menu closed.

## Findings

- P0: none.
- P1: none.
- P2: none remaining.
- P3: the approved mock uses a blue eyebrow accent while the implementation uses the public site's warmer gold accent. This intentionally connects the black hero to the sepia reading surface.
- Intentional deviation: the CTA is black, right-aligned, and outlined in white in Dark mode per the user's refinement.
- Intentional deviation: the generated reader approximation is replaced by authentic captures of the reader UI.

## Functional verification

- Light, Sepia, Dark, and System update the prototype treatment and matching reader preview.
- The prototype theme persists independently from the public site and reader preferences.
- Mobile navigation is dismissible by outside click and Escape, with focus restored to its trigger.
- Coverage search, filters, empty state, progressive disclosure, and direct reader links remain functional.
- No reader source or reader behavior is changed by this prototype.

Final result before isolation: passed.
