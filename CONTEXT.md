# Tikkun

Tikkun is a browser-first reading app for preparing Torah readings with a scroll-like reader, audio, highlighting, and local reader state.

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
The active reader route and display lifetime that owns asynchronous reader work and invalidates work from older routes.
_Avoid_: Global reader state, page component

**Playback Timeline**:
The logical clock a reader sees while one or more physical recordings supply an aliyah.
_Avoid_: Audio duration, stitched duration

**Cue Data**:
Validated word timing and token-position data loaded from a published cue file.
_Avoid_: Raw cue JSON

**Cue Draft**:
Validated local authoring state for Cue Data that has not yet been published.
_Avoid_: Published cues, raw localStorage data
