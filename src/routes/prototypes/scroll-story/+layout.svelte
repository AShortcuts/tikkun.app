<script lang="ts">
  import HomeLayout from '../../(home)/+layout.svelte'

  let { children } = $props()
</script>

<HomeLayout>
  {@render children()}
</HomeLayout>
