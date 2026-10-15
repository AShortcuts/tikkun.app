# Route Reference

## Public Pages

These routes are prerendered as static HTML during `npm run build`.

```text
/
/readings/
/tidbits/
/tidbits/{slug}/
/about/
/privacy
/support
/reader/
```

Tidbit detail pages exist only for published entries in `src/lib/tidbits.ts`.

Privacy and Support use `trailingSlash = 'never'` and build to `privacy.html`
and `support.html`. Their canonical URLs are `/privacy` and `/support`.

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

These open a date-independent parsha for study. Aliyot come from Hebcal's full
parsha divisions, and previous/next navigation follows Torah order. Vezot
Haberacha has seven aliyot ending at Devarim 34:12; it does not include the
Simchat Torah readings from Beresheet or Bamidbar. References outside the named
parsha canonicalize to a plain Torah reference while preserving the verse.

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

Valid Esther page range: `1-16`.

## Specific Run Routes

```text
/reader/#/run/{date}:{service},{run-type}
/reader/#/run/{date}:{service},{run-type}/{book}-{chapter}-{verse}
```

These open the actual service for that date and calendar location, including
its additional Torah scrolls and special aliyah labels. Upcoming and Holiday
entries use this context; `#/next` selects the next dated service. Saving or
resuming a service preserves its date. Simchat Torah can therefore have a
different division from Vezot Haberacha in the parsha list, including an eighth
aliyah when Simchat Torah falls on Shabbat in Israel.

## Torah Reference Routes

```text
/reader/#/torah/{book}-{chapter}-{verse}
```

Opens a specific Torah verse, with books numbered 1 (Beresheet) through 5 (Devarim). For example, `/reader/#/torah/5-33-24` opens Devarim 33:24. Reference and page routes use the date-independent parsha divisions, matching parsha browsing.

Legacy `/reader/#/r/{book}-{chapter}-{verse}` links remain supported and canonicalize to `/reader/#/torah/{book}-{chapter}-{verse}` without adding a browser history entry. Picker and search links use the canonical route.

## Reader Tools

Cue Analytics remains an internal Reader tool.

```text
/reader/#/about/playback-analytics
/reader/#/about/word-analytics
/reader/#/about/cue-analytics
```

`#/about` redirects from Reader to the public `/about/` page.
