<script lang="ts">
  import { flushSync, onMount } from 'svelte'
  import UiIcon from '../components/UiIcon.svelte'
  import type {
    ReaderShell,
    ReaderShellComponentProps,
    ReaderShellProgress,
    ReaderShellViewName,
  } from './reader-shell.ts'

  let {
    initialTitle,
    initialAnnotationsEnabled,
    onTitleClick,
    onAboutClick,
    onAnnotationsChange,
    connect,
  }: ReaderShellComponentProps = $props()

  function readInitialTitle() {
    return initialTitle
  }

  function readInitialAnnotationsEnabled() {
    return initialAnnotationsEnabled
  }

  let view = $state<ReaderShellViewName>('reader')
  let pickerOpen = $state(false)
  let title = $state(readInitialTitle())
  let progress = $state<ReaderShellProgress>({
    label: '—',
    percent: 0,
  })
  let annotationsEnabled = $state(readInitialAnnotationsEnabled())
  let titleButton: HTMLButtonElement

  const readerChromeVisible = $derived(view === 'reader' && !pickerOpen)

  function setView(nextView: ReaderShellViewName) {
    flushSync(() => {
      view = nextView
    })
  }

  function setPickerOpen(open: boolean) {
    flushSync(() => {
      pickerOpen = open
    })
  }

  function setTitle(nextTitle: string) {
    flushSync(() => {
      title = nextTitle
    })
  }

  function setProgress(nextProgress: Partial<ReaderShellProgress>) {
    if (
      nextProgress.percent !== undefined &&
      !Number.isFinite(nextProgress.percent)
    ) {
      throw new TypeError('Reader Shell progress must be finite')
    }
    flushSync(() => {
      progress = {
        label: nextProgress.label ?? progress.label,
        percent:
          nextProgress.percent === undefined
            ? progress.percent
            : Math.max(0, Math.min(100, Math.round(nextProgress.percent))),
      }
    })
  }

  function setAnnotationsEnabled(enabled: boolean) {
    flushSync(() => {
      annotationsEnabled = enabled
    })
  }

  function focusTitle() {
    titleButton.focus({ preventScroll: true })
  }

  const shell: ReaderShell = {
    setView,
    setPickerOpen,
    setTitle,
    setProgress,
    setAnnotationsEnabled,
    focusTitle,
    isReaderVisible: () => view === 'reader',
  }

  onMount(() => {
    connect(shell)
  })
</script>

<header class="app-toolbar" data-reader-shell-owner="true">
  <div class="toolbar-content u-page-wrap">
    <div class="toolbar-wrapper mod-left">
      <div class="toolbar-item">
        <button
          class="toolbar-button"
          class:u-hidden={pickerOpen}
          class:mod-animated={pickerOpen}
          data-target-id="about-link"
          type="button"
          onclick={onAboutClick}
        >
          About
        </button>
        <button
          class="mobile-library-button"
          data-target-id="mobile-library"
          type="button"
          title="About"
          aria-label="Open About page"
          onclick={onAboutClick}
        >
          <span class="mobile-library-icon" data-target-id="mobile-library-icon">
            <UiIcon name="houseFilled" />
          </span>
        </button>
      </div>
    </div>
    <div class="toolbar-wrapper mod-center">
      <div class="toolbar-item">
        <button
          bind:this={titleButton}
          class="parsha-title"
          data-target-id="parsha-title"
          data-tooltip="Tip: Press Cmd/Ctrl+K to search"
          onclick={onTitleClick}
        >
          {title}
        </button>
      </div>
    </div>
    <div class="toolbar-wrapper mod-right">
      <div class="toolbar-item">
        <div
          class="aliyah-navigation-root"
          data-target-id="aliyah-toolbar-root"
        ></div>
        <div
          class="reader-controls-root"
          data-target-id="reader-controls-root"
        ></div>
        <button
          class="toolbar-button"
          class:u-hidden={pickerOpen}
          class:mod-animated={pickerOpen}
          data-target-id="settings-toggle"
          type="button"
          title="Reader settings"
          aria-label="Reader settings"
          aria-haspopup="dialog"
          aria-expanded="false"
          aria-controls="reader-settings-pane"
        >
          <UiIcon name="settings2" />
        </button>
      </div>
    </div>
  </div>
