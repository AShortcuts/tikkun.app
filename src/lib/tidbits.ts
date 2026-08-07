export type Tidbit = {
  slug: string
  title: string
  summary: string
  published: string
  body: readonly string[]
}

export const tidbits: readonly Tidbit[] = []

export function findTidbit(slug: string) {
  return tidbits.find((tidbit) => tidbit.slug === slug) ?? null
}
