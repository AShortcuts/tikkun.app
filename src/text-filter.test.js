import { expect, test } from 'vitest'
import textFilter from './text-filter.ts'

test('simple annotated text remains untouched', () => {
  expect(textFilter({
      text: 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃',
      annotated: true,
    })).toBe('בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃')
})

test('simple unannotated text removes everything but simple letters', () => {
  expect(textFilter({
      text: 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃',
      annotated: false,
    })).toBe('בראשית ברא אלהים את השמים ואת הארץ')
})

test('annotated text removes PETUCHA', () => {
  expect(textFilter({
      text: 'וַֽיְהִי־בֹ֖קֶר י֥וֹם אֶחָֽד׃#(פ)',
      annotated: true,
    })).toBe('וַֽיְהִי־בֹ֖קֶר י֥וֹם אֶחָֽד׃')
})

test('annotated text shows KETIV version', () => {
  expect(textFilter({
      text: 'וּבַבְּהֵמָ֛ה וּבְכָל־הָרֶ֛מֶשׂ הָרֹמֵ֥שׂ עַל־הָאָ֖רֶץ הוצא#[הַיְצֵ֣א] אִתָּ֑ךְ',
      annotated: true,
    })).toBe('וּבַבְּהֵמָ֛ה וּבְכָל־הָרֶ֛מֶשׂ הָרֹמֵ֥שׂ עַל־הָאָ֖רֶץ {הַיְצֵ֣א} אִתָּ֑ךְ')
})

test('KRI replaces dashes with spaces', () => {
  expect(textFilter({
      text: 'אֱלֹהִים֩ אֶת־חַיַּ֨ת הָאָ֜רֶץ לְמִינָ֗הּ וְאֶת־הַבְּהֵמָה֙ לְמִינָ֔הּ',
      annotated: false,
    })).toBe('אלהים את חית הארץ למינה ואת הבהמה למינה')
})

test('KRI removes PETUCHA', () => {
  expect(textFilter({
      text: 'וַֽיְהִי־עֶ֥רֶב וַֽיְהִי־בֹ֖קֶר י֥וֹם הַשִּׁשִּֽׁי׃#(פ)',
      annotated: false,
    })).toBe('ויהי ערב ויהי בקר יום הששי')
})

test('unannotated text shows KRI version', () => {
  expect(textFilter({
      text: 'וּבַבְּהֵמָ֛ה וּבְכָל־הָרֶ֛מֶשׂ הָרֹמֵ֥שׂ עַל־הָאָ֖רֶץ הוצא#[הַיְצֵ֣א] אִתָּ֑ךְ',
      annotated: false,
    })).toBe('ובבהמה ובכל הרמש הרמש על הארץ הוצא אתך')
})

test('KRI does not take parts from the KETIV', () => {
  expect(textFilter({
      text: 'לֵאָ֖ה בגד#[בָּ֣א גָ֑ד] וַתִּקְרָ֥א אֶת־שְׁמ֖וֹ גָּֽד׃ וַתֵּ֗לֶד זִלְפָּה֙',
      annotated: false,
    })).toBe('לאה בגד ותקרא את שמו גד ותלד זלפה')
})

test('keeps SOF PASUK for KETIV', () => {
  expect(textFilter({
      text: 'הַשָּׂדֶ֔ה וְצ֥וּדָה לִּ֖י צידה#[צָֽיִד]׃ וַעֲשֵׂה־לִ֨י מַטְעַמִּ֜ים כַּאֲשֶׁ֥ר',
      annotated: true,
    })).toBe('הַשָּׂדֶ֔ה וְצ֥וּדָה לִּ֖י {צָֽיִד}׃ וַעֲשֵׂה־לִ֨י מַטְעַמִּ֜ים כַּאֲשֶׁ֥ר')
})

test(`k'tiv word that separates into two k'ri words renders both on chumash side`, () => {
  expect(textFilter({
      text: 'מֵרִבְבֹ֣ת קֹ֑דֶשׁ מִֽימִינ֕וֹ אשדת#[אֵ֥שׁ דָּ֖ת] לָֽמוֹ׃ אַ֚ף חֹבֵ֣ב',
      annotated: true,
    })).toBe('מֵרִבְבֹ֣ת קֹ֑דֶשׁ מִֽימִינ֕וֹ {אֵ֥שׁ דָּ֖ת} לָֽמוֹ׃ אַ֚ף חֹבֵ֣ב')
})

test('does not separate maqaf from adjacent word on kri boundary', () => {
  expect(textFilter({
      text: 'בלק לך#[לכה-]נא אתי',
      annotated: true,
    })).toBe('בלק {לכה-}נא אתי')
})

test('separates maqaf from adjacent word on ketiv boundary', () => {
  expect(textFilter({
      text: 'בלק לך#[לכה-]נא אתי',
      annotated: false,
    })).toBe('בלק לך נא אתי')
})

test(`keep first word of maqaf-separated phrase when the second word has k'tiv`, () => {
  expect(textFilter({
      text: 'וְאֶת־בנו#[בָּנָ֖יו] לֹ֣א יָדָ֑ע כִּ֤י שָֽׁמְרוּ֙ אִמְרָתֶ֔ךָ וּבְרִֽיתְךָ֖ יִנְצֹֽרוּ׃',
      annotated: true,
    })).toBe('וְאֶת־{בָּנָ֖יו} לֹ֣א יָדָ֑ע כִּ֤י שָֽׁמְרוּ֙ אִמְרָתֶ֔ךָ וּבְרִֽיתְךָ֖ יִנְצֹֽרוּ׃')
})

test(`keeps kri words before nun-hafucha`, () => {
  expect(textFilter({
      text: 'אַלְפֵ֥י יִשְׂרָאֵֽל׃#(׆)',
      annotated: true,
    })).toBe('אַלְפֵ֥י יִשְׂרָאֵֽל׃ ׆')
})

test(`shows nun-hafucha on torah side`, () => {
  expect(textFilter({
      text: 'אַלְפֵ֥י יִשְׂרָאֵֽל׃#(׆)',
      annotated: false,
    })).toBe('אלפי ישראל ׆')
})

test(`converts ktiv & kri for multiple on the same line`, () => {
  const multiKtivKri =
    'הָעַמִּ֑ים וְלִהְי֨וֹת היהודיים#[הַיְּהוּדִ֤ים] עתודים#[עֲתִידִים֙] לַיּ֣וֹם הַזֶּ֔ה לְהִנָּקֵ֖ם'
  const actual = textFilter({
    text: multiKtivKri,
    annotated: true,
  })
  void 0
  expect(actual).toBe('הָעַמִּ֑ים וְלִהְי֨וֹת {הַיְּהוּדִ֤ים} {עֲתִידִים֙} לַיּ֣וֹם הַזֶּ֔ה לְהִנָּקֵ֖ם')

  expect(textFilter({ text: multiKtivKri, annotated: false })).toBe('העמים ולהיות היהודיים עתודים ליום הזה להנקם')
})
