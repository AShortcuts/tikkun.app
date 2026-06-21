# Cue Derivation Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a robust foundation for future automated cue derivation that can generate, score, review, correct, regress, and publish word-level Torah audio cues with high confidence.

**Architecture:** Keep the production app static and simple: playback consumes published `WordCue[]` exactly as it does today. Move derivation into a separate local/admin publishing pipeline with richer intermediate artifacts: canonical reading tokens, alignment evidence, review findings, correction history, validation reports, and final cue exports. Treat generated cues as drafts until domain-aware scoring and human review promote them to published cue JSON.

**Tech Stack:** TypeScript, Vite, Ava, Vitest browser tests, Node scripts with `--experimental-transform-types`, existing DOM token keys, existing `CueExportPayload`, existing admin draft/export flow, optional future forced-alignment engine behind an adapter.

---

## Current Context

Tikkun is a static browser-first app. It already has a strong runtime boundary: audio playback, highlighting, and video rendering consume cue payloads from `src/data/audio-cues/`. The future derivation system should preserve that boundary.

Important existing files:

- `src/audio/types.ts`: defines `WordCue`, `AudioRecording`, and `CueExportPayload`.
- `src/audio/library.ts`: loads published cue JSON and normalizes the first cue start.
- `src/audio/cue-file.ts`: defines cue file paths and JSON formatting.
- `src/data/audio-cues/README.md`: documents current cue file naming and payload rules.
- `src/data/audio-cues/index.ts`: eagerly imports cue payloads by `audioId`.
- `src/reading/aliyah-token-sequence.ts`: collects the token sequence used for aliyah playback.
- `src/reading/highlight-controller.ts`: maps cue coordinates to token keys.
- `src/reading/audio-controller.ts`: owns the active audio session and playback events.
- `src/admin/draft-storage.ts`: persists local manual timing drafts by recording.
- `src/index.ts`: currently wires admin cue timing, draft resume, export, playback, highlighting, and UI orchestration.
- `src/audio/cue-analytics-core.ts`: current interval-only cue analytics.
- `src/components/CueAnalyticsPage.ts`: displays cue coverage and analytics, including local drafts.
- `scripts/generate-audio-manifest.mjs`: generates recording metadata from source audio.
- `scripts/record-aliyah-videos.mjs`: proves the repo already supports local publishing workflows outside the production static runtime.

Current cue inventory on 2026-06-21:

- 63 cue JSON files exist under `src/data/audio-cues/`.
- 10 are complete.
- 53 are empty.
- 0 are partial.

The existing analytics cannot support production cue derivation by itself. It sees timing intervals, but it does not understand text structure, pasuk boundaries, phrase boundaries, trope-driven pauses, repeated words, skipped words, recording defects, or alignment confidence. This plan replaces interval-only thinking with a domain-aware derivation foundation.

## Non-Negotiable Design Constraints

- Published playback data stays simple: runtime code should continue consuming clean `CueExportPayload` and `WordCue[]`.
- Draft derivation data must not be confused with published cues.
- Confidence must be multi-dimensional, not a single opaque number.
- Human review must receive reasoned findings, not generic "long gap" warnings.
- Batch processing must be reproducible and auditable.
- Manual corrections must be first-class inputs, not one-off edits that disappear after export.
- Tokenization changes must invalidate or migrate draft artifacts explicitly.
- The system must fail closed: uncertain drafts require review; they must not silently publish.

## Target Architecture

### Layer 1: Canonical Reading Model

This layer creates the source-of-truth token stream for a recording. It must describe exactly what the app expects to highlight.

Create:

- `src/cue-generation/canonical-reading.ts`
- `src/cue-generation/hebrew-normalization.ts`
- `src/cue-generation/canonical-reading.test.ts`
- `src/cue-generation/hebrew-normalization.test.ts`

Core responsibilities:

- Convert existing token keys into ordered canonical token records.
- Preserve rendered coordinates: `pageNumber`, `lineIndex`, `fragmentIndex`, `wordIndex`.
- Preserve display text and normalized matching text.
- Mark structural boundaries such as sof pasuk and line/page transitions.
- Leave room for future trope-sensitive boundaries without requiring them in the first implementation.

Suggested types:

