# Route Reference

## Public Pages

These routes are prerendered as static HTML during `npm run build`.

```text
/
/readings/
/tidbits/
/tidbits/{slug}/
/about/
/privacy/
/support/
/reader/
```

Tidbit detail pages exist only for published entries in `src/lib/tidbits.ts`.

## Reader Defaults

The Reader owns only the hash after `/reader/`.

```text
/reader/#/next
```

## Torah Parsha Routes

```text
/reader/#/torah/parsha/{parsha-slug}
/reader/#/torah/parsha/{parsha-slug}/{book}-{chapter}-{verse}
```

Examples:

```text
http://localhost:5176/reader/#/torah/parsha/noach
http://localhost:5176/reader/#/torah/parsha/noach/1-6-9
```

## Torah Page Routes

```text
/reader/#/torah/page/{page}
```

Valid page range: `1-245`.

## Megillat Esther Routes

```text
/reader/#/esther
/reader/#/esther/{megillah-slug-or-alias}
/reader/#/esther/{megillah-slug-or-alias}/{book}-{chapter}-{verse}
/reader/#/esther/page/{page}
```

Valid Esther page range: `1-17`.

## Specific Run Routes

```text
/reader/#/run/{date}:{service},{run-type}
/reader/#/run/{date}:{service},{run-type}/{book}-{chapter}-{verse}
```

## Torah Ref Route

```text
/reader/#/r/{book}-{chapter}-{verse}
```

## Reader Tools

Cue Analytics remains an internal Reader tool.

```text
/reader/#/about/playback-analytics
/reader/#/about/word-analytics
/reader/#/about/cue-analytics
```

`#/about` redirects from Reader to the public `/about/` page.
