# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The website is the original product, and everything else works from it. The iPhone app wraps the website, adds features such as offline use, and follows iPhone conventions where people expect them. It also gives people a more convenient and faster connection to the app.

## Users

People preparing to read Torah in shul: Bar and Bat Mitzvah students (often with a parent), regular ba'alei kriah and gabbaim. They practice over days or weeks, on a phone or a computer, sometimes offline.

## Product Purpose

A tikkun for preparing a Torah reading: Torah text with and without nekudot, recordings with word-by-word highlighting, and practice tools. Over time it grows into a full toolkit for the other parts of preparing a Torah reading.

## Positioning

Highlighting synced to a Sefer Torah page layout. It is free and works in the browser and offline.

## Capabilities and Constraints

- The website is the source of truth for versions, recordings, the recording list and cue files; installed apps receive them through web updates (see `docs/adr/0006-website-decides-the-version.md` and `CONTEXT.md`).
- Native-only features (offline storage, printing, notifications) need an App Store update and must degrade gracefully on older App Store Versions.
- Terminology lives in `CONTEXT.md`.

## Evidence on Hand

Real Torah text (`text/`), recordings by Yoni Davidov (`audio/`) and their cue files (`audio-cues/`). No testimonials, user counts or press exist; do not invent them.

## Product Principles

- The reading comes first: the Torah text and its recording get the screen; everything else stays out of the way.
- The website decides; the apps follow it.
- Free, private and offline-capable.
- Every action has one clear, findable home.
