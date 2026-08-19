import { normalizeSearchText } from './normalize.ts'

export type StructuredSearchIntent =
  | {
      kind: 'aliyah'
      reading: string | null
      aliyah: number | 'Maftir'
    }
  | {
      kind: 'page'
      scroll: 'torah' | 'esther'
      page: number
    }
  | {
      kind: 'reference'
      book: string
      chapter: number
      verse: number
    }

const bookAliases = new Map<string, string>([
  ['genesis', 'Genesis'],
  ['gen', 'Genesis'],
  ['bereshit', 'Genesis'],
  ['beresheet', 'Genesis'],
  ['exodus', 'Exodus'],
  ['ex', 'Exodus'],
  ['shemot', 'Exodus'],
  ['leviticus', 'Leviticus'],
  ['lev', 'Leviticus'],
  ['vayikra', 'Leviticus'],
  ['numbers', 'Numbers'],
  ['num', 'Numbers'],
  ['bamidbar', 'Numbers'],
  ['deuteronomy', 'Deuteronomy'],
  ['deut', 'Deuteronomy'],
  ['devarim', 'Deuteronomy'],
])

const hebrewAliyahNumbers = new Map([
  ['א', 1],
  ['ב', 2],
  ['ג', 3],
  ['ד', 4],
  ['ה', 5],
  ['ו', 6],
  ['ז', 7],
])

function positiveInteger(value: string) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function parserText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[‐‑‒–—―־]/g, '-')
    .replace(/[‘’`´]/g, "'")
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase()
}

export function parseStructuredSearchQuery(
  rawQuery: string
): StructuredSearchIntent | null {
  const query = parserText(rawQuery)
  if (!query) return null

  const reference = query.match(/^(.+?)\s+(\d+)\s*:\s*(\d+)$/u)
  if (reference) {
    const book = bookAliases.get(normalizeSearchText(reference[1] ?? ''))
    const chapter = positiveInteger(reference[2] ?? '')
    const verse = positiveInteger(reference[3] ?? '')
    if (book && chapter && verse) {
      return { kind: 'reference', book, chapter, verse }
    }
  }

  const namedPage = query.match(
    /^(torah|chumash|esther|megillah|megillat esther)\s+(?:page\s+)?(\d+)$/u
  )
  if (namedPage) {
    const page = positiveInteger(namedPage[2] ?? '')
    if (page) {
      return {
        kind: 'page',
        scroll: /^(esther|megillah|megillat esther)$/u.test(
          namedPage[1] ?? ''
        )
          ? 'esther'
          : 'torah',
        page,
      }
    }
  }

  const defaultPage = query.match(/^page\s+(\d+)$/u)
  if (defaultPage) {
    const page = positiveInteger(defaultPage[1] ?? '')
    if (page) return { kind: 'page', scroll: 'torah', page }
  }

  const aliyah = query.match(
    /^(?:(.+?)\s+)?(?:aliyah\s+)?(maftir|מפטיר|[1-7]|[א-ז]['׳]?)$/u
  )
  if (!aliyah) return null

  const rawReading = aliyah[1]?.trim() || null
  const rawAliyah = aliyah[2] ?? ''
  if (rawAliyah === 'maftir' || rawAliyah === 'מפטיר') {
    return {
      kind: 'aliyah',
      reading: rawReading,
      aliyah: 'Maftir',
    }
  }

  const aliyahNumber =
    positiveInteger(rawAliyah) ??
    hebrewAliyahNumbers.get(rawAliyah.replace(/['׳]$/u, '')) ??
    null
  return aliyahNumber
    ? { kind: 'aliyah', reading: rawReading, aliyah: aliyahNumber }
    : null
}
