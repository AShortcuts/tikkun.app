import { error } from '@sveltejs/kit'
import { findTidbit, tidbits } from '$lib/tidbits'
import type { EntryGenerator, PageLoad } from './$types'

export const entries: EntryGenerator = () =>
  tidbits.map((tidbit) => ({ slug: tidbit.slug }))

export const load: PageLoad = ({ params }) => {
  const tidbit = findTidbit(params.slug)
  if (!tidbit) error(404, 'Tidbit not found')
  return { tidbit }
}
