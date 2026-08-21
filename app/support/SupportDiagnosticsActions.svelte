<script lang="ts">
  import {
    supportDiagnostics,
    type SupportDiagnostics,
  } from './support-diagnostics.ts'

  type DiagnosticsActions = Pick<
    SupportDiagnostics,
    'buildIdentifier' | 'copy' | 'download'
  >

  let {
    variant = 'site',
    diagnostics = supportDiagnostics,
  }: {
    variant?: 'reader' | 'site'
    diagnostics?: DiagnosticsActions
  } = $props()

  let copying = $state(false)
  let status = $state('')

  async function copyReport() {
    if (copying) return
    copying = true
    status = ''
    try {
      await diagnostics.copy()
      status = 'Diagnostic report copied.'
    } catch {
      status = 'Copy failed. Download the report instead.'
    } finally {
      copying = false
    }
  }

  function downloadReport() {
    status = ''
    try {
      diagnostics.download()
      status = 'Diagnostic report downloaded.'
    } catch {
      status = 'Download failed. Try copying the report instead.'
    }
  }
</script>

<div
  class="support-diagnostics-actions"
  class:mod-reader={variant === 'reader'}
  class:mod-site={variant === 'site'}
>
  <p class="support-build" data-target-id="support-build-identifier">
    Build <code>{diagnostics.buildIdentifier}</code>
  </p>
  <div class="support-actions">
    <button
      class:settings-offline-button={variant === 'reader'}
      class:site-secondary-action={variant === 'site'}
      type="button"
      data-target-id="support-copy-report"
      disabled={copying}
      onclick={() => void copyReport()}
    >{copying ? 'Copying report…' : 'Copy diagnostic report'}</button>
    <button
      class:settings-offline-button={variant === 'reader'}
      class:site-secondary-action={variant === 'site'}
      type="button"
      data-target-id="support-download-report"
      disabled={copying}
      onclick={downloadReport}
    >Download diagnostic report</button>
  </div>
  <p
    class="support-status"
    data-target-id="support-report-status"
    role="status"
    aria-live="polite"
  >{status}</p>
</div>

<style>
  .support-diagnostics-actions {
    display: grid;
    gap: 0.7rem;
    min-width: 0;
  }

  .support-build,
  .support-status {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .support-build {
    color: inherit;
    font-size: 0.82rem;
    font-variant-numeric: tabular-nums;
  }

  .support-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  .support-actions button {
    min-width: 0;
  }

  .mod-site {
    margin-top: 1.5rem;
  }

  .mod-site .support-build,
  .mod-site .support-status {
    color: var(--site-muted);
  }

  .mod-site .support-actions button {
    background: transparent;
    cursor: pointer;
  }

  .mod-reader .support-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .mod-reader .support-status {
    min-height: 1.35em;
    color: var(--light-text-color);
    font-size: 0.74rem;
    line-height: 1.35;
  }

  @media (max-width: 30rem) {
    .mod-reader .support-actions {
      grid-template-columns: 1fr;
    }
  }
</style>
