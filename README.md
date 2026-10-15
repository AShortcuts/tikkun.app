# Tikkun Reader

A digital tikkun for preparing Torah readings, bringing Hebrew text, recordings, and synchronized word highlighting into one place. Built on Akiva Gordon's original [tikkun.io](https://tikkun.io/).

[Open the reader](https://tikkunreader.com/reader/) · [Recording coverage](https://tikkunreader.com/readings/) · [Report an issue](https://github.com/AShortcuts/tikkun.app/issues)

## Goals

Make Torah preparation clear, accessible, and focused: preserve the familiar tikkun experience, connect listening with the written text, and support regular practice on desktop, mobile, and offline. Keep the project open to corrections and contributions.

## Key features

- **Flexible tikkun views:** Show text with or without vowels and cantillation, or compare both side by side. Choose a natural Reading layout or Match mode, which preserves Torah line breaks.
- **Audio that follows the text:** Aliyah recordings with synchronized word highlighting, automatic scrolling, adjustable playback speed, and word navigation where timing data is available.
- **Find the right reading:** Weekly parshiot, holidays, aliyot, and Megillat Esther; Israel and Diaspora calendars; Hebrew and English search; direct verse links.
- **Practice your way:** Bookmarks, resume your last reading, adjustable text size, and light, dark, sepia, and custom themes.
- **Offline study:** Download Torah text and available recordings for offline use, with controls to manage saved media and storage.
- **Print and share:** Share reading links or prepare selected aliyot and verse ranges in a print preview using the reader's layouts.

The repository also includes an iOS companion with native audio playback, lock-screen controls, downloads, widgets, and Shortcuts. See [iOS development](docs/native-development.md) for setup and validation status.

Audio and word timing are being added progressively. The [coverage page](https://tikkunreader.com/readings/) shows which readings have recordings and completed timing.

## Roadmap

- Expand recording coverage and review word timing across more parshiot and special readings.
- Refine the experimental audio aligner and establish an explicit human review step before publishing new timing data.
- Make cue editing and contributions easier with clearer documentation and review workflows.
- Complete iPhone and iPad acceptance checks for offline playback, system integrations, and updates before wider native releases.

## Develop locally

Use Node.js **22.23.2** (see [`.nvmrc`](.nvmrc)) and npm **11.19.0**.

```sh
npm ci
npm run dev
```

Open [localhost:5176](http://localhost:5176). Run `npm run check` for types and lint, `npm test` for Node tests, and `npm run build` to generate the static site in `dist/`. `npm run verify` runs the full local verification suite.

| Guide | Covers |
| --- | --- |
| [Development and publishing](docs/development.md) | Local workflow, audio imports, video exports, and checks |
| [Architecture](docs/architecture.md) | Project structure and design decisions |
| [Native development](docs/native-development.md) | iOS builds and device validation |
| [Release checklist](docs/release-checklist.md) | Web and native release requirements |

Bug reports, text corrections, and timing feedback are welcome through [GitHub issues](https://github.com/AShortcuts/tikkun.app/issues). Include the reading or verse, what happened, and your browser or device.

## Credits and attribution

- **Original project:** [tikkun.io](https://tikkun.io/) by **Akiva Gordon** and its contributors provides the foundation for this project. [Original GitHub repository](https://github.com/akivajgordon/tikkun.io).
- **Hebrew text:** [Miqra According to the Masorah (MAM)](https://en.wikisource.org/wiki/User:Dovi/Miqra_according_to_the_Masorah), created and maintained by Hebrew Wikisource's editors and contributors, and obtained through [Sefaria](https://www.sefaria.org/). MAM is licensed under [CC BY-SA](https://creativecommons.org/licenses/by-sa/4.0/). The project includes local corrections, including paragraph-break adjustments. This credits the underlying edition as requested in [the upstream attribution discussion](https://github.com/akivajgordon/tikkun.io/issues/146).
- **Calendar and reading schedules:** [Hebcal](https://www.hebcal.com/home/developer-apis), including its Hebrew calendar and Torah-reading libraries.
- **Recordings:** **Yonah (Yoni) Davidov**, whose aliyah recordings are used with permission.
- **Typography:** Lora by Cyreal's Olga Karpushina and Alexei Vanyashin; Noto Sans Hebrew by the Noto Project authors; and Shlomo semiStam, whose embedded credits include SIL International, Ralph Hancock, and John Hudson.
- **Open-source foundations:** The maintainers and contributors behind Svelte, SvelteKit, Capacitor, and the other libraries used throughout the project.

## License

The project's own code is available under the [MIT License](LICENSE). Third-party text, recordings, fonts, and dependencies retain their respective licenses and permissions.
