# Eicha Flow-Layout Implementation Guide

## Purpose

This guide describes how to add full Eicha support without inventing Tikkun
pages or predetermined visual line breaks.

The permanent layout policy is:

| Scroll | Layout mode | Source of visual line breaks |
| --- | --- | --- |
| Torah | `fixed` | Existing page JSON |
| Esther | `fixed` | Existing page JSON |
| Eicha | `flow` | Browser wrapping |

Eicha is not a temporary approximation of a future fixed layout. It is a
flowing text by design. A verse is a stable logical row, while the browser may
wrap that row onto any number of visual lines according to the viewport, font,
and reader settings.

The implementation must preserve every existing Torah and Esther layout rule.
Flow behavior is opt-in and scoped; the fixed layout remains the default.

## Goals

- Load all 154 verses of Eicha from a pinned, attributable source.
- Normalize the source into the annotation conventions already understood by
  the reader.
- Store one complete verse in each logical reader row.
- Let CSS wrap each verse responsively without generated word breakpoints.
- Justify complete visual lines without stretching the final visual line of a
  verse.
- Preserve petuchah and setumah as semantic metadata.
- Keep Eicha's CSS from changing Torah or Esther.
- Keep navigation, highlighting, and future audio word identities stable when
  the viewport or font changes.
- Add deterministic data validation and visual regression coverage.

## Non-goals

- Reproducing a nonexistent canonical Eicha page layout.
- Assigning words-per-line or characters-per-line limits.
- Measuring text width in a generator.
- Generating artificial page breaks.
- Reformatting the existing Torah or Esther JSON.
- Encoding Eicha setumot as horizontal gaps copied from fixed Tikkun pages.
- Fetching Sefaria during a normal production build.

## Terminology

Use these terms consistently because the existing code uses "line" and
"page" for physical Tikkun concepts.

- **Canonical verse**: normalized source text identified by chapter and verse.
- **Logical row**: one entry in a page JSON array and one rendered table row.
- **Visual line**: one line produced by browser wrapping inside a logical row.
- **Internal page**: a JSON loading container used by the current reader. For
  Eicha, page `1` is an implementation detail, not a printed page.
- **Fixed layout**: page JSON explicitly determines every logical/visual line.
- **Flow layout**: page JSON determines verse rows; CSS determines visual lines.

## Architectural Overview

```text
Existing Torah page JSON  ────────────────┐
Existing Esther page JSON ────────────────┼── LineType[] ── existing renderer
                                          │
Pinned Eicha source                       │
  └─ normalize into canonical verses      │
       └─ flow adapter ── Eicha page JSON ┘
```

The renderer continues receiving `LineType[]`. The layout mode changes how the
same HTML structure is styled, not how the whole reader is rebuilt.

## Current Behaviors to Preserve

The current files under `text/pages/torah/` and
`text/pages/esther/` are compiled layout artifacts. They contain both the
text and fixed physical layout decisions.

Important current conventions include:

- `text: string[][]` stores fixed columns and fragments.
- The outer `text` array supports special multi-column layouts such as
  Ha'azinu.
- Multiple strings in an inner array produce fixed setumah spacing.
- `verses` lists verses that begin on that physical line. A continuation line
  may have an empty `verses` array.
- `isPetucha` means that the fixed physical line must not be fully justified.
- `ktiv#[qere]` encodes the project's ketiv/qere display behavior.
- `#(פ)` is removed by the current text filter after helping represent the
  fixed-layout source.
- Token keys currently use `page:line:fragment:word` coordinates.

Do not reinterpret or regenerate these files as part of Eicha support.

## Recommended File Layout

Add these files when implementing full support:

```text
scripts/generate-lamentations-data.mjs
text/sources/lamentations.json
text/sources/lamentations.meta.json
text/pages/lamentations/1.json
text/lamentations-toc.json
app/scroll-layout.ts
app/components/eicha-flow-layout.vitest.ts
```

An overrides file should not be created until a real, documented source
correction is required. If one becomes necessary, use:

