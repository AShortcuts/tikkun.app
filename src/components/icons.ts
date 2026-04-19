export type IconName =
  | 'play'
  | 'pause'
  | 'previous'
  | 'next'
  | 'replay'
  | 'download'
  | 'settings2'

// Icons are from https://lucide.dev/icons v1.0.
const iconPaths: Record<IconName, string> = {
  play: `
    <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" fill="currentColor" stroke="none" />
  `,
  pause: `
    <rect x="5.5" y="4.75" width="4" height="14.5" rx="1.6" fill="currentColor" stroke="none" />
    <rect x="14.5" y="4.75" width="4" height="14.5" rx="1.6" fill="currentColor" stroke="none" />
  `,
  previous: `
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  `,
  next: `
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  `,
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
}

export function iconMarkup(name: IconName) {
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${iconPaths[name]}</svg>`
}
