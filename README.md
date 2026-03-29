# tikkun.io

> The online tikkun you always wanted, but never had.

The mission is to **make better Torah readers** by providing the tools to maximize the reader's efficiency and preparedness. Your good, old-fashioned tikkunim are great, but in the end, they're static papers. With the dynamic nature of computer programs, we can make an even better tikkun.

The source text is pulled from the [Sefaria API](https://github.com/Sefaria/Sefaria-Project/wiki/API-Documentation), with some minor overrides as issues are found (such as פתוחה/סתומה discrepancies).

## Local workflow

This project is kept as a fully contained static site:

- application code lives in `src/`
- deployable static files and copied audio live in `static/`
- Vite is only used as a thin local dev/build step for TypeScript and static bundling

### Install

```sh
npm install
```

### Develop locally

```sh
npm run dev
```

### Build static output

```sh
npm run build
```

The build output in `dist/` is ready for static hosting.

### Sync audio library

Normal development and builds do not require access to any external audio folders.

Only run this when you want to refresh the Yoni Davidov source recordings on the machine that has the source library:

```sh
npm run audio:sync
```

That command copies supported source audio files such as `.m4a` and `.mp3` into `static/audio/yoni-davidov/` and regenerates `src/data/audio-manifest.generated.ts`.

The generated manifest is deterministic and grouped by parsha so diffs stay reviewable in git.

### Checks

```sh
npm run typecheck
npm run lint
```

## License

[MIT](LICENSE)