```ts
export interface CanonicalToken {
  index: number
  tokenKey: string
  displayText: string
  normalizedText: string
  pageNumber: number
  lineIndex: number
  fragmentIndex: number
  wordIndex: number
  structural: TokenStructure
}

export interface TokenStructure {
  startsPasuk: boolean
  endsPasuk: boolean
  startsLine: boolean
  endsLine: boolean
  startsPage: boolean
  endsPage: boolean
  expectedPauseAfter: ExpectedPauseKind | null
}

export type ExpectedPauseKind =
  | 'sof-pasuk'
  | 'aliyah-boundary'
  | 'line-transition'
  | 'none'
```

Initial Hebrew normalization should be explicit and tested:

- Remove cantillation marks.
- Remove or normalize nekudot for matching.
- Normalize maqaf and punctuation behavior.
- Preserve enough information to show the original token in review UI.
- Do not normalize by ad hoc string replacement inside scoring code.

### Layer 2: Alignment Evidence Model

This layer stores what a derivation engine believes happened in the audio. It is not final cue data.

Create:

- `src/cue-generation/alignment-types.ts`
- `src/cue-generation/alignment-evidence.ts`
- `src/cue-generation/alignment-evidence.test.ts`

Core responsibilities:

- Represent model word hypotheses and matched canonical tokens.
- Represent skipped, repeated, inserted, and uncertain spans.
- Store timestamps, durations, and evidence scores.
- Support future adapters for Whisper, Gentle/MFA-style forced alignment, or a custom local aligner.

Suggested types:

```ts
export interface AlignmentRun {
  audioId: string
  tokenizationVersion: string
  generatedAt: string
  engine: AlignmentEngineMetadata
  canonicalTokenCount: number
  matches: AlignmentMatch[]
  unmatchedAudio: AudioHypothesis[]
  diagnostics: AlignmentDiagnostic[]
}

export interface AlignmentMatch {
  canonicalIndex: number
  tokenKey: string
  timeStart: number
  timeEnd: number | null
  textEvidence: TextEvidence
  acousticEvidence: AcousticEvidence
  sequenceEvidence: SequenceEvidence
}

export interface TextEvidence {
  expectedNormalized: string
  observedNormalized: string
  score: number
  matchKind: 'exact' | 'normalized' | 'fuzzy' | 'missing' | 'inserted'
}

export interface AcousticEvidence {
  score: number
  boundaryScore: number
  speechProbability: number | null
  silenceBeforeSeconds: number
  silenceAfterSeconds: number
}

export interface SequenceEvidence {
  score: number
  order: 'in-order' | 'repeated' | 'skipped' | 'recovered' | 'ambiguous'
}
```

The first implementation can use deterministic fixture data instead of a real forced aligner. This lets the repo build the architecture, tests, review semantics, and publication rules before choosing an engine.

### Layer 3: Domain-Aware Scoring

This layer decides whether an alignment match is trustworthy and why.

Create:

- `src/cue-generation/scoring.ts`
- `src/cue-generation/scoring.test.ts`
- `src/cue-generation/review-findings.ts`
- `src/cue-generation/review-findings.test.ts`

Core responsibilities:

- Combine text, acoustic, sequence, timing, and structure evidence.
- Avoid a single misleading confidence score as the only output.
- Generate reasoned findings for human review.
- Distinguish expected pauses from risky pauses.

Suggested types:

```ts
export interface CueConfidence {
  textMatch: number
  sequenceFit: number
  acousticBoundary: number
  timingStability: number
  structuralFit: number
  publishable: boolean
  requiresReview: boolean
  reasons: CueConfidenceReason[]
}

export type CueConfidenceReason =
  | 'exact-text-match'
  | 'normalized-text-match'
  | 'expected-sof-pasuk-pause'
  | 'unexpected-internal-pause'
  | 'low-acoustic-boundary'
  | 'repeated-token'
  | 'skipped-token'
  | 'ambiguous-token-match'
  | 'non-monotonic-time'
  | 'large-downstream-drift'

export interface ReviewFinding {
  id: string
  audioId: string
  severity: 'info' | 'low' | 'medium' | 'high' | 'blocking'
  canonicalIndex: number
  tokenKey: string
  label: string
  explanation: string
  suggestedAction: 'accept' | 'listen' | 'retime' | 'split' | 'mark-recording-defect'
}
```

Example finding language:

- `Expected 2.8s pause after sof pasuk, low risk.`
- `Unexpected 2.8s pause inside phrase, high risk.`
- `Repeated token recovered after one-word backtrack, medium risk.`
- `Cue time moved backward by 0.12s, blocking.`

This replaces the current "long pause outlier" framing with domain-aware findings.

### Layer 4: Review Session Model

This layer manages review state and correction history separately from final cues.

Create:

