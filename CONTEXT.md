# Tikkun

Tikkun is a browser-first reading app for preparing Torah readings with a page-based reader, audio, highlighting, and local reader state.

## Language

**Bookmark**:
A user-saved return point in the reader.
_Avoid_: Saved reading

**Last Reading**:
The recent reader location offered as a quiet resume suggestion when the app opens to the calendar default.
_Avoid_: Bookmark, saved reading

**Offline Download**:
A user-requested local copy of recording media for offline playback.
_Avoid_: Silent cache, automatic download

**Batch Offline Download**:
A user-requested set of Offline Downloads started together.
_Avoid_: Automatic sync

**Startup Splash**:
The brief branded transition shown only while the app shell hydrates and the first reader route renders.
_Avoid_: Loading screen

**Reader Runtime**:
The replaceable browser lifetime that owns the active reader display, controllers, tools, listeners, and scheduled work.
_Avoid_: Global reader state, page component

**Reader Viewport**:
The compact or wide presentation mode selected from the available reader width. It describes layout capacity, not the device or packaging environment.
_Avoid_: Mobile device, desktop device, Capacitor mode

**Platform Capability**:
A browser or native service that is actually available in the current runtime, such as filesystem access or a registered Capacitor plugin. It does not select responsive layout.
_Avoid_: Mobile layout, compact viewport

**Aliyah Navigation**:
The shared reader feature for identifying, selecting, and playing an aliyah. Its compact picker and wide rail are presentation adapters over the same navigation state and actions.
_Avoid_: Mobile aliyah logic, desktop aliyah state

**Playback Timeline**:
The logical clock a reader sees while one or more physical recordings supply an aliyah.
_Avoid_: Audio duration, stitched duration

**Recording Session**:
The reader feature that owns narrator-aware recording lookup, Cue Data and token loading, playback-plan installation, and safe transitions into and out of authoring.
_Avoid_: Audio element, page renderer

**Reader Settings**:
The Svelte-rendered reader dialog that presents preferences and owns its form, focus, and browser lifetime behind a small TypeScript mount interface. Reader Runtime still owns the canonical preference state and cross-feature effects.
_Avoid_: Toolbar state, global settings

**Reader Controls**:
The Svelte-rendered wide reader buttons and compact overflow menu that present the same reader state and actions behind a small TypeScript mount interface.
_Avoid_: Mobile toolbar logic, desktop toolbar state

**Cue Data**:
Validated word timing and token-position data loaded from a published cue file.
_Avoid_: Raw cue JSON

**Cue Draft**:
Validated local authoring state for Cue Data that has not yet been published.
_Avoid_: Published cues, raw localStorage data

**Cue Authoring**:
The local workflow for recording, reviewing, adjusting, and exporting Cue Data for one recording.
_Avoid_: Admin state, reader playback logic

**Optional Feature**:
A route or tool that is not needed for the core reader and is loaded only when requested, such as About, Cue Analytics, or Cue Authoring.
_Avoid_: Core reader module, deferred data
