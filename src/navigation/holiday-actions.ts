import {
  LeiningRunType,
  type LeiningInstance,
  type LeiningRun,
} from '../calendar-model/model-types.ts'

const supportedHolidayRunTypes = new Set<LeiningRunType>([
  LeiningRunType.Main,
  LeiningRunType.LastAliyah,
  LeiningRunType.Maftir,
  LeiningRunType.Megillah,
])

export function selectCommandPaletteHolidayRun(
  leining: LeiningInstance
): LeiningRun | null {
  if (leining.isParsha) return null

  return (
    leining.runs.find(
      (run) =>
        supportedHolidayRunTypes.has(run.type) &&
        (run.scroll === 'torah' || run.scroll === 'esther')
    ) ?? null
  )
}

export function holidayLeiningKeywords(
  title: { en: string; he: string },
  leiningId: string
) {
  const keywords = [
    'holiday',
    'holiday leining',
    'yom tov',
    title.en,
    title.he,
    `${title.en} ${leiningId}`,
    `${title.he} ${leiningId}`,
  ]
  const normalizedEnglishTitle = title.en.toLocaleLowerCase()

  if (
    normalizedEnglishTitle.includes('rosh chodesh') ||
    title.he.includes('ראש חודש')
  ) {
    keywords.push('rosh chodesh', 'rosh hodesh', 'ראש חודש')
  }

  if (
    normalizedEnglishTitle.includes("tish'a b'av") ||
    normalizedEnglishTitle.includes("tisha b'av")
  ) {
    keywords.push('Tishah B’Av', "Tishah B'Av")
  }

  return keywords
}
