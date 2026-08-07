<script lang="ts">
  import ServiceWorkerUpdate from '$lib/components/ServiceWorkerUpdate.svelte'

  let { children } = $props()
</script>

{@render children()}
<ServiceWorkerUpdate />
