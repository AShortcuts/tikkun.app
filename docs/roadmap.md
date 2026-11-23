# Roadmap

Planned and shelved work, collected 2026-11-02. Items are grouped by area, not ranked. Remove an item when it ships or is dropped.

## Reader features

- **Passage highlighting and share links:** a soft highlight over a chosen range, an option to dim everything outside it, and share links that encode the start and end verses. Proposed October 8; nothing built.
- **More megillot:** Ruth, Kohelet, Shir HaShirim and Eicha, using the flow layout in [eicha-flow-layout-guide.md](eicha-flow-layout-guide.md).
- **Bar Mitzvah family design:** English and Hebrew parsha names, numbered aliyah labels, a language toggle, finding the parsha by date, a Learn section and a `/bar-mitzvah` page. Mockups only (October 7).
- **Navigation and settings redesign:** direction A, the toolbar with a side panel, was preferred on September 30. Mockups only.
- **First-run introduction and What's New page:** a short introduction for first-time users, and a What's New page after big updates. The approach is still open. Both can ship as web updates, without an App Store update. The introduction is also a natural moment to offer notifications.
- **Notifications for new recordings and releases:** design still to finish; it ships in App Store v1.2. The low-infrastructure option for iPhone is background refresh plus local notifications that reuse the signed update feed. The website would need Web Push or a "new since your last visit" marker.
- **Android:** publish on Google Play once iPhone features are complete. Needs Android versions of the iOS-only native pieces and protection for downloaded recordings in the home-screen app.

## Recordings and cues

- **Nasso aliyah 4:** re-record the audio, then generate and review its cues.
- **Word starts after long held notes:** the aligner places some words too late (or early) after a held note. The "possible late start" flag catches some of them. A real fix would combine the loudness drop with pitch tracking, or learn from reviewed corrections.
- **Aligner decisions still open:** aligning passages shorter than an aliyah, following along live while someone reads, and accuracy for readers other than Yoni Davidov.

## App Store v1.2

- **On hold:** ship it together with notifications and a redesigned App Store product page header, so there's no need for another App Store update for a while.
- **What it adds:** on-phone storage for recordings and cues from the website, the print plugin and device info for analytics. Version 1.1 already handles their absence.
- **App Store page:** redesign the header artwork and redo the screenshots with the updated app-store-screenshots skill, since the current ones no longer match the app's design.
- **After it goes live:** set `latest` to `1.2` in `config/app-store.json`. Raise `minimum` only if a later release cannot run on 1.1 (see [ADR 0006](adr/0006-website-decides-the-version.md)).
- **Optional:** let 1.1 send analytics with browser device info instead of skipping the check-in.

## Known issues

- In the single-aliyah phone view, the highlight starts about 260 px above center and drifts down over the first lines. Adding space when Play starts was built and is turned off.
- In Safari, toggling nekudot shifts the focal word by about 45 px.
- Safari loses the text selection when going from Settings to Print.

## Checks still to run

- Safari print retests, and printing on a real printer.
- The iOS 26 shadow check.
- On an iPhone: the release setup, the browser focal center, keeping the screen awake during playback, a 1.1 phone installing the next web update, and the App Store Update Prompt's link.

## Size and speed

- Store the Torah text data more compactly (2.27 MB).
- Move the audio out of the repository; it is most of the build output.

## Code health

- `app/reader/reader-runtime.ts` is still about 4,200 lines. The remaining parts share live playback and display state, so split them only as part of redesigning those connections.

## Content and launch

- Review the draft wording of the privacy page (August 16).
- Decide whether to use the suggested App Store subtitle, "Listen as each word lights up."
