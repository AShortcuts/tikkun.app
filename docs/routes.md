# Route Reference

This document lists the supported hash routes for the reader app.

## Reader Defaults

Open the app or jump to the next eligible reading.

```text
/
#/next
```

Examples:

```text
http://localhost:5173/
http://localhost:5173/#/next
```

## Torah Parsha Routes

Open a Torah parsha, optionally anchored to a specific Torah reference.

```text
#/torah/parsha/{parsha-slug}
#/torah/parsha/{parsha-slug}/{book}-{chapter}-{verse}
```

Examples:

```text
http://localhost:5173/#/torah/parsha/noach
http://localhost:5173/#/torah/parsha/noach/1-6-9
http://localhost:5173/#/torah/parsha/beresheet
http://localhost:5173/#/torah/parsha/bereshit
http://localhost:5173/#/torah/parsha/vezos-haberacha/5-33-1
```

## Torah Page Routes

Open a physical Torah page directly.

```text
#/torah/page/{page}
```

Valid page range: `1-245`.

Examples:

```text
http://localhost:5173/#/torah/page/1
http://localhost:5173/#/torah/page/12
http://localhost:5173/#/torah/page/245
```

## Megillat Esther Routes

Open Megillat Esther, optionally anchored to a specific reference.

```text
#/esther
#/esther/{megillah-slug-or-alias}
#/esther/{megillah-slug-or-alias}/{book}-{chapter}-{verse}
```

Examples:

```text
http://localhost:5173/#/esther
http://localhost:5173/#/esther/megillah-esther
http://localhost:5173/#/esther/esther
http://localhost:5173/#/esther/megillat-esther
http://localhost:5173/#/esther/megillah-esther/1-1-1
```

## Esther Page Routes

Open a physical Esther page directly.

```text
#/esther/page/{page}
```

Valid page range: `1-17`.

Examples:

```text
http://localhost:5173/#/esther/page/1
http://localhost:5173/#/esther/page/3
http://localhost:5173/#/esther/page/17
```

## Specific Run Routes

Open a dated leining run. These are used for holidays, chagim, and exact generated readings.

```text
#/run/{date}:{service},{run-type}
#/run/{date}:{service},{run-type}/{book}-{chapter}-{verse}
```

Examples:

```text
http://localhost:5173/#/run/2026-07-23:shacharis,main
http://localhost:5173/#/run/2026-07-23:shacharis,main/1-4-1
http://localhost:5173/#/run/2025-03-14:megillah,megillah
```

## Legacy Torah Ref Route

Open a direct Torah reference.

```text
#/r/{book}-{chapter}-{verse}
```

Examples:

```text
http://localhost:5173/#/r/1-6-9
http://localhost:5173/#/r/4-13-1
```

## About And Tools

Open informational and tool pages.

```text
#/about
#/about/playback-analytics
#/about/word-analytics
#/about/cue-analytics
```

Examples:

```text
http://localhost:5173/#/about
http://localhost:5173/#/about/playback-analytics
http://localhost:5173/#/about/word-analytics
http://localhost:5173/#/about/cue-analytics
```