```text
text/sources/lamentations.overrides.json
```

Overrides must be keyed by stable verse reference, never page or line number.

## Layout Policy

Create one exhaustive source of truth for layout behavior. Do not infer it from
the current URL or from the number of page files.

An example `app/scroll-layout.ts` contract is:

```ts
import type { ScrollName } from './ref.ts'

export type ScrollLayoutMode = 'fixed' | 'flow'

const layoutByScroll: Record<ScrollName, ScrollLayoutMode> = {
  torah: 'fixed',
  esther: 'fixed',
  lamentations: 'flow',
}

export function layoutModeForScroll(
  scroll: ScrollName
): ScrollLayoutMode {
  return layoutByScroll[scroll]
}
```

The exhaustive `Record` makes a new scroll fail type-checking until its layout
mode has been chosen deliberately.

Expose the active scroll and layout mode through `ScrollViewModel`. The DOM
should not need to rediscover them from rendered verses.

Before constructing a new `ScrollDisplay`, assign both attributes on the
existing reader root:

```ts
book.dataset.scroll = target.scroll
book.dataset.layout = target.layoutMode
```

Always assign the attributes during every navigation. Do not only add a flow
class when entering Eicha, because it could remain behind when navigating back
to Esther.

The expected roots are:

```html
<div class="tikkun-book" data-scroll="esther" data-layout="fixed">
```

and:

```html
<div class="tikkun-book" data-scroll="lamentations" data-layout="flow">
```

Generic typography should use `data-layout`. Reserve `data-scroll` for a true
book-specific exception.

## Canonical Eicha Source

### Source selection

Use the same underlying source family already attributed by the project:
Miqra According to the Masorah (MAM), obtained through Sefaria.

Pin the Hebrew version explicitly instead of relying on Sefaria's current
default. Fetch chapters 1 through 5 from the v3 text endpoint using the Hebrew
version `Miqra according to the Masorah` and `return_format=text_only`.

Record at least the following in `lamentations.meta.json`:

```json
{
  "book": "Lamentations",
  "source": "Sefaria",
  "versionTitle": "Miqra according to the Masorah",
  "license": "CC-BY-SA",
  "chapterCount": 5,
  "verseCount": 154
}
```

If the API provides a version identifier or revision information, record it as
well. The generator should print the selected version and verse counts so that
a source refresh is reviewable.

### Build policy

Do not fetch the network during `npm run build`.

The intended workflow is:

1. A developer explicitly runs the Eicha data generator.
2. The generator fetches or refreshes the pinned source.
3. It normalizes and validates all chapters in memory.
4. It writes canonical and runtime artifacts atomically.
5. The generated JSON is reviewed and committed.
6. Normal builds consume only committed local files.

This keeps production builds reproducible and prevents a remote source change
from silently changing reader text.

## Canonical Data Model

The canonical representation should describe text and semantics, not rendering
coordinates:

```ts
export type ParagraphBreak = 'petucha' | 'setuma'

export type CanonicalVerse = {
  chapter: number
  verse: number
  text: string
  paragraphAfter?: ParagraphBreak
}
```

A possible checked-in structure is:

```json
{
  "book": "Lamentations",
  "versionTitle": "Miqra according to the Masorah",
  "chapters": [
    {
      "chapter": 1,
      "verses": [
        {
          "chapter": 1,
          "verse": 1,
          "text": "אֵיכָה יָשְׁבָה בָדָד...",
          "paragraphAfter": "setuma"
        }
      ]
    }
  ]
}
```

Do not put `page`, `line`, font size, width, or measured coordinates in this
file.

## Normalization Rules

Normalization must be explicit, deterministic, and strict. Unknown markup
should fail generation with the affected reference instead of being silently
discarded.

### Whitespace

- Decode HTML entities before final validation.
- Convert `&nbsp;` to an ordinary breaking space.
- Convert `&thinsp;` to an ordinary space unless it represents a recognized
  source marker that has already been extracted.
