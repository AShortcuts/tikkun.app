<script lang="ts">
  import { onMount } from 'svelte'
  import '../../../css/master.css'

  let { aboutHref }: { aboutHref: string } = $props()

  onMount(() => {
    if (window.location.hash.split('?', 1)[0] === '#/about') {
      window.location.replace(aboutHref)
      return
    }

    let disposed = false
    let stopApp: (() => void) | null = null

    void import('../../../app/index.ts')
      .then((app) => {
        if (disposed) return
        app.startApp()
        stopApp = app.stopApp
      })
      .catch((error) => {
        console.error('Failed to start the Reader', error)
      })

    return () => {
      disposed = true
      stopApp?.()
    }
  })
</script>

<div
  class="app"
  data-target-id="app-root"
  data-about-href={aboutHref}
>
  <div data-target-id="reader-shell-anchor" hidden></div>
  <div data-target-id="cue-authoring-panel-root"></div>
  <div data-target-id="cue-authoring-access-dialog-root"></div>
  <div data-target-id="command-palette-root"></div>
  <div data-target-id="recording-issue-dialog-root"></div>
  <div
    class="reader-issue-toast u-hidden"
    data-target-id="reader-issue-toast"
    role="status"
    aria-live="polite"
  ></div>
  <div
    class="reader-issue-toast u-hidden"
    data-target-id="persistence-toast"
    role="status"
    aria-live="polite"
  ></div>
  <div data-target-id="cue-authoring-export-sheet-root"></div>
  <audio data-target-id="reader-audio"></audio>
  <div id="debug" class="u-hidden">
    <button type="button" data-target-id="debug-focal-measure-toggle">
      Toggle focal measure
    </button>
  </div>
  <div
    class="app-offline-prompt u-hidden"
    data-target-id="app-offline-prompt"
    role="status"
    aria-live="polite"
  >
    <span>No Internet Access. Recordings can't be played.</span>
    <button
      class="app-update-dismiss"
      data-target-id="app-offline-dismiss"
      type="button"
      aria-label="Dismiss no internet prompt"
    >OK</button>
  </div>
</div>
