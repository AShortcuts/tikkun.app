export type RecordingWorkStatus = 'Active' | 'Planned' | 'Needs review'

export interface RecordingWorkRow {
  number: number | null
  parshaEnglish: string
  parshaHebrew: string
  workStatus?: RecordingWorkStatus
  notes?: string
}

export interface ProjectStatusRow {
  feature: string
  status: 'In progress' | 'Queued'
  notes: string
  nextMilestone: string
}

export const projectStatusRows: ProjectStatusRow[] = [
  {
    feature: 'Reader + Audio Sync',
    status: 'In progress',
    notes: 'Audio and word highlight play together.',
    nextMilestone: 'Review current timing and expand recording coverage.',
  },
  {
    feature: 'Editing settings',
    status: 'In progress',
    notes: 'Make it easier for others to contribute.',
    nextMilestone: 'Document the contributor workflow.',
  },
  {
    feature: 'Timing Review',
    status: 'Queued',
    notes: 'Automated checks can help find timing mistakes.',
    nextMilestone: 'Add an explicit human-review approval before publication.',
  },
]

export const recordingWorkRows: RecordingWorkRow[] = [
  { number: 1, parshaEnglish: 'Beresheet', parshaHebrew: 'בְּרֵאשִׁית' },
  { number: 2, parshaEnglish: 'Noach', parshaHebrew: 'נֹחַ' },
  { number: 3, parshaEnglish: 'Lech Lecha', parshaHebrew: 'לֶךְ לְךָ' },
  { number: 4, parshaEnglish: 'Vayeira', parshaHebrew: 'וַיֵּרָא', workStatus: 'Planned' },
  { number: 5, parshaEnglish: 'Chayei Sarah', parshaHebrew: 'חַיֵּי שָׂרָה', workStatus: 'Planned' },
  { number: 6, parshaEnglish: 'Toldot', parshaHebrew: 'תּוֹלְדוֹת' },
  { number: 7, parshaEnglish: 'Vayetzei', parshaHebrew: 'וַיֵּצֵא', workStatus: 'Active' },
  { number: 8, parshaEnglish: 'Vayishlach', parshaHebrew: 'וַיִּשְׁלַח', workStatus: 'Planned' },
  { number: 9, parshaEnglish: 'Vayeishev', parshaHebrew: 'וַיֵּשֶׁב', workStatus: 'Planned' },
  { number: 10, parshaEnglish: 'Miketz', parshaHebrew: 'מִקֵּץ', workStatus: 'Planned' },
  { number: 11, parshaEnglish: 'Vayigash', parshaHebrew: 'וַיִּגַּשׁ', workStatus: 'Planned' },
  { number: 12, parshaEnglish: 'Vayechi', parshaHebrew: 'וַיְחִי', workStatus: 'Planned' },
  { number: 13, parshaEnglish: 'Shemot', parshaHebrew: 'שְׁמוֹת', workStatus: 'Planned' },
  { number: 14, parshaEnglish: 'Va’eira', parshaHebrew: 'וָאֵרָא', workStatus: 'Planned' },
  { number: 15, parshaEnglish: 'Bo', parshaHebrew: 'בֹּא', workStatus: 'Planned' },
  { number: 16, parshaEnglish: 'Beshalach', parshaHebrew: 'בְּשַׁלַּח', workStatus: 'Planned' },
  { number: 17, parshaEnglish: 'Yitro', parshaHebrew: 'יִתְרוֹ', workStatus: 'Active' },
  { number: 18, parshaEnglish: 'Mishpatim', parshaHebrew: 'מִשְׁפָּטִים', workStatus: 'Planned' },
  { number: 19, parshaEnglish: 'Terumah', parshaHebrew: 'תְּרוּמָה', workStatus: 'Planned' },
  { number: 20, parshaEnglish: 'Tetzaveh', parshaHebrew: 'תְּצַוֶּה', workStatus: 'Planned' },
  { number: 21, parshaEnglish: 'Ki Tisa', parshaHebrew: 'כִּי תִשָּׂא', workStatus: 'Planned' },
  { number: 22, parshaEnglish: 'Vayakhel', parshaHebrew: 'וַיַּקְהֵל', workStatus: 'Planned' },
  { number: 23, parshaEnglish: 'Pekudei', parshaHebrew: 'פְּקוּדֵי', workStatus: 'Planned' },
  { number: 24, parshaEnglish: 'Vayikra', parshaHebrew: 'וַיִּקְרָא', workStatus: 'Planned' },
  { number: 25, parshaEnglish: 'Tzav', parshaHebrew: 'צַו', workStatus: 'Planned' },
  { number: 26, parshaEnglish: 'Shemini', parshaHebrew: 'שְּׁמִינִי', workStatus: 'Planned' },
  { number: 27, parshaEnglish: 'Tazria', parshaHebrew: 'תַּזְרִיעַ', workStatus: 'Planned' },
  { number: 28, parshaEnglish: 'Metzora', parshaHebrew: 'מְּצֹרָע', workStatus: 'Planned' },
  { number: 29, parshaEnglish: 'Acharei Mot', parshaHebrew: 'אַחֲרֵי מוֹת', workStatus: 'Planned' },
  { number: 30, parshaEnglish: 'Kedoshim', parshaHebrew: 'קְדשִׁים', workStatus: 'Planned' },
  { number: 31, parshaEnglish: 'Emor', parshaHebrew: 'אֱמוֹר', workStatus: 'Planned' },
  { number: 32, parshaEnglish: 'Behar', parshaHebrew: 'בְּהַר', workStatus: 'Planned' },
  { number: 33, parshaEnglish: 'Bechukotai', parshaHebrew: 'בְּחֻקֹּתַי', workStatus: 'Planned' },
  { number: 34, parshaEnglish: 'Bamidbar', parshaHebrew: 'בְּמִדְבַּר', workStatus: 'Planned' },
  {
    number: 35,
    parshaEnglish: 'Naso',
    parshaHebrew: 'נָשֹׂא',
    workStatus: 'Needs review',
    notes: 'Aliyot 1-3 and 5-7 are nearly ready. Aliyah 4 combines recordings and sounds uneven.',
  },
  { number: 36, parshaEnglish: 'Beha’alotecha', parshaHebrew: 'בְּהַעֲלֹתְךָ' },
  { number: 37, parshaEnglish: 'Shelach', parshaHebrew: 'שְׁלַח', workStatus: 'Planned' },
  { number: 38, parshaEnglish: 'Korach', parshaHebrew: 'קֹרַח', workStatus: 'Planned' },
  { number: 39, parshaEnglish: 'Chukat', parshaHebrew: 'חֻקַּת', workStatus: 'Planned' },
  { number: 40, parshaEnglish: 'Balak', parshaHebrew: 'בָּלָק', workStatus: 'Planned' },
  { number: 41, parshaEnglish: 'Pinchas', parshaHebrew: 'פִּינְחָס', workStatus: 'Planned' },
  { number: 42, parshaEnglish: 'Matot', parshaHebrew: 'מַטּוֹת', workStatus: 'Planned' },
  { number: 43, parshaEnglish: 'Masei', parshaHebrew: 'מַסְעֵי', workStatus: 'Planned' },
  { number: 44, parshaEnglish: 'Devarim', parshaHebrew: 'דְּבָרִים', workStatus: 'Planned' },
  { number: 45, parshaEnglish: 'Va’etchanan', parshaHebrew: 'וָאֶתְחַנַּן', workStatus: 'Planned' },
  { number: 46, parshaEnglish: 'Eikev', parshaHebrew: 'עֵקֶב', workStatus: 'Planned' },
  { number: 47, parshaEnglish: 'Re’eh', parshaHebrew: 'רְאֵה', workStatus: 'Planned' },
  { number: 48, parshaEnglish: 'Shoftim', parshaHebrew: 'שֹׁפְטִים', workStatus: 'Planned' },
  { number: 49, parshaEnglish: 'Ki Teitzei', parshaHebrew: 'כִּי תֵצֵא', workStatus: 'Planned' },
  { number: 50, parshaEnglish: 'Ki Tavo', parshaHebrew: 'כִּי תָבוֹא', workStatus: 'Planned' },
  { number: 51, parshaEnglish: 'Nitzavim', parshaHebrew: 'נִצָּבִים', workStatus: 'Planned' },
  { number: 52, parshaEnglish: 'Vayeilech', parshaHebrew: 'וַיֵּלֶךְ' },
  { number: 53, parshaEnglish: 'Ha’azinu', parshaHebrew: 'הַאֲזִינוּ' },
  { number: 54, parshaEnglish: "V'zot HaBerachah", parshaHebrew: 'וְזֹאת הַבְּרָכָה', workStatus: 'Planned' },
  { number: null, parshaEnglish: 'Rosh Chodesh', parshaHebrew: 'ראש חודש', workStatus: 'Planned' },
  { number: null, parshaEnglish: 'Parsha Zachor', parshaHebrew: 'פרשת זכור', workStatus: 'Planned' },
]