- Collapse repeated ordinary whitespace to one space.
- Trim the beginning and end of each verse.
- Do not insert nonbreaking spaces between normal words. They prevent wrapping
  and interfere with justification.

### Hebrew marks

- Preserve Hebrew letters, nikkud, cantillation, maqaf, sof pasuq, and paseq.
- Preserve maqaf inside a word group; do not convert it into a normal space.
- Keep a standalone paseq separated in source text. The existing tokenizer
  already folds it into the preceding audio token.
- Normalize Unicode only if the exact form is deliberately chosen and tested.
  Do not casually recompose or strip combining marks.

### Ketiv/qere

Convert source ketiv/qere notation into the convention already consumed by
`app/text-filter.ts`:

```text
ketiv#[qere]
```

Validate both sides before emitting the marker. A malformed or unmatched
ketiv/qere pair must stop generation and identify its chapter and verse.

### Paragraph markers

- Remove `{פ}` and `{ס}` from displayed verse text after extracting them.
- Store them as `paragraphAfter: "petucha"` or
  `paragraphAfter: "setuma"`.
- Reject a marker in an unexpected position rather than guessing.
- Preserve the marker in canonical metadata even if the initial stylesheet
  gives it little or no visible spacing.

### Source overrides

If a verified correction is required, use a small source-level override:

```json
{
  "Lamentations 5:1": {
    "text": "...",
    "reason": "Compared against the pinned MAM source on YYYY-MM-DD"
  }
}
```

Every override needs a reason. The generator applies overrides before final
validation and prints which references changed.

## Runtime Page Generation

### One internal page

Generate one file at `text/pages/lamentations/1.json` containing all 154
verses. This is small enough for the current reader and avoids inventing five
chapter "pages."

The internal page number is only a compatibility coordinate. Flow CSS must
ensure it is never presented as a printed Eicha page number.

### One logical row per verse

Generate each verse as:

```json
{
  "text": [["אֵיכָה יָשְׁבָה בָדָד..."]],
  "verses": [
    {
      "book": 1,
      "chapter": 1,
      "verse": 1
    }
  ],
  "aliyot": [],
  "isPetucha": false,
  "paragraphAfter": "setuma"
}
```

Important differences from fixed-layout JSON:

- `text` always has one column and one fragment.
- Every row has exactly one verse reference.
- A verse is never split across rows.
- Two verses are never combined into one row.
- `aliyot` remains empty in generated source data; runtime leining metadata is
  derived by the view model.
- `isPetucha` stays `false` because it means "do not justify this fixed physical
  line," not "a petuchah follows this verse."
- `paragraphAfter` carries Eicha's semantic paragraph marker separately.

Extend `LineType` and `RenderedLineInfo` with the optional field:

```ts
paragraphAfter?: 'petucha' | 'setuma'
```

Existing fixed files omit it and retain their current behavior.

### Table of contents

Generate `text/lamentations-toc.json` in the existing
1-based `{p, l}` format:

```json
{
  "1": {
    "1": {
      "1": { "p": 1, "l": 1 },
      "2": { "p": 1, "l": 2 }
    }
  }
}
```

The scroll-local book number is `1`. Line numbers are the 1-based ordinal of
the verse in the complete book:

| Chapter | Verses | Logical line range |
| --- | ---: | ---: |
| 1 | 22 | 1-22 |
| 2 | 22 | 23-44 |
| 3 | 66 | 45-110 |
| 4 | 22 | 111-132 |
| 5 | 22 | 133-154 |

The final reference therefore maps to `{ "p": 1, "l": 154 }`, causing the
existing resolver to report one internal page.

## Paragraph Rendering

The current fixed-layout representation should not be reused for Eicha
paragraph spacing:

- `isPetucha` disables justification on a physical fixed line.
- Multiple inner fragments make a horizontal setumah gap inside a physical
  fixed line.

Neither behavior correctly represents a flowing verse paragraph.

Render the optional semantic property on the row:

```html
<tr data-paragraph-after="setuma">
```