- `src/admin/cue-review/review-session.ts`
- `src/admin/cue-review/review-storage.ts`
- `src/admin/cue-review/review-session.test.ts`
- `src/admin/cue-review/review-storage.test.ts`

Core responsibilities:

- Store generated draft alignment runs.
- Store accepted/rejected findings.
- Store manual corrections as operations.
- Recompute derived cue drafts from alignment evidence plus correction operations.
- Preserve audit history so a batch can be rerun without losing human decisions.

Suggested operation model:

```ts
export type CueReviewOperation =
  | {
      type: 'accept-generated-cue'
      tokenKey: string
      acceptedAt: string
    }
  | {
      type: 'retime-cue'
      tokenKey: string
      previousTimeStart: number
      nextTimeStart: number
      correctedAt: string
    }
  | {
      type: 'mark-finding-resolved'
      findingId: string
      resolution: 'accepted' | 'corrected' | 'recording-defect'
      resolvedAt: string
    }
```

Do not overload `src/admin/draft-storage.ts` with this richer model. Keep manual tap-timing drafts and generated review sessions separate, then build a narrow bridge when importing generated cues into the existing admin editor.

### Layer 5: Publication and Validation

This layer promotes reviewed draft cues into the current `CueExportPayload` format.

Create:

- `src/cue-generation/publication.ts`
- `src/cue-generation/validation.ts`
- `src/cue-generation/publication.test.ts`
- `src/cue-generation/validation.test.ts`
- `scripts/validate-audio-cues.mjs`

Core responsibilities:

- Convert canonical tokens plus approved/corrected times into `WordCue[]`.
- Enforce monotonic cue times.
- Enforce cue count equals token count before publication.
- Enforce tokenization version matches.
- Reject blocking review findings.
- Verify all cue coordinates still map to a canonical token.
- Produce readable validation output for individual files and batches.

Validation must check more than JSON shape:

- No missing cue for a canonical token.
- No duplicate cue key unless explicitly allowed by rendered token duplication rules.
- First cue normalizes to `0` only at export time, preserving source evidence separately.
- Cue times are finite numbers.
- Cue times are non-decreasing, with strict increase preferred after the first cue.
- Long pauses are allowed only when either structurally expected or reviewed.
- All blocking findings are resolved before publish.

### Layer 6: Batch Processing

This layer runs the pipeline across recordings reproducibly.

Create:

- `scripts/derive-audio-cues.mjs`
- `src/cue-generation/batch-plan.ts`
- `src/cue-generation/batch-plan.test.ts`

Core responsibilities:

- Select recordings by `audioId`, parsha, aliyah, narrator, missing cues, or stale tokenization.
- Produce deterministic output paths under a review/draft area, not directly into `src/data/audio-cues/`.
- Summarize generated, blocked, review-required, and publishable recordings.
- Preserve per-recording logs for future diagnosis.

Suggested local artifact layout:

```text
local/cue-generation/
  alignment-runs/
  review-sessions/
  reports/
```

If this repo does not want a `local/` folder, use an ignored path under `.tikkun-local/`. Do not store bulky model output or audio-derived transient files in committed source.

## Implementation Tasks

### Task 1: Document the Architecture Boundary

**Files:**

- Modify: `docs/architecture.md`
- Modify: `CONTEXT.md`

- [ ] Add a "Cue Derivation and Review" section to `docs/architecture.md` that states published cues remain runtime data while derivation artifacts belong to local/admin publishing workflows.
- [ ] Add domain language to `CONTEXT.md`:
  - Canonical Token
  - Alignment Evidence
  - Review Finding
  - Published Cue
  - Correction Operation
- [ ] Run `npm run check`.
- [ ] Commit with message `docs: define cue derivation architecture boundary`.

### Task 2: Add Canonical Reading Types and Normalization

**Files:**

- Create: `src/cue-generation/canonical-reading.ts`
- Create: `src/cue-generation/hebrew-normalization.ts`
- Create: `src/cue-generation/canonical-reading.test.ts`
- Create: `src/cue-generation/hebrew-normalization.test.ts`

- [ ] Write tests for Hebrew normalization using tokens with nekudot, ta'amim, sof pasuk, maqaf, and punctuation.
- [ ] Implement `normalizeHebrewTokenForCueMatching(text: string): string`.
- [ ] Write tests that parse token keys into cue coordinates.
- [ ] Implement `canonicalTokenFromTokenKey`.
- [ ] Write tests for structural metadata using display text ending in sof pasuk.
- [ ] Implement `createCanonicalToken`.
- [ ] Run `npm test -- src/cue-generation/hebrew-normalization.test.ts src/cue-generation/canonical-reading.test.ts`.
- [ ] Commit with message `feat: add canonical cue reading model`.

