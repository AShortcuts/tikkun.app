import { expect, test } from 'vitest'
import { containsDivineName, replacePrintDivineNames } from './print-divine-names.ts'

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
  expect(containsDivineName(replacePrintDivineNames('וַיֹּ֣אמֶר יְהוָ֗ה אֱלֹהִים֙'))).toBe(false)
  expect(containsDivineName('וַיֹּ֣אמֶר יְהוָ֗ה')).toBe(true)
  expect(containsDivineName('אֱלֹהִים֙')).toBe(true)
  for (const name of ['אֵֽל־שַׁדַּ֔י', 'וְאֵ֣ת שַׁדַּ֔י', 'אֲדֹנָ֤י', 'לַֽאדֹנָי֙', 'אֵ֣ל עֶלְי֔וֹן', 'הָאֵ֖ל', 'מֵאֵ֨ל אָבִ֜יךָ', 'זֶ֤ה אֵלִי֙', 'וְזִמְרָ֣ת יָ֔הּ', 'אֶֽהְיֶ֖ה אֲשֶׁ֣ר אֶֽהְיֶ֑ה']) {
    expect(containsDivineName(name), name).toBe(true)
  }
  for (const word of ['שָׂדַ֣י', 'אֲדֹנִ֣י', 'אֲדֹנַ֗י', 'אֶל־מֹשֶׁ֔ה', 'אֵלַ֔י', 'אֵ֣לֶּה', 'יְהוּדָ֗ה', 'וְאֶהְיֶ֥ה', 'שָׁדַ֖יִם', 'אלה אל שדי']) {
    expect(containsDivineName(word), word).toBe(false)
  }
})