For flow layout, spacing belongs after the logical verse row. Start
conservatively because Eicha contains many paragraph markers and every verse is
already a separate row.

An initial policy could be:

- `setuma`: semantic-only or a very small block-end gap.
- `petucha`: a visibly larger block-end gap.

Use padding on the `.line` cell rather than margins on `<tr>`, because table-row
margin behavior is unreliable.

Example:

```css
.tikkun-book[data-layout='flow']
  tr[data-paragraph-after='setuma']
  .line {
  padding-block-end: 0.12em;
}

.tikkun-book[data-layout='flow']
  tr[data-paragraph-after='petucha']
  .line {
  padding-block-end: 0.65em;
}
```

Treat these numbers as typographic settings to approve through visual review,
not textual data.

## Flow CSS

### Isolation rule

Do not alter the existing unscoped declarations for `.line-content`,
`.column`, `.fragment`, `.fragment::after`, or `.line.mod-petucha` to obtain
Eicha flow behavior.

Every new flow override must begin with:

```css
.tikkun-book[data-layout='flow']
```

This makes the current fixed layout the safe default if an attribute is ever
missing.

### Recommended starting rules

The exact measure and spacing should be visually tuned, but the structural
rules should resemble:

```css
.tikkun-book[data-layout='flow'] {
  --flow-text-measure: 48rem;
}

.tikkun-book[data-layout='flow'] .tikkun-page {
  width: 100%;
}

.tikkun-book[data-layout='flow'] .tikkun-page table {
  width: min(100%, var(--flow-text-measure));
  table-layout: fixed;
}

.tikkun-book[data-layout='flow'] .tikkun-page-number {
  display: none;
}

.tikkun-book[data-layout='flow'] .line {
  line-height: 1.35;
}

.tikkun-book[data-layout='flow'] .line-content {
  display: block;
  min-width: 0;
  width: 100%;
  direction: rtl;
  text-align: justify;
  text-align-last: start;
  white-space: normal;
  word-break: normal;
  overflow-wrap: normal;
}

.tikkun-book[data-layout='flow'] .column,
.tikkun-book[data-layout='flow'] .fragment {
  display: block;
  min-width: 0;
  width: 100%;
}

.tikkun-book[data-layout='flow'] .fragment::after {
  display: none;
}

.tikkun-book[data-layout='flow']
  .line.mod-petucha
  .line-content {
  text-align: justify;
  text-align-last: start;
}
```

### Why each override exists

- A bounded `--flow-text-measure` keeps desktop lines readable without fixing
  their word breaks.
- `table-layout: fixed` gives the browser an actual wrapping width instead of
  allowing table content to determine an unexpectedly wide table.
- `line-height: 1.35` gives wrapped visual lines more vertical room than the
  current fixed-line `100%` setting.
- `text-align: justify` expands complete wrapped lines.
- `text-align-last: start` keeps the final visual line natural and right-aligned
  in RTL text.
- Disabling `.fragment::after` removes the fixed-layout trick that forces the
  last line to fill the entire width.
- Resetting `.column` removes the fixed setumah/Ha'azinu flex behavior only
  inside flow mode.
- The `.mod-petucha` override is defensive. Eicha should not normally set
  `isPetucha`, but an accidental flag must not disable wrapping justification.

The `48rem` measure is a starting value, not a canonical constraint. Approve or
adjust it by looking at representative desktop and mobile screenshots.

## What Browser Wrapping Does

The generated verse remains one string inside one logical row. `Line.ts`
tokenizes it into inline `.word` spans. The browser places those spans into the
available width.

For a long verse:

```text
logical row 17
  visual line 1  -> justified
  visual line 2  -> justified
  visual line 3  -> natural RTL ending
```

When the viewport or font size changes, only the visual-line grouping changes.
The JSON row, verse reference, token order, and word keys remain the same.

Do not insert `<br>`, newline characters, or generated soft-break markers into
the source text.

## Registering Full Eicha Support

Keep the current unsupported-scroll behavior until all Eicha artifacts and
tests are ready. Registration is the final enablement step.

