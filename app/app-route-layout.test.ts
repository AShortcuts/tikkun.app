import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const bootstrapSource = readFileSync(
  new URL('./index.ts', import.meta.url),
  'utf8'
)
const indexSource = readFileSync(
  new URL('./reader/reader-runtime.ts', import.meta.url),
  'utf8'
)
const readerShellSource = readFileSync(
  new URL('./reader/ReaderShell.svelte', import.meta.url),
  'utf8'
)
const readerRouteSource = readFileSync(
  new URL('./reader/reader-route.ts', import.meta.url),
  'utf8'
)
const readerPlaybackSource = readFileSync(
  new URL('./reading/reader-playback.ts', import.meta.url),
  'utf8'
)
const cueAuthoringSource = readFileSync(
  new URL('./admin/cue-authoring.ts', import.meta.url),
  'utf8'
)
const cueWaveformSource = readFileSync(
  new URL('./admin/cue-waveform.ts', import.meta.url),
  'utf8'
)
const cueAuthoringIssueDialogSource = readFileSync(
  new URL('./admin/CueAuthoringIssueDialog.svelte', import.meta.url),
  'utf8'
)
const cueAuthoringAccessDialogSource = readFileSync(
  new URL('./admin/CueAuthoringAccessDialog.svelte', import.meta.url),
  'utf8'
)
const cueAuthoringCueListSource = readFileSync(
  new URL('./admin/CueAuthoringCueList.svelte', import.meta.url),
  'utf8'
)
const cueAuthoringPanelSource = readFileSync(
  new URL('./admin/CueAuthoringPanel.svelte', import.meta.url),
  'utf8'
)
const cueAuthoringExportSheetSource = readFileSync(
  new URL('./admin/CueAuthoringExportSheet.svelte', import.meta.url),
  'utf8'
)
const readerPageSource = readFileSync(
  new URL('../src/routes/reader/+page.svelte', import.meta.url),
  'utf8'
)
const readerAppSource = readFileSync(
  new URL('../src/lib/components/ReaderApp.svelte', import.meta.url),
  'utf8'
)
const serviceWorkerUpdateSource = readFileSync(
  new URL('../src/lib/components/ServiceWorkerUpdate.svelte', import.meta.url),
  'utf8'
)

test('keeps application bootstrap separate from the Reader Runtime Module', () => {
  expect(bootstrapSource).toContain('startReaderRuntime({')
  expect(bootstrapSource).toContain("getBrowserStorage('local')")
  expect(bootstrapSource).toContain('getRecordingModeConfig(')
  expect(bootstrapSource).toContain('export function stopApp()')
  expect(bootstrapSource).not.toContain('createReaderShell(')
  expect(bootstrapSource.split('\n').length).toBeLessThan(45)
  expect(indexSource).toContain('export function startReaderRuntime(')
  expect(indexSource).toContain('const destroy = mountReaderRuntime((scope) => {')
  expect(indexSource).not.toContain("document.addEventListener('DOMContentLoaded'")
})

