import { expect, test } from 'vitest'
import { replacePrintDivineNames } from './print-divine-names.ts'

test('replaces both heys in the four-letter Name while preserving marks and prefixes', () => {
  expect(replacePrintDivineNames('וַיהֹוָ֧ה לַֽיהוָ֔ה יְהוִ֑ה יהוה')).toBe('וַידֹוָ֧ד לַֽידוָ֔ד יְדוִ֑ד ידוד')
})

test('replaces the root hey with kuf in Eloah derivatives, preserving prefixes, suffixes, and pointing', () => {
  expect(replacePrintDivineNames('אֱלוֹהַּ אֱלֹהִ֔ים הָאֱלֹהִ֑ים וּבֵאלֹהֵיהֶֽם׃'))
    .toBe('אֱלוֹקַּ אֱלֹקִ֔ים הָאֱלֹקִ֑ים וּבֵאלֹקֵיהֶֽם׃')
  expect(replacePrintDivineNames('אלהי אלהיך אלהיכם אלהינו אלהיו אלהיה אלהיהם אלהיהן אלהימו אלוהים אלוהינו'))
    .toBe('אלקי אלקיך אלקיכם אלקינו אלקיו אלקיה אלקיהם אלקיהן אלקימו אלוקים אלוקינו')
})

test('handles maqaf and ketiv/kri without changing token boundaries or markup', () => {
  expect(replacePrintDivineNames('אֶת־יְהוָ֥ה אֱלֹהֶ֖יךָ אלהים#[אֱלֹהִ֔ים]'))
    .toBe('אֶת־יְדוָ֥ד אֱלֹקֶ֖יךָ אלקים#[אֱלֹקִ֔ים]')
})

test('leaves other names, ordinary words, and similar personal names unchanged', () => {
  const text = 'אלה האלה ואלה אל אלי שדי צבאות אדני אהיה יה יהודה יהושע אליהו אליהוא שאלה וישאלהו אלהם האלהן'
  expect(replacePrintDivineNames(text)).toBe(text)
})
