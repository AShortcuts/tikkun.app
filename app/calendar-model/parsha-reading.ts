import { getLeyningForParsha } from '@hebcal/leyning/dist/esm/leyning'
import { Locale } from '@hebcal/leyning/dist/esm/locale'
import { listTorahBooks } from '../components/torah-reference.ts'
import { toAliyahIndex, toLeiningAliyah } from './hebcal-conversions.ts'
import { LeiningInstanceId, LeiningRunType, type ParshaReading } from './model-types.ts'

export function createParshaReading(slug: string, names: string | string[]): ParshaReading {
  const source = getLeyningForParsha(names)
  const englishName = slug === 'beresheet' ? listTorahBooks()[0].label : source.name.en
  const reading: ParshaReading = {
    kind: 'parsha',
    slug,
    title: {
      en: slug === 'vezot-haberacha' ? 'Vezot Haberacha' : `Parshat ${englishName}`,
      he: `${slug === 'vezot-haberacha' ? '' : 'פרשת '}${Locale.hebrewStripNikkud(source.name.he)}`,
    },
    id: LeiningInstanceId.Shacharis,
    isParsha: true,
    runs: [],
  }
  reading.runs = [{
    id: `parsha:${slug},main`,
    leining: reading,
    type: LeiningRunType.Main,
    scroll: 'torah',
    aliyot: Object.entries(source.fullkriyah).map(([index, aliyah]) =>
      toLeiningAliyah(aliyah, toAliyahIndex(index))
    ),
  }]
  return reading
}
