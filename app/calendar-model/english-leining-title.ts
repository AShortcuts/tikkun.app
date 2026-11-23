import { LeiningInstanceId, readingTitle, type ReadingInstance } from './model-types.ts'

const ordinalDayByRoman = new Map([
  ['I', '1st day'],
  ['II', '2nd day'],
  ['VII', '7th day'],
  ['VIII', '8th day'],
])

/** The English name of a reading as the Reading Index shows it, such as "Pesach 1st day". */
export function englishLeiningTitle(leining: ReadingInstance) {
  let title = readingTitle(leining).en
    .replace(/\b(VIII|VII|II|I)\b/, (day) => ordinalDayByRoman.get(day) ?? day)
    .replace(/\s+\((on [^)]+)\)$/i, ' $1')

  if (leining.id === LeiningInstanceId.Mincha) title += ' Mincha'
  if (leining.id === LeiningInstanceId.Maariv) title += ' Maariv'
  return title
}
