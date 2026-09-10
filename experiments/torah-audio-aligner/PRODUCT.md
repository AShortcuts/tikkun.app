# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The Tikkun maintainer testing an explicitly private Torah Audio Aligner beta.

## Product Purpose

Listen to real Torah recordings alongside proposed word timings, correct the
performance, and retain reviewable drafts before any public integration.

## Operating Context

The user delegated implementation decisions and approved private development.
The existing engine and recordings are local. Existing cues are approximate
comparison references, not acoustic truth. No new interview or public code
change is part of this milestone.

## Capabilities and Constraints

- Preserve canonical Hebrew, niqqud, taamim, qere and stable token identities.
- Keep original audio and proposals immutable; save corrections as revisions.
- Distinguish timing review from pronunciation or cantillation correctness.
- Export starts by default. Acoustic end estimates require separate review.
- Repeated or missing words must not silently become a linear public cue file.
- Public integration, new-reader accuracy and live following remain unverified.
- Queue up to 25 selections at a time from the local recording library or mapped MP3/M4A uploads.
- Run one alignment at a time with explicit start, pause after current, retry, and saved queue recovery.
- Reuse existing results by default, preserving previous user reviews.
- Replay and review one pasuk, jump to unreviewed words or reading flags, and download reviewed cue files together.
- Uploads must match a complete aliyah available in the picker, be at most 100 MB, and be no longer than 15 minutes.

## Evidence on Hand

The initial experiment contains 44 cued recordings and one uncued demonstration,
completed model proposals, graph diagnostics, and waveform caches. The current
private batch library exposes 70 locally available recordings. Two additional
Behalotecha recordings exercised the batch and upload paths during QA; their
automated review edits are isolated from the user's workspace.

## Product Principles

- Listen before accepting.
- Show uncertainty where the decision happens.
- Keep private corrections reversible and attributable.
- Use real project data and existing Tikkun typography.

## Open Decisions

Arbitrary passage selection outside the available aliyot, microphone capture,
live following, and accuracy on new readers or traditions remain subsequent
work. The original review service and new batch service keep separate saved
review histories after the initial copy into the batch workspace.