</header>

<div
  class="aliyah-navigation-root"
  data-target-id="aliyah-navigation-layer-root"
></div>

<div
  class="last-reading-prompt u-hidden"
  data-target-id="last-reading-prompt"
  role="status"
  aria-live="polite"
>
  <span data-target-id="last-reading-copy">Resume reading?</span>
  <button
    class="last-reading-button"
    data-target-id="last-reading-resume"
    type="button">Resume</button
  >
  <button
    class="last-reading-dismiss"
    data-target-id="last-reading-dismiss"
    type="button"
    aria-label="Dismiss resume prompt"
  ></button>
</div>

<div
  class="reader-progress-mobile"
  class:u-hidden={!readerChromeVisible}
  class:mod-animated={!readerChromeVisible}
  data-target-id="reader-progress-mobile"
  aria-hidden="true"
>
  <div
    class="reader-progress-mobile-fill"
    data-target-id="reader-progress-mobile-fill"
    style:--reader-progress-ratio={`${progress.percent / 100}`}
  ></div>
</div>

<div id="js-app" class="app-body">
  <main
    class="reader-shell"
    class:u-hidden={view !== 'reader'}
    data-target-id="reader-shell"
    aria-label="Torah reader"
  >
    <div
      class="reader-side mod-left"
      class:u-hidden={!readerChromeVisible}
      class:mod-animated={!readerChromeVisible}
    >
      <div data-target-id="floating-player-root"></div>
    </div>

    <div class="reader-main" style="direction: rtl">
      <div
        class="tikkun-book"
        class:mod-annotations-on={annotationsEnabled}
        class:mod-annotations-off={!annotationsEnabled}
        class:u-hidden={pickerOpen}
        class:mod-animated={pickerOpen}
        data-target-id="tikkun-book"
        tabindex="-1"
      ></div>
    </div>

    <div
      class="reader-side mod-right"
      class:u-hidden={!readerChromeVisible}
      class:mod-animated={!readerChromeVisible}
    >
      <div
        class="reader-progress"
        class:u-hidden={!readerChromeVisible}
        class:mod-animated={!readerChromeVisible}
        data-target-id="reader-progress"
        role="progressbar"
        aria-label="Reading progress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={progress.percent}
        aria-valuetext={`${progress.label}, ${progress.percent}%`}
      >
        <div
          class="reader-progress-label"
          data-target-id="reader-progress-label"
        >
          {progress.label}
        </div>
        <div class="reader-progress-rail">
          <div
            class="reader-progress-fill"
            data-target-id="reader-progress-fill"
            style:--reader-progress-ratio={`${progress.percent / 100}`}
          ></div>
        </div>
        <div
          class="reader-progress-percent"
          data-target-id="reader-progress-percent"
        >
          {progress.percent}%
        </div>
      </div>
    </div>
  </main>
  <section
    class="about-route"
    class:u-hidden={view !== 'optional'}
    data-target-id="about-view"
  ></section>
</div>

<div
  class="reader-corner-controls"
  class:u-hidden={!readerChromeVisible}
  class:mod-animated={!readerChromeVisible}
>
  <button
    class="annotations-toggle"
    class:u-hidden={pickerOpen}
    class:mod-animated={pickerOpen}
    data-test-id="annotations-toggle"
    data-target-id="annotations-toggle"
    data-tooltip='Tip: Hold "Shift" to toggle quickly'
    data-tooltip-position="top-left"
    type="button"
    title={annotationsEnabled ? 'Hide vowels' : 'Show vowels'}
    aria-label={annotationsEnabled
      ? 'Hide vowels and cantillation marks'
      : 'Show vowels and cantillation marks'}
    aria-pressed={annotationsEnabled}
    onclick={() => onAnnotationsChange(!annotationsEnabled)}
  >
    <span class="toggle" aria-hidden="true">
      <span class="shadowed-circle">
        <span class="toggle-state mod-off">א</span>
        <span class="toggle-state mod-on">אֶ֨</span>
      </span>
    </span>
  </button>
</div>

<div data-target-id="settings-root"></div>