### Task 3: Add Alignment Evidence Types

**Files:**

- Create: `src/cue-generation/alignment-types.ts`
- Create: `src/cue-generation/alignment-evidence.ts`
- Create: `src/cue-generation/alignment-evidence.test.ts`

- [ ] Write tests that build a valid alignment run from canonical tokens and deterministic word hypotheses.
- [ ] Implement alignment evidence types with no dependency on a specific ASR provider.
- [ ] Implement basic validation for required fields, finite times, and known token keys.
- [ ] Run `npm test -- src/cue-generation/alignment-evidence.test.ts`.
- [ ] Commit with message `feat: model cue alignment evidence`.

### Task 4: Add Domain-Aware Scoring and Review Findings

**Files:**

- Create: `src/cue-generation/scoring.ts`
- Create: `src/cue-generation/scoring.test.ts`
- Create: `src/cue-generation/review-findings.ts`
- Create: `src/cue-generation/review-findings.test.ts`

- [ ] Write a test where a long pause after sof pasuk produces a low-risk expected-pause finding.
- [ ] Write a test where the same pause inside a phrase produces a high-risk unexpected-pause finding.
- [ ] Write tests for repeated token, skipped token, low acoustic boundary, and non-monotonic time.
- [ ] Implement `scoreAlignmentMatch`.
- [ ] Implement `createReviewFindings`.
- [ ] Keep the current `src/audio/cue-analytics-core.ts` unchanged in this task; the new model should prove itself independently first.
- [ ] Run `npm test -- src/cue-generation/scoring.test.ts src/cue-generation/review-findings.test.ts`.
- [ ] Commit with message `feat: add domain-aware cue confidence scoring`.

### Task 5: Add Review Session Storage

**Files:**

- Create: `src/admin/cue-review/review-session.ts`
- Create: `src/admin/cue-review/review-storage.ts`
- Create: `src/admin/cue-review/review-session.test.ts`
- Create: `src/admin/cue-review/review-storage.test.ts`

- [ ] Write tests for accepting a generated cue, retiming a cue, resolving a finding, and replaying operations.
- [ ] Implement immutable review operation application.
- [ ] Implement browser storage validation similar to `src/admin/draft-storage.ts`, but with a separate storage key prefix.
- [ ] Ensure invalid stored review sessions are rejected with explicit console errors and removed only when malformed or version-incompatible.
- [ ] Run `npm test -- src/admin/cue-review/review-session.test.ts src/admin/cue-review/review-storage.test.ts`.
- [ ] Commit with message `feat: add cue review session model`.

### Task 6: Add Publication Validation

**Files:**

- Create: `src/cue-generation/publication.ts`
- Create: `src/cue-generation/validation.ts`
- Create: `src/cue-generation/publication.test.ts`
- Create: `src/cue-generation/validation.test.ts`

- [ ] Write tests that reject missing cues, duplicate token keys, non-finite times, non-monotonic times, unresolved blocking findings, and tokenization mismatches.
- [ ] Write tests that convert approved review sessions into `CueExportPayload`.
- [ ] Implement validation errors as typed results, not broad thrown strings.
- [ ] Implement publication conversion using `formatCueFileJson` from `src/audio/cue-file.ts`.
- [ ] Run `npm test -- src/cue-generation/publication.test.ts src/cue-generation/validation.test.ts`.
- [ ] Commit with message `feat: validate cue publication payloads`.

### Task 7: Add Local Validation Script

**Files:**

- Create: `scripts/validate-audio-cues.mjs`
- Modify: `package.json`

- [ ] Add `audio:cues:validate` script that runs the validator against published cue JSON.
- [ ] Support `--audio-id`, `--parsha`, and `--all`.
- [ ] Print a compact summary with counts for valid, review-needed, and invalid files.
- [ ] Exit non-zero when any published cue file is invalid.
- [ ] Run `npm run audio:cues:validate -- --all`.
- [ ] Run `npm run check`.
- [ ] Commit with message `feat: add cue validation script`.

### Task 8: Add Batch Derivation Skeleton

**Files:**

- Create: `scripts/derive-audio-cues.mjs`
- Create: `src/cue-generation/batch-plan.ts`
- Create: `src/cue-generation/batch-plan.test.ts`
- Modify: `package.json`

