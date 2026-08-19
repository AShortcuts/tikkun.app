export type IconName =
  | 'play'
  | 'pause'
  | 'previous'
  | 'next'
  | 'replay'
  | 'download'
  | 'settings2'
  | 'cog'
  | 'bookText'
  | 'expand'
  | 'minimize2'
  | 'chevronDown'
  | 'chevronUp'
  | 'chevronLeft'
  | 'arrowLeft'
  | 'arrowRight'
  | 'circleEllipsis'
  | 'skipBack'
  | 'skipForward'
  | 'rewind10'
  | 'forward10'
  | 'speakerHigh'
  | 'gauge'
  | 'grip'
  | 'x'
  | 'circleAlert'
  | 'bookmark'
  | 'bookmarkFilled'
  | 'houseFilled'
  | 'link'
  | 'check'
  | 'playOutline'
  | 'undo'
  | 'triangleAlert'
  | 'reset'
  | 'externalLink'
  | 'circleX'
  | 'fileDown'
  | 'audioLines'
  | 'search'

// Icons are from https://lucide.dev/icons v1.0.
// Keep every horizontal arrow alias on the shared full-stem geometry.
const arrowRightPaths = `
  <path d="M5 12h14" />
  <path d="m12 5 7 7-7 7" />
`
const arrowLeftPaths = `
  <path d="M19 12H5" />
  <path d="m12 19-7-7 7-7" />
`

const iconPaths: Record<IconName, string> = {
  play: `
    <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" fill="currentColor" stroke="none" />
  `,
  pause: `
    <rect x="6.5" y="4" width="4.25" height="16" rx="1.1" fill="currentColor" stroke="none" />
    <rect x="13.25" y="4" width="4.25" height="16" rx="1.1" fill="currentColor" stroke="none" />
  `,
  previous: arrowRightPaths,
  next: arrowLeftPaths,
  replay: `
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  `,
  download: `
    <path d="M12 17V3" />
    <path d="m6 11 6 6 6-6" />
    <path d="M19 21H5" />
  `,
  settings2: `
    <path d="M14 17H5" />
    <path d="M19 7h-9" />
    <circle cx="17" cy="17" r="3" />
    <circle cx="7" cy="7" r="3" />
  `,
  cog: `
    <path d="M11 10.27 7 3.34" />
    <path d="m11 13.73-4 6.93" />
    <path d="M12 22v-2" />
    <path d="M12 2v2" />
    <path d="M14 12h8" />
    <path d="m17 20.66-1-1.73" />
    <path d="m17 3.34-1 1.73" />
    <path d="M2 12h2" />
    <path d="m20.66 17-1.73-1" />
    <path d="m20.66 7-1.73 1" />
    <path d="m3.34 17 1.73-1" />
    <path d="m3.34 7 1.73 1" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="12" r="8" />
  `,
  bookText: `
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
    <path d="M8 11h8" />
    <path d="M8 7h6" />
  `,
  expand: `
    <path d="M3 3h7" />
    <path d="M3 3v7" />
    <path d="M21 21h-7" />
    <path d="M21 21v-7" />
    <path d="m3 3 7 7" />
    <path d="m21 21-7-7" />
  `,
  minimize2: `
    <path d="m14 10 7-7" />
    <path d="M20 10h-6V4" />
    <path d="m3 21 7-7" />
    <path d="M4 14h6v6" />
  `,
  chevronDown: `
    <path d="m6 9 6 6 6-6" />
  `,
  chevronUp: `
    <path d="m18 15-6-6-6 6" />
  `,
  chevronLeft: arrowLeftPaths,
  arrowLeft: arrowLeftPaths,
  arrowRight: arrowRightPaths,
  circleEllipsis: `
    <circle cx="12" cy="12" r="10" />
    <path d="M17 12h.01" />
    <path d="M12 12h.01" />
    <path d="M7 12h.01" />
  `,
  skipBack: `
    <path d="M19 20 9 12l10-8v16Z" />
    <path d="M5 19V5" />
  `,
  skipForward: `
    <path d="m5 4 10 8-10 8V4Z" />
    <path d="M19 5v14" />
  `,
  rewind10: `
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <text x="12.25" y="14.75" text-anchor="middle" font-size="6.5" font-weight="700" fill="currentColor" stroke="none">10</text>
  `,
  forward10: `
    <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <text x="11.75" y="14.75" text-anchor="middle" font-size="6.5" font-weight="700" fill="currentColor" stroke="none">10</text>
  `,
  speakerHigh: `
    <path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  `,
  gauge: `
    <path d="M20.38 8.57a9 9 0 1 0 1.12 5.43" />
    <path d="m16 12 4-4" />
    <path d="M12 14h.01" />
  `,
  grip: `
    <circle cx="9" cy="7" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="7" r="1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="17" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="17" r="1" fill="currentColor" stroke="none" />
  `,
  x: `
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  `,
  circleAlert: `
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  `,
  bookmark: `
    <path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z" />
  `,
  bookmarkFilled: `
    <path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z" fill="currentColor" stroke="none" />
  `,
  houseFilled: `
    <path d="M4.5 10.25 12 3.75l7.5 6.5V20a1 1 0 0 1-1 1h-4v-5.5a2.5 2.5 0 0 0-5 0V21h-4a1 1 0 0 1-1-1Z" fill="currentColor" stroke="none" />
  `,
  link: `
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  `,
  check: `
    <path d="M20 6 9 17l-5-5" />
  `,
  playOutline: `
    <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
  `,
  undo: `
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
  `,
  triangleAlert: `
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  `,
  reset: `
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <path d="M16 16h5v5" />
  `,
  externalLink: `
    <path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" />
    <path d="m21 3-9 9" />
    <path d="M15 3h6v6" />
  `,
  circleX: `
    <circle cx="12" cy="12" r="10" />
    <path d="m15 9-6 6" />
    <path d="m9 9 6 6" />
  `,
  fileDown: `
    <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
    <path d="M14 2v5a1 1 0 0 0 1 1h5" />
    <path d="M12 18v-6" />
    <path d="m9 15 3 3 3-3" />
  `,
  audioLines: `
    <path d="M2 10v3" />
    <path d="M6 6v11" />
    <path d="M10 3v18" />
    <path d="M14 8v7" />
    <path d="M18 5v13" />
    <path d="M22 10v3" />
  `,
  search: `
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  `,
}

export function iconMarkup(name: IconName) {
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${iconPaths[name]}</svg>`
}