test('delegates reader shell presentation without replacing reader roots', () => {
  expect(indexSource).toMatch(
    /mountReaderRuntime\(\(scope\) => \{[\s\S]*?createReaderShell\(scope,[\s\S]*?const book = getBook\(\)/
  )
  expect(indexSource).not.toContain('const setVisibility =')
  expect(indexSource).not.toContain('syncReaderProgressVisibility')
  expect(indexSource).not.toContain('syncReaderSideNavigationVisibility')
  expect(indexSource).not.toContain('titleEl.textContent')
  expect(readerShellSource).toContain('class:u-hidden={view !==')
  expect(readerShellSource).toContain('class:mod-annotations-on={annotationsEnabled}')
  expect(readerShellSource).toContain('data-target-id="tikkun-book"')
  expect(readerShellSource).toContain('data-target-id="aliyah-toolbar-root"')
  expect(readerShellSource).toContain(
    'data-target-id="aliyah-navigation-layer-root"'
  )
})

test('delegates aliyah presentation to one Svelte navigation module', () => {
  expect(indexSource).toContain('createAliyahNavigation(scope, {')
  expect(indexSource).toContain(
    'function mountAliyahNavigation(scope: MountScope)'
  )
  expect(indexSource).toContain('mountAliyahNavigation(scope)')
  expect(indexSource).not.toContain(
    'mountAliyahNavigation(scope, audioController, highlightController)'
  )
  expect(indexSource).not.toContain('createDesktopAliyahRail')
  expect(indexSource).not.toContain('createMobileAliyahPicker')
  expect(indexSource).not.toContain(
    'querySelector(\'[data-target-id="aliyah-rail"]\')'
  )
  expect(readerShellSource).not.toContain('data-target-id="aliyah-rail"')
  expect(readerShellSource).not.toContain(
    'data-target-id="mobile-aliyah-picker"'
  )
})

test('delegates browser route and Parsha Picker ownership to Reader Route', () => {
  expect(indexSource).toContain('createReaderRoute(scope, {')
  expect(indexSource).not.toContain('function renderRoute(')
  expect(indexSource).not.toContain('function navigateToHash(')
  expect(indexSource).not.toContain('activeParshaPicker')
  expect(indexSource).not.toContain('optionalRouteAbortController')
  expect(readerRouteSource).toContain("const DEFAULT_READER_HASH = '#/next'")
  expect(readerRouteSource).toContain('canonicalReaderUrl(')
  expect(readerRouteSource).toContain('const openPicker = (')
  expect(readerShellSource).toContain('onclick={onAboutClick}')
})

test('delegates playback implementation ownership to Reader Playback', () => {
  expect(indexSource).toContain('createReaderPlayback(scope, {')
  expect(indexSource).not.toContain('new AudioController(')
  expect(indexSource).not.toContain('new HighlightController(')
  expect(indexSource).not.toContain('createRecordingSession({')
  expect(indexSource).not.toContain('createPlaybackTimeline(scope, {')
  expect(readerPlaybackSource).toContain('new AudioController(')
  expect(readerPlaybackSource).toContain('new HighlightController(')
  expect(readerPlaybackSource).toContain('createRecordingSession({')
  expect(readerPlaybackSource).toContain('createPlaybackTimeline(scope, {')
})

test('revalidates local cue status when the active playback session changes', () => {
  expect(indexSource).toMatch(
    /change\.type === 'session-loaded'[\s\S]*?invalidateAliyahCueStatuses\(\)[\s\S]*?syncAliyahNavigationContent\(\)/
  )
  expect(indexSource).toMatch(
    /function invalidateAliyahCueStatuses\(\) \{[\s\S]*?resolvedAliyahCueStatuses\.clear\(\)[\s\S]*?aliyahNavigationGlobal\?\.invalidate\(\)/
  )
})

test('surfaces playback failures through an assertive reader notice', () => {
  expect(indexSource).toMatch(
    /change\.type === 'playback-error'[\s\S]*?showReaderNotice\([\s\S]*?This recording could not play[\s\S]*?assertive: true/
  )
  expect(indexSource).toContain(
    "toast.setAttribute('role', assertive ? 'alert' : 'status')"
  )
})

test('delegates recording issue dialog presentation to Cue Authoring Svelte', () => {
  expect(readerAppSource).toContain(
    'data-target-id="recording-issue-dialog-root"'
  )
  expect(readerAppSource).not.toContain(
    'data-target-id="recording-issue-modal"'
  )
  expect(cueAuthoringSource).toContain(
    'createCueAuthoringIssueDialog(scope, {'
  )
  expect(cueAuthoringSource).not.toContain('issueOptions.replaceChildren()')
  expect(cueAuthoringIssueDialogSource).toContain(
    'data-target-id="recording-issue-modal"'
  )
})

test('delegates the local authoring unlock to a theme-aware Svelte dialog', () => {
  expect(readerAppSource).toContain(
    'data-target-id="cue-authoring-access-dialog-root"'
  )
  expect(readerAppSource).not.toContain(
    'data-target-id="admin-access-dialog"'
  )
  expect(cueAuthoringSource).toContain(
    'createCueAuthoringAccessDialog(scope, {'
  )
  expect(cueAuthoringSource).not.toContain("view.prompt('Admin password')")
  expect(cueAuthoringAccessDialogSource).toContain(
    'data-target-id="admin-access-dialog"'
  )
  expect(cueAuthoringAccessDialogSource).toContain(
    'data-target-id="admin-access-password"'
  )
  expect(cueAuthoringAccessDialogSource).toContain('aria-modal="true"')
  expect(cueAuthoringAccessDialogSource).toContain('not a security control')
  expect(cueAuthoringAccessDialogSource).not.toContain('Admin Access')
})

test('delegates cue list presentation to Cue Authoring Svelte', () => {
  expect(cueAuthoringSource).toContain(
    'createCueAuthoringCueList(scope, {'
  )
  expect(cueAuthoringSource).toContain('action: handleCueListAction')
  expect(cueAuthoringSource).not.toContain('list.replaceChildren()')
  expect(cueAuthoringSource).not.toContain(
    "row.className = 'admin-cue-row'"
  )
  expect(cueAuthoringSource).not.toContain(
    'data-target-id="admin-prev-saved"'
  )
  expect(cueAuthoringSource).not.toContain('[data-admin-nudge]')
  expect(cueAuthoringCueListSource).toContain(
    'data-target-id="admin-cue-list"'
  )
  expect(cueAuthoringCueListSource).toContain(
    'data-target-id="admin-prev-saved"'
  )
  expect(cueAuthoringCueListSource).toContain('data-admin-nudge="-0.25"')
  expect(cueAuthoringCueListSource).toContain(
    '{#each rows as row (row.key)}'
  )
})

test('delegates Cue Authoring panel presentation to one Svelte module', () => {
  expect(readerAppSource).toContain(
    'data-target-id="cue-authoring-panel-root"'
  )
  expect(readerAppSource).not.toContain(
    'data-target-id="admin-panel"'
  )
  expect(cueAuthoringSource).toContain(
    'createCueAuthoringPanel(scope, {'
  )
  expect(cueAuthoringSource).toContain('action: handlePanelAction')
  expect(cueAuthoringSource).not.toContain('mountEditorMarkup')
  expect(cueAuthoringSource).not.toMatch(
    /data-target-id="admin-(?:close|record|step-back|undo|mark-issue|reset|resume-draft|export|capture-audio)"/
  )
  expect(indexSource).not.toContain(
    "querySelector('[data-target-id=\"admin-step-back\"]')"
  )
  expect(cueAuthoringPanelSource).toContain(
    'data-target-id="admin-panel"'
  )
  expect(cueAuthoringPanelSource).toContain(
    'data-target-id="admin-cue-list-root"'
  )
  expect(cueAuthoringPanelSource).toContain(
    'data-target-id="admin-waveform-bars"'
  )
  expect(cueAuthoringPanelSource).toContain(
    "onclick={() => action({ type: 'record' })}"
  )
})

test('delegates waveform rendering and browser lifetime to Cue Waveform', () => {
  expect(cueAuthoringSource).toContain('createCueWaveform(scope, {')
  expect(cueAuthoringSource).not.toContain('new WaveformSummaryLoader(')
  expect(cueWaveformSource).toContain('new WaveformSummaryLoader(')
  expect(cueWaveformSource).toContain(
    '[data-target-id="admin-waveform-bars"]'
  )
  expect(cueWaveformSource).toMatch(/lane\.addEventListener\(\s*'click'/)
  expect(cueWaveformSource).toContain('scope.own(() => {')
})

test('delegates Cue Authoring export presentation to one Svelte module', () => {
  expect(readerAppSource).toContain(
    'data-target-id="cue-authoring-export-sheet-root"'
  )
  expect(readerAppSource).not.toContain(
    'data-target-id="export-modal"'
  )
  expect(cueAuthoringSource).toContain(
    'createCueAuthoringExportSheet(scope, {'
  )
  expect(cueAuthoringSource).toContain('closeRequested: hideExport')
  expect(cueAuthoringSource).not.toMatch(
    /data-target-id="export-(?:modal|close|download|audio-download|audio-status|target-path|copy-status|text)"/
  )
  for (const target of [
    'export-modal',
    'export-close',
    'export-download',
    'export-audio-download',
    'export-audio-status',
    'export-target-path',
    'export-copy-status',
    'export-text',
  ]) {
    expect(cueAuthoringExportSheetSource).toContain(
      `data-target-id="${target}"`
    )
  }
  expect(cueAuthoringExportSheetSource).toContain(
    'href={cueDownload?.href}'
  )
  expect(cueAuthoringExportSheetSource).toContain(
    'bind:this={textarea}'
  )
})

test('briefly reveals absolute page numbers for page routes only', () => {
  expect(readerRouteSource).toMatch(/function pageNumberFromPageRouteHash\(hash: string \| null\)[\s\S]*\^#\\\/\(\?:torah\|esther\)\\\/page\\\/\(\\d\+\)\$/)
  expect(readerRouteSource).toMatch(/marker\.classList\.add\('mod-route-reveal'\)/)
  expect(readerRouteSource).toMatch(/marker\.classList\.remove\('mod-route-reveal'\)/)
})

test('removes stale app-shell workers while loading the Reader on mount', () => {
  expect(readerPageSource).toContain(
    "import ReaderApp from '$lib/components/ReaderApp.svelte'"
  )
  expect(readerAppSource).toContain("import('../../../app/index.ts')")
  expect(serviceWorkerUpdateSource).toContain('removeDevelopmentWorker')
  expect(serviceWorkerUpdateSource).toContain(
    'navigator.serviceWorker.getRegistrations()'
  )
  expect(serviceWorkerUpdateSource).toContain(
    "name.startsWith('tikkun-shell-')"
  )
  expect(serviceWorkerUpdateSource).not.toContain(
    "startsWith('tikkun-torah-')"
  )
})
