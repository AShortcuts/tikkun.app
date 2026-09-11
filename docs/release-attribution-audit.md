# Release Attribution Audit

Inspected: 2026-09-10. This is an evidence inventory, not legal clearance or a
conclusion that App Store distribution is permitted or prohibited.

## What The Rights Gate Means

This is not a claim that the app or its recordings are unauthorized. Missing
permission evidence and a known license obligation are different issues:

- **Calendar code:** installed `@hebcal/core` and `@hebcal/hdate` declare GPL-2.0.
  GPL distribution can require corresponding source, license notices and GPL
  terms for covered combined works; it also prohibits additional restrictions.
  Assess the actual combined app and store distribution terms before releasing.
  An MIT notice or a public repository alone is not a complete compliance check.
  The license permits charging; this is not inherently a license-fee issue.
- **Recordings:** owner confirmed on 2026-09-10 that current recordings are by
  Yoni Davidov and approved for use in this app, in the context of native
  distribution and offline downloads. Permission is recorded as owner-supplied;
  no separate agreement was inspected.
- **Text and fonts:** owner confirmed they are free to use and asked to skip
  additional attribution work. No optional text/font credits are being added in
  this pass. Existing notices remain intact; this does not waive any applicable
  license requirements.

Verified references: [GPL-2.0 text, sections 1-3 and 6](https://opensource.org/license/gpl-2.0),
[Hebcal's licensing description](https://www.hebcal.com/home/developer-apis), and
[Apple review guidelines 5.2-5.2.3](https://developer.apple.com/app-store/review/guidelines/#intellectual-property).
These identify the review questions; they do not establish a categorical App Store
ban or legal clearance for this particular build. Qualified licensing review is
appropriate for the GPL/store compatibility question.

## Release Decision Required

The repository's root license is MIT, copyright 2015 Akiva Gordon. Its runtime
dependencies do not all use MIT. Do not represent the entire distributed app as
MIT-only or treat an attribution notice as resolving all redistribution terms.

| Installed package | Version | Declared license |
| --- | --- | --- |
| @hebcal/core | 5.8.2 | GPL-2.0 |
| @hebcal/hdate | 0.12.0 | GPL-2.0 |
| @hebcal/leyning | 9.0.2 | BSD-2-Clause |
| @hebcal/noaa | 0.8.14 | LGPL-3.0 |
| fuse.js | 7.5.0 | Apache-2.0 |
| normalize.css | 8.0.1 | MIT |
| @capacitor/core and @capacitor/ios | 8.5.1 | MIT |
| svelte | 5.56.9 | MIT |
| @sveltejs/kit | 2.70.3 | MIT |

Evidence: installed `node_modules/<package>/package.json`, each package's license
file, and matching `package-lock.json` entries. Runtime calendar imports appear in
`app/calendar-model/generator.ts`. HDate and sedra diagnostic strings survive in
the native JavaScript output, confirming those implementations are packaged.
An installed package is not by itself proof that every part is shipped: NOAA's
runtime inclusion needs separate confirmation. Its package metadata says LGPL-3.0,
but the installed LICENSE file starts with LGPL 2.1; resolve this discrepancy if
that code is distributed.

Upstream also identifies Hebcal core as GPL:
[Hebcal developer APIs](https://www.hebcal.com/home/developer-apis) and
[upstream package metadata](https://github.com/hebcal/hebcal-es6/blob/main/package.json).
Current upstream versions are not a substitute for reviewing the pinned artifacts.

Before store distribution, obtain qualified review or applicable permission for
the pinned runtime and distribution terms. Do not automatically relicense the
app, replace its calendar engine, or assume an alternate license is available.
No such permission or review has been supplied in this task.

## Content And Fonts

- Torah text: README attributes Sefaria's MAM text to Hebrew Wikisource and states
  CC-BY-SA. Local overrides are acknowledged there. The page JSON inspected has
  no license/version metadata; establish the applicable source version and terms.
- Recordings: About credits Yoni Davidov and now states use with permission,
  based on the owner's 2026-09-10 confirmation.
- `Lora-Regular.ttf`: embedded metadata credits Cyreal, Olga Karpushina and Alexei
  Vanyashin, declares OFL 1.1, and identifies reserved font name Lora.
- `ShlomosemiStam.ttf`: embedded metadata identifies Ezra SIL SR 2007, credits SIL
  International and Ralph Hancock/John Hudson, and contains OFL and MIT/X11 terms.
  Metadata contains both OFL 1.0 and 1.1 references plus reserved names SIL/Ezra;
  confirm the provenance and modification history of this renamed file.
- `NotoSansHebrew-Variable.ttf`: present in the package; license metadata was not
  established by the bounded inspection. Do not infer terms solely from its name.

## Notice Packaging Still Required

The current About page links the source, credits Hebcal for calendar calculations,
and distinguishes the project's own MIT code from dependency licenses. It does not display
full software/font notices or MAM attribution. The current native output has no
standalone LICENSE or NOTICE artifact. Once terms are resolved, include the root
MIT notice, applicable dependency notices/source obligations, font notices and
text attribution in the shipped app. Keep them readable offline. Review actual
bundle contents, not only the development dependency tree.

This gate applies alongside the [release checklist](ios-release-checklist.md).
No dependency relicensing or publication was performed. Optional text/font
attribution work is deferred at the owner's request.