At that point:

1. Add `lamentations` to `ScrollName` in `app/ref.ts`.
2. Import `lamentations-toc.json` in `app/location.ts`.
3. Add it to `scrollTOCs`.
4. Add the `flow` entry to the exhaustive layout policy.
5. Expose the active scroll and layout through `ScrollViewModel`.
6. Set the reader root attributes in `app.jumpTo` before constructing
   `ScrollDisplay`.
7. Keep Lamentations out of fixed page-route validation. It should be opened by
   reading/run/reference routes, not by a public printed-page route.
8. Update the existing location tests so Lamentations becomes supported only
   after its TOC and page data exist.

The calendar model already produces a `lamentations` Megillah run covering
1:1 through 5:22. Once `hasScrollData('lamentations')` becomes true, the normal
supported-reading selection can use it instead of skipping it.

## Navigation and Reader Behavior

With one internal page:

- `FullScrollViewModel` loads all 154 rows.
- There is no previous or next internal Eicha page.
- Reference navigation resolves directly to the row for that verse.
- The first-page caption is already normally hidden, and flow CSS hides it even
  during route-reveal behavior.
- No page separator appears because there is only one page.
- Scroll preservation continues using logical row indices.
- A wrapped verse remains one scroll anchor; word-level highlighting may still
  scroll to the exact word.

Do not create `/lamentations/page/1` as a user-facing concept unless product
requirements later introduce a generic internal-chunk diagnostic route.

## Audio and Token Stability

Eicha will never transition to a fixed layout, so the one-verse-per-row model
provides stable token coordinates:

```text
page 1 : verse ordinal - 1 : fragment 0 : word ordinal
```

Changing viewport width, text measure, line height, or font size does not alter
those coordinates. It only changes where the browser paints each word.

Text corrections can still shift word ordinals. Finish source validation before
authoring word-level Eicha cues. If a later correction adds, removes, or splits
a word, treat affected cue data as requiring regeneration or review.

Paragraph metadata and spacing changes do not affect token keys.

## Automated Data Validation

Extend `app/data/generated-catalog-validation.test.ts` so generated Eicha data
must satisfy all of these invariants:

### Canonical source

- Exactly five chapters.
- Verse counts are `22, 22, 66, 22, 22`.
- Exactly 154 verses total.
- Chapter and verse numbers are continuous.
- No verse text is empty.
- No HTML tags or undecoded entities remain.
- No `{פ}` or `{ס}` markers remain inside displayed text.
- Every ketiv/qere marker matches the accepted internal grammar.
- `paragraphAfter`, when present, is `petucha` or `setuma`.

### Runtime page data

- Only `text/pages/lamentations/1.json` exists.
- It contains exactly 154 rows.
- Every row has `text.length === 1` and `text[0].length === 1`.
- Every row begins exactly one verse.
- Runtime verse text matches its canonical verse exactly after the deliberate
  adapter transformation.
- Every row has `aliyot: []` and `isPetucha: false`.
- Paragraph metadata matches the canonical source.

### Table of contents

- Every canonical verse has exactly one TOC entry.
- Every TOC entry has `p === 1`.
- TOC line numbers run continuously from 1 through 154.
- Each TOC location points to a row containing the same chapter and verse.
- The reverse relationship is also true: every row is represented in the TOC.

The current bidirectional TOC validation is limited to Torah. Generalize it for
all scrolls whose rows start exactly one verse, including Eicha.

## Structural CSS Tests

Extend `app/components/page-layout.test.ts` with source-level guardrails:

- Flow rules are all scoped under `[data-layout='flow']`.
- Fixed `.fragment::after` remains present.
- Flow `.fragment::after` is disabled.
- Flow text uses `text-align: justify`.
- Flow text uses `text-align-last: start`.
- Flow mode defines a readable maximum measure.
- Flow mode hides the page-number caption.
- No unscoped change replaces the base `.line-content`, `.column`, or
  `.fragment` behavior.

These tests are not substitutes for browser rendering. They prevent an
otherwise innocent cleanup from moving a flow override into global CSS.