- [ ] Add batch selection tests for missing cues, exact audio IDs, parsha filter, and narrator filter.
- [ ] Implement deterministic batch planning from `audioRecordings` and current cue progress.
- [ ] Add `audio:cues:derive` script that creates draft reports, but does not write published cue files.
- [ ] Make the first derivation engine a fixture adapter so the rest of the pipeline can be tested before integrating real forced alignment.
- [ ] Run `npm test -- src/cue-generation/batch-plan.test.ts`.
- [ ] Run `npm run audio:cues:derive -- --audio-id=bereshit-1 --engine=fixture`.
- [ ] Commit with message `feat: add cue derivation batch skeleton`.

### Task 9: Bridge Generated Drafts Into Review UI

**Files:**

- Create: `src/admin/cue-review/import-generated-draft.ts`
- Create: `src/admin/cue-review/import-generated-draft.test.ts`
- Modify: `src/index.ts`
- Modify: `index.html`

- [ ] Add tests that convert a publishable review session into admin draft cues without losing token order.
- [ ] Add an admin action for importing a generated draft into the current recording session.
- [ ] Keep the existing manual `Record/Edit Timing` flow working unchanged.
- [ ] Show review finding counts in admin status before import.
- [ ] Run targeted admin/review tests.
- [ ] Run `npm run check`.
- [ ] Commit with message `feat: import generated cue drafts for admin review`.

### Task 10: Upgrade Cue Analytics After the New Model Exists

**Files:**

- Modify: `src/audio/cue-analytics-core.ts`
- Modify: `src/audio/cue-analytics.test.ts`
- Modify: `src/components/CueAnalyticsPage.ts`

- [ ] Add tests proving structural pauses are labeled separately from suspicious pauses.
- [ ] Thread canonical token structure into analytics only after canonical reading model is stable.
- [ ] Replace generic "Long pause outlier" review labels with reasoned labels when structure is available.
- [ ] Keep backwards-compatible fallback labels for published cue files that do not have review artifacts.
- [ ] Run `npm test -- src/audio/cue-analytics.test.ts`.
- [ ] Run `npm run check`.
- [ ] Commit with message `feat: make cue analytics structure-aware`.

## Fixture Strategy

Create small deterministic fixtures before integrating real audio tooling. The first test fixtures should cover:

- Clean sequence with exact text matches.
- Long pause after sof pasuk.
- Long pause inside a phrase.
- Repeated token with recovery.
- Skipped token with recovery.
- Recording starts late.
- Non-monotonic generated timestamp.
- Low acoustic boundary at a short word.
- Manual correction that resolves a blocking finding.
- Tokenization version mismatch.

The fixtures should be small enough to review in source. They should not require real media files until the derivation adapter phase.

## Future Forced-Alignment Adapter

Do not choose the final alignment engine until the architecture above exists. When ready, add an adapter behind the evidence model:

```ts
export interface AlignmentEngine {
  readonly id: string
  align(input: AlignmentInput): Promise<AlignmentRun>
}
```

The first real adapter should be evaluated against the fixture suite and one known complete aliyah, such as `bereshit-1`, where published cues can serve as a baseline. Measure:

- Median absolute cue-start error.
- Percentage of tokens requiring review.
- Number of blocking findings.
- Number of false alarms at expected structural pauses.
- Number of missed internal phrase problems.

## Acceptance Criteria

The foundation is strong enough for production derivation when:

- Published playback still works from `CueExportPayload` without consuming derivation artifacts.
- Canonical token records can be produced and tested independently.
- Alignment evidence can represent ambiguity, skips, repeats, and confidence components.
- Review findings explain why a token needs attention.
- Structural pauses and suspicious pauses are distinguishable in tests.
- Manual corrections replay deterministically.
- Publication rejects unresolved blocking findings.
- Batch scripts never overwrite published cue JSON directly.
- `npm run check`, relevant Ava tests, and relevant Vitest tests pass.

## Explicit Non-Goals For The Foundation Phase

- Do not integrate a real ASR or forced-alignment provider yet.
- Do not publish generated cue files automatically.
- Do not rewrite playback, highlighting, or video rendering.
- Do not move the app off static hosting.
- Do not turn confidence into a single opaque score.
- Do not expand `src/index.ts` with derivation logic beyond a narrow review/import bridge.

## Execution Notes

Implement this plan in order. The early tasks intentionally create architecture and tests before any model integration. That sequencing is the difference between a durable cue derivation system and a pile of generated JSON that cannot explain itself.
