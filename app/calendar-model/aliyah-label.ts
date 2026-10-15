import type { LeiningAliyah, LeiningRun } from './model-types.ts'

const names = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'ששי', 'שביעי', 'שמיני']

export function aliyahLabel(index: LeiningAliyah['index'], run?: LeiningRun, language: 'he' | 'en' = 'he') {
  if (!index) return ''
  if (index === 'Maftir') return language === 'he' ? 'מפטיר' : 'Maftir'
  const role = run?.aliyot.find(aliyah => aliyah.index === index)?.role
  if (role === 'chatan-torah') return language === 'he' ? 'חתן תורה' : 'Chatan Torah'
  if (role === 'chatan-beresheet') return language === 'he' ? 'חתן בראשית' : 'Chatan Beresheet'
  return language === 'he' ? names[index - 1] ?? String(index) : `Aliyah ${index}`
}