## Browser Geometry Tests

Use the existing Vitest browser workspace, which already runs through
Playwright in Chromium.

Create representative rendered fixtures rather than testing all 154 verses.
Wait for `document.fonts.ready` before measuring or capturing images.

### Required geometry checks

1. **Long Eicha verse wraps**
   - Render a representative long verse in flow mode.
   - Group `.word` elements by their rounded `getBoundingClientRect().top`.
   - Assert that at least two distinct visual line positions exist at the
     selected narrow viewport.

2. **No horizontal overflow**
   - Assert that the flow table and line content remain within the reader's
     client width, allowing at most a one-pixel rounding tolerance.

3. **Justification contract**
   - Assert computed `text-align` is `justify`.
   - Assert computed `text-align-last` is `start`.
   - Assert the final visual line of a short verse is not expanded by the
     fixed-layout pseudo-element.

4. **Verse identity survives wrapping**
   - Change the fixture width.
   - Confirm visual line positions change.
   - Confirm token keys and token order do not change.

5. **Annotation toggle survives flow overrides**
   - Toggle between annotation modes.
   - Confirm only the expected fragment copy is visible.
   - Confirm the visible copy still wraps and remains within the container.

6. **Layout mode does not leak**
   - Render Eicha and assert `data-layout="flow"`.
   - Navigate to Esther using the same reader root.
   - Assert `data-layout="fixed"`.
   - Confirm the fixed `.fragment::after` behavior is active again.

## Visual Regression Matrix

Use a fixed Chromium version, committed web fonts, fixed viewport dimensions,
and a fixed reader theme for screenshot baselines. Disable incidental animation
and wait for fonts and a paint frame before capture.

Capture at least:

| Case | Suggested viewport | What it protects |
| --- | --- | --- |
| Eicha 1:1 | 1440 x 1000 | Desktop measure and normal wrapping |
| Eicha 1:1 | 390 x 844 | Mobile wrapping and gutter behavior |
| Eicha 3:1-6 | 1440 x 1000 | Short verses are not stretched |
| Eicha 3:1-6 | 390 x 844 | Dense short-verse mobile rhythm |
| Eicha paragraph boundary | 1440 x 1000 | Petuchah/setumah vertical spacing |
| Eicha ketiv/qere example | 900 x 900 | Both annotation modes |
| Esther page 1 | Existing desktop baseline | Fixed setumah behavior is unchanged |
| Esther's ten sons | Existing desktop baseline | Special column layout is unchanged |
| Eicha then Esther | 900 x 900 | Flow attributes do not leak on navigation |

Screenshot assertions should focus on stable reader content. Crop or hide
unrelated controls whose animations or timestamps could create noise.

Chromium should own the pixel baseline. If Firefox and WebKit are added later,
prefer cross-browser geometry/invariant tests and maintain separate screenshots
only when the project is prepared for engine-specific font rendering diffs.

## Manual QA Checklist

Test on at least one desktop browser and one physical or simulated mobile
device:

- Open Eicha at 1:1, 3:1, and 5:22.
- Confirm every direct reference lands on the correct verse.
- Resize continuously from wide desktop to narrow mobile.
- Confirm words rewrap without horizontal scrolling.
- Confirm complete visual lines look justified.
- Confirm the final visual line of each verse is naturally right-aligned.
- Confirm short chapter 3 verses do not develop large word gaps.
- Confirm verse labels appear once per logical row.
- Toggle annotations and verify ketiv/qere display.
- Change reader font size and verify token highlighting still follows words.
- Navigate from Eicha to Esther and inspect Esther page 1.
- Inspect Esther setumot and the ten sons layout.
- Navigate back to Eicha and confirm flow behavior returns.
- Verify `/next` selects Eicha only after full support is registered.
- Verify dates without supported data continue skipping unsupported scrolls.

## Implementation Order

### Phase 1: Introduce layout isolation

