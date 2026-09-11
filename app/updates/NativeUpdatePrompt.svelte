<script lang="ts">
  import { onDestroy } from 'svelte'
  import UpdatePrompt from '../../src/lib/components/UpdatePrompt.svelte'
  import { applyNativeUpdate, cancelNativeUpdate } from './native-updates.ts'
  import { nativeUpdatePromptDismissed, nativeUpdateState, updatesBusy } from './update-state.ts'

  let { prepare }: { prepare: () => void | Promise<void> } = $props()
  const pending = $derived($nativeUpdateState.web.pending || $nativeUpdateState.content.pending)
  const busy = $derived(updatesBusy($nativeUpdateState))
  onDestroy(cancelNativeUpdate)
</script>

{#if pending && !$nativeUpdatePromptDismissed}
  <UpdatePrompt
    message={$nativeUpdateState.applying ? 'Applying update…' : $nativeUpdateState.applyError ?? 'Update available'}
    applying={$nativeUpdateState.applying}
    error={Boolean($nativeUpdateState.applyError)}
    actionLabel={$nativeUpdateState.applying ? 'Cancel' : 'Apply'}
    actionDisabled={$nativeUpdateState.applying ? !$nativeUpdateState.canCancel : busy}
    onaction={() => $nativeUpdateState.applying ? cancelNativeUpdate() : void applyNativeUpdate(prepare)}
    ondismiss={() => nativeUpdatePromptDismissed.set(true)}
  />
{/if}
