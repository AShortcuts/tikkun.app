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
The replaceable lexical browser lifetime in `app/reader/reader-runtime.ts` that owns the active reader display, controllers, tools, listeners, and scheduled work. The application bootstrap only starts it and retains its destroy Interface.
_Avoid_: Global reader state, page component

**Reader Shell**:
The Svelte-rendered, long-lived presentation frame around the reader. It presents the title, progress, reader-versus-optional-page visibility, Parsha Picker visibility, annotations, and stable mount targets while Reader Route coordinates those states and Reader Runtime owns reader behavior.
_Avoid_: Reader Runtime, page renderer, global reader state

**Reader Route**:
The TypeScript Module that owns the browser route lifetime: hash listening and navigation, canonical reader hashes, reader-versus-optional-page switching, visible title state, Optional Feature cancellation, and the first-use Parsha Picker lifecycle. Reader Runtime remains responsible for rendering pages, playback, highlighting, and reader tools.
_Avoid_: Framework router, Reader Shell, page renderer

**Reader Viewport**:
The compact or wide presentation mode selected from the available reader width. It describes layout capacity, not the device or packaging environment.
_Avoid_: Mobile device, desktop device, Capacitor mode

**Platform Capability**:
A browser or native service that is actually available in the current runtime, such as filesystem access or a registered Capacitor plugin. It does not select responsive layout.
_Avoid_: Mobile layout, compact viewport

**Aliyah Navigation**:
The Svelte-rendered reader feature for identifying, selecting, and playing an aliyah. One Module owns the toolbar capsule, compact sheet, segments, and wide rail behind a small TypeScript Interface; Reader Runtime still owns routing, scrolling, playback, recording lookup, and Cue Data.
_Avoid_: Mobile aliyah logic, desktop aliyah state

**Playback Timeline**:
The logical clock a reader sees while one or more physical recordings supply an aliyah.
_Avoid_: Audio duration, stitched duration

**Recording Session**:
The reader feature that owns narrator-aware recording lookup, Cue Data and token loading, playback-plan installation, and safe transitions into and out of authoring.
_Avoid_: Audio element, page renderer

**Reader Playback**:
The TypeScript Module that owns the active Audio Controller, Highlight Controller, Recording Session, and Playback Timeline lifetimes and their cross-wiring. Reader Runtime supplies page, network, preference, Cue Authoring, and presentation Adapters.
_Avoid_: Playback Timeline, Audio Controller, global playback state

**Reader Settings**:
The first-use Svelte dialog that presents preferences and owns its form, focus, and browser lifetime behind a small TypeScript mount interface. Its launcher remains ready before the dialog code loads. Reader Runtime still owns the canonical preference state and cross-feature effects.
_Avoid_: Toolbar state, global settings

**Reader Controls**:
The Svelte-rendered wide reader buttons and compact overflow menu that present the same reader state and actions behind a small TypeScript mount interface.
_Avoid_: Mobile toolbar logic, desktop toolbar state

**Command Palette**:
The first-use Svelte navigation overlay that owns its query, result selection, focus, and dismissal while receiving the available actions from a narrow TypeScript mount bridge.
_Avoid_: Global search state, route controller

**Parsha Picker**:
The Svelte-rendered reading selection page for search, Torah references, upcoming readings, holidays, and aliyah choices. Calendar and routing rules are prepared by its TypeScript model.
_Avoid_: Calendar model, page renderer

**Floating Player**:
The Svelte-rendered audio control surface mounted behind one connected Interface. It owns markup, visual state, controls, focus, and pointer mechanics while Playback Timeline owns audio commands, timing, cue progress, highlighting, seeking policy, and responsive policy.
_Avoid_: Playback Timeline, audio controller

**Cue Data**:
Validated word timing and token-position data loaded from a published cue file.
_Avoid_: Raw cue JSON

**Cue Draft**:
Validated local authoring state for Cue Data that has not yet been published.
_Avoid_: Published cues, raw localStorage data

**Cue Authoring**:
The local workflow for recording, reviewing, adjusting, and exporting Cue Data for one recording.
_Avoid_: Admin state, reader playback logic

**Cue Authoring Panel**:
The Svelte-rendered Cue Authoring surface for recording controls, draft and status presentation, progress, and the stable targets used by the Cue List and waveform. Cue Authoring owns workflow rules and sends it typed snapshots and semantic actions.
_Avoid_: Cue Authoring workflow, Cue List, waveform renderer

**Cue Export Sheet**:
The Svelte-rendered review and download surface for one prepared Cue Data export. Cue Authoring owns payload generation, object URLs, clipboard rules, and error handling.
_Avoid_: Cue Authoring Panel, Cue Data generation, published cue file

**Cue List**:
The Svelte-rendered Cue Authoring view of saved word timings. It owns refinement controls, row markup, disabled, selected, and current presentation, focus, and list following while Cue Authoring owns action rules, timing edits, playback, highlighting, and persistence.
_Avoid_: Cue Data, Cue Draft, Playback Timeline

**Cue Waveform**:
The focused TypeScript Module that owns Cue Authoring's waveform summary loading, visible time window, bars, cue and issue markers, playhead, lane seeking, retry state, and browser lifetime. Cue Authoring supplies the current session snapshot and keeps timing workflow rules.
_Avoid_: Cue Authoring workflow, Playback Timeline, audio controller

**Optional Feature**:
A route or tool that is not needed for the core reader and is loaded only when requested, such as About, Cue Analytics, or Cue Authoring.
_Avoid_: Reader Settings, Command Palette, Parsha Picker, deferred data