1. Add the layout policy type and mapping for currently supported scrolls.
2. Expose `scroll` and `layoutMode` on `ScrollViewModel`.
3. Set `data-scroll` and `data-layout` on every `app.jumpTo`.
4. Add switching tests using Torah and Esther.
5. Verify there are no visual changes because both remain `fixed`.

Do not enable Lamentations yet.

### Phase 2: Add canonical data generation

1. Add the explicit generator.
2. Fetch the pinned MAM version for chapters 1-5.
3. Normalize whitespace, paragraph markers, and ketiv/qere.
4. Validate verse counts and source grammar.
5. Write canonical data and metadata atomically.
6. Review the generated diff and attribution.

### Phase 3: Generate runtime artifacts

1. Extend the line types with optional semantic paragraph metadata.
2. Generate the one-page, one-verse-per-row runtime JSON.
3. Generate the complete TOC.
4. Add canonical/runtime/TOC validation tests.
5. Confirm existing Torah and Esther artifacts are byte-for-byte untouched.

### Phase 4: Add flow rendering

1. Render `paragraphAfter` as a row data attribute.
2. Add only scoped flow CSS.
3. Add structural CSS tests.
4. Add browser geometry tests.
5. Approve desktop and mobile visual baselines.

Lamentations may still remain unregistered while this is tested through a
fixture or development-only route.

### Phase 5: Register Eicha

1. Extend `ScrollName`.
2. Register the Lamentations TOC.
3. Add `lamentations: 'flow'` to the layout mapping.
4. Update route and location tests.
5. Verify the Tisha B'Av Megillah run opens the full scroll.
6. Verify upcoming-reading navigation now treats Eicha as supported.

### Phase 6: Final regression pass

Run:

```sh
npm test
npm run test:browser
npm run check
npm run build
```

Review visual baselines separately and perform the manual Eicha-to-Esther
switching check.

## Acceptance Criteria

Full Eicha support is complete when all of the following are true:

- The app renders exactly 154 canonical verses from 1:1 through 5:22.
- Each verse is exactly one logical row.
- Eicha exposes no artificial printed page numbers or page routes.
- Long verses wrap at ordinary word boundaries.
- Complete visual lines are justified.
- Final visual lines and short verses are not stretched.
- No tested viewport produces horizontal text overflow.
- Petuchah and setumah survive as canonical semantic metadata.
- Flow styling is entirely scoped to `data-layout="flow"`.
- Torah and Esther fixed-layout visual baselines are unchanged.
- Navigating Eicha to Esther resets the layout mode reliably.
- Direct verse navigation resolves to the correct row.
- Rewrapping does not change token keys.
- Data generation is deterministic and is not part of the normal networkless
  build.
- All data, browser, type, lint, and production-build checks pass.

## Common Mistakes to Avoid

- Do not split Eicha verses based on measured width.
- Do not insert manual `<br>` elements into canonical text.
- Do not add `white-space: nowrap` to the flow fragment.
- Do not preserve Sefaria `&nbsp;` between ordinary words.
- Do not use `isPetucha` as Eicha's semantic paragraph field.
- Do not use multiple inner fragments to simulate an Eicha setumah.
- Do not change the global `.fragment::after` rule for Eicha.
- Do not target only `[data-scroll="lamentations"]` for behavior reusable by
  Ruth, Kohelet, or Shir HaShirim; use `[data-layout="flow"]`.
- Do not enable `hasScrollData('lamentations')` before pages, TOC, CSS, and tests
  are all present.
- Do not update screenshot baselines without inspecting Esther for regressions.

## Future Flow Scrolls

The same flow path can later support Ruth, Kohelet, Shir HaShirim, or another
scroll with no canonical page layout:

1. Add a pinned canonical source.
2. Normalize it into the same verse model.
3. Generate one verse per logical row.
4. Choose appropriate internal chunking based on size.
5. Register the scroll with `layout: 'flow'`.
6. Add representative data and visual tests.

The reusable asset is the source normalizer, semantic verse model, flow adapter,
and scoped typography. It is intentionally not a miniature typesetting engine.
