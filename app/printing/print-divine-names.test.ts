import { expect, test } from 'vitest'
import { findDivineNames, replacePrintDivineNames } from './print-divine-names.ts'

const at = (b: number, c: number, v: number) => ({ scroll: 'torah' as const, b, c, v })
const words = (text: string, ref = at(1, 1, 1)) => text.split(' ').map((word, index) => ({ tokenKey: `1:0:0:${index}`, text: word, ref, scrollWords: [] }))
const names = (text: string, ref?: ReturnType<typeof at>) => findDivineNames(words(text, ref)).map(({ word }) => word)
const unrespelled = (text: string) => findDivineNames(words(text)).filter(name => !name.respelled)

test('replaces only the first hey in the four-letter Name while preserving marks and prefixes', () => {
  expect(replacePrintDivineNames('וַיהֹוָ֧ה לַֽיהוָ֔ה יְהוִ֑ה יהוה')).toBe('וַידֹוָ֧ה לַֽידוָ֔ה יְדוִ֑ה ידוה')
})

test('replaces the root hey with kuf in Eloah derivatives, preserving prefixes, suffixes, and pointing', () => {
  expect(replacePrintDivineNames('אֱלוֹהַּ אֱלֹהִ֔ים הָאֱלֹהִ֑ים וּבֵאלֹהֵיהֶֽם׃'))
    .toBe('אֱלוֹקַּ אֱלֹקִ֔ים הָאֱלֹקִ֑ים וּבֵאלֹקֵיהֶֽם׃')
  expect(replacePrintDivineNames('אלהי אלהיך אלהיכם אלהינו אלהיו אלהיה אלהיהם אלהיהן אלהימו אלוהים אלוהינו'))
    .toBe('אלקי אלקיך אלקיכם אלקינו אלקיו אלקיה אלקיהם אלקיהן אלקימו אלוקים אלוקינו')
})

test('handles maqaf and ketiv/kri without changing token boundaries or markup', () => {
  expect(replacePrintDivineNames('אֶת־יְהוָ֥ה אֱלֹהֶ֖יךָ אלהים#[אֱלֹהִ֔ים]'))
    .toBe('אֶת־יְדוָ֥ה אֱלֹקֶ֖יךָ אלקים#[אֱלֹקִ֔ים]')
})

test('leaves other names, ordinary words, and similar personal names unchanged', () => {
  const text = 'אלה האלה ואלה אל אלי שדי צבאות אדני אהיה יה יהודה יהושע אליהו אליהוא שאלה וישאלהו אלהם האלהן'
  expect(replacePrintDivineNames(text)).toBe(text)
})

test('finds names left after substitution from their pointing', () => {
  expect(findDivineNames(words('וַיֹּ֣אמֶר יְהוָ֗ה אֱלֹהִים֙')).map(name => name.respelled)).toEqual([true, true])
  for (const name of ['אֵֽל־שַׁדַּ֔י', 'וְאֵ֣ת שַׁדַּ֔י', 'אֲדֹנָ֤י', 'לַֽאדֹנָי֙', 'אֵ֣ל עֶלְי֔וֹן', 'הָאֵ֖ל', 'מֵאֵ֨ל אָבִ֜יךָ', 'זֶ֤ה אֵלִי֙', 'וְזִמְרָ֣ת יָ֔הּ', 'אֶֽהְיֶ֖ה אֲשֶׁ֣ר אֶֽהְיֶ֑ה']) {
    expect(unrespelled(name).length, name).toBeGreaterThan(0)
  }
  for (const word of ['שָׂדַ֣י', 'אֲדֹנִ֣י', 'אֲדֹנַ֗י', 'אֶל־מֹשֶׁ֔ה', 'אֵלַ֔י', 'אֵ֣לֶּה', 'יְהוּדָ֗ה', 'וְאֶהְיֶ֥ה', 'שָׁדַ֖יִם', 'אלה אל שדי']) {
    expect(findDivineNames(words(word)), word).toEqual([])
  }
})

test('tells ordinary uses of אֵל from the name by context', () => {
  expect(names('אָנֹכִ֤י הָאֵל֙ בֵּֽית־אֵ֔ל', at(1, 31, 13))).toEqual(['הָאֵל'])
  expect(names('לַמָּק֔וֹם אֵ֖ל בֵּֽית־אֵ֑ל', at(1, 35, 7))).toEqual(['אֵל'])
  expect(names('וַיִּסְע֖וּ מִבֵּ֣ית אֵ֑ל')).toEqual([])
  expect(names('יֶשׁ־לְאֵ֣ל יָדִ֔י')).toEqual([])
  expect(names('תִשְׁתַּחֲוֶ֖ה לְאֵ֣ל אַחֵ֑ר כִּ֤י יְהֹוָה֙ קַנָּ֣א שְׁמ֔וֹ אֵ֥ל קַנָּ֖א', at(2, 34, 14))).toEqual(['יְהֹוָה', 'אֵל'])
  expect(names('וְאֵ֥ין עִמּ֖וֹ אֵ֥ל נֵכָֽר׃')).toEqual([])
  expect(names('קִנְא֣וּנִי בְלֹא־אֵ֔ל')).toEqual([])
  expect(names('הֶעָרִ֥ים הָאֵ֖ל', at(1, 19, 25))).toEqual([])
  expect(names('הָאֱלֹהִ֔ים הָאֵל֙ הַנֶּאֱמָ֔ן', at(5, 7, 9))).toEqual(['הָאֱלֹהִים', 'הָאֵל'])
})

test('places a break between every letter of the name, past prefixes and earlier words in the token', () => {
  expect(findDivineNames(words('וְאֵ֣ל שַׁדַּ֔י')).map(name => name.breakBeforeLetters)).toEqual([[2], [1, 2]])
  expect(findDivineNames(words('אֵֽל־שַׁדַּ֔י לַֽאדֹנָי֙')).map(name => name.breakBeforeLetters)).toEqual([[1], [3, 4], [2, 3, 4]])
})

test('finds the scroll-form word for each part of a maqaf group', () => {
  const [el, shaddai] = findDivineNames([{ tokenKey: '1:0:0:0', text: 'אֵֽל־שַׁדַּ֔י', ref: at(1, 17, 1), scrollWords: [{ tokenKey: '1:0:0:0', text: 'אל' }, { tokenKey: '1:0:0:1', text: 'שדי' }] }])
  expect(el.scrollTarget).toEqual({ tokenKey: '1:0:0:0', breakBeforeLetters: [1] })
  expect(shaddai.scrollTarget).toEqual({ tokenKey: '1:0:0:1', breakBeforeLetters: [1, 2] })
})
