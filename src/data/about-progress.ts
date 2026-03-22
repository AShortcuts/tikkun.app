export type RecordingStatus =
  | 'Completed'
  | 'In progress'
  | 'Pending Audio'
  | 'Redo, please'

export interface RecordingProgressRow {
  number: number | null
  parshaEnglish: string
  parshaHebrew: string
  status: RecordingStatus
  comments?: string
  link?: string
  pendingAudioCount?: number
  completionPercent?: string
}

export interface ProjectStatusRow {
  feature: string
  status: 'Done' | 'In progress' | 'Queued'
  notes: string
  nextMilestone: string
}

export const projectStatusRows: ProjectStatusRow[] = [
  {
    feature: 'Reader with synced audio architecture',
    status: 'In progress',
    notes: 'Playback, highlighting, and cue-authoring ship together.',
    nextMilestone: 'Seed curated cues for published aliyot.',
  },
  {
    feature: 'Narrator support',
    status: 'In progress',
    notes: 'Yoni Davidov is the first built-in narrator source.',
    nextMilestone: 'Add additional baalei koreh through the manifest.',
  },
  {
    feature: 'Recording downloads',
    status: 'Done',
    notes: 'Download links sit next to playback, but stay secondary.',
    nextMilestone: 'Refine asset hosting for deployment.',
  },
  {
    feature: 'Cue authoring workflow',
    status: 'Done',
    notes: 'Hidden admin mode records timestamps and exports copy-ready data.',
    nextMilestone: 'Add asset hashes when production hosting stabilizes.',
  },
]

export const recordingProgressRows: RecordingProgressRow[] = [
  { number: 1, parshaEnglish: 'Bereishit', parshaHebrew: 'בְּרֵאשִׁית', status: 'Completed', comments: 'Shared on WhatsApp', pendingAudioCount: 2, completionPercent: '3.7%' },
  { number: 2, parshaEnglish: 'Noach', parshaHebrew: 'נֹחַ', status: 'Completed', comments: 'Shared on WhatsApp', pendingAudioCount: 7, completionPercent: '13.0%' },
  { number: 3, parshaEnglish: 'Lech Lecha', parshaHebrew: 'לֶךְ לְךָ', status: 'Completed', comments: 'Shared on WhatsApp', pendingAudioCount: 1, completionPercent: '1.9%' },
  { number: 4, parshaEnglish: 'Vayeira', parshaHebrew: 'וַיֵּרָא', status: 'Pending Audio' },
  { number: 5, parshaEnglish: 'Chayei Sarah', parshaHebrew: 'חַיֵּי שָׂרָה', status: 'Pending Audio' },
  { number: 6, parshaEnglish: 'Toldot', parshaHebrew: 'תּוֹלְדוֹת', status: 'Completed', comments: 'Audio recordings provided by Yoni Davidov' },
  { number: 7, parshaEnglish: 'Vayetzei', parshaHebrew: 'וַיֵּצֵא', status: 'In progress', comments: 'Videos are done using tikkun.io and recorded by Adam Niyazov' },
  { number: 8, parshaEnglish: 'Vayishlach', parshaHebrew: 'וַיִּשְׁלַח', status: 'Pending Audio' },
  { number: 9, parshaEnglish: 'Vayeishev', parshaHebrew: 'וַיֵּשֶׁב', status: 'Pending Audio' },
  { number: 10, parshaEnglish: 'Miketz', parshaHebrew: 'מִקֵּץ', status: 'Pending Audio' },
  { number: 11, parshaEnglish: 'Vayigash', parshaHebrew: 'וַיִּגַּשׁ', status: 'Pending Audio' },
  { number: 12, parshaEnglish: 'Vayechi', parshaHebrew: 'וַיְחִי', status: 'Pending Audio' },
  { number: 13, parshaEnglish: 'Shemot', parshaHebrew: 'שְׁמוֹת', status: 'Pending Audio' },
  { number: 14, parshaEnglish: 'Va’eira', parshaHebrew: 'וָאֵרָא', status: 'Pending Audio' },
  { number: 15, parshaEnglish: 'Bo', parshaHebrew: 'בֹּא', status: 'Pending Audio' },
  { number: 16, parshaEnglish: 'Beshalach', parshaHebrew: 'בְּשַׁלַּח', status: 'Pending Audio' },
  { number: 17, parshaEnglish: 'Yitro', parshaHebrew: 'יִתְרוֹ', status: 'In progress' },
  { number: 18, parshaEnglish: 'Mishpatim', parshaHebrew: 'מִשְׁפָּטִים', status: 'Pending Audio' },
  { number: 19, parshaEnglish: 'Terumah', parshaHebrew: 'תְּרוּמָה', status: 'Pending Audio' },
  { number: 20, parshaEnglish: 'Tetzaveh', parshaHebrew: 'תְּצַוֶּה', status: 'Pending Audio' },
  { number: 21, parshaEnglish: 'Ki Tisa', parshaHebrew: 'כִּי תִשָּׂא', status: 'Pending Audio' },
  { number: 22, parshaEnglish: 'Vayakhel', parshaHebrew: 'וַיַּקְהֵל', status: 'Pending Audio' },
  { number: 23, parshaEnglish: 'Pekudei', parshaHebrew: 'פְּקוּדֵי', status: 'Pending Audio' },
  { number: 24, parshaEnglish: 'Vayikra', parshaHebrew: 'וַיִּקְרָא', status: 'Pending Audio' },
  { number: 25, parshaEnglish: 'Tzav', parshaHebrew: 'צַו', status: 'Pending Audio' },
  { number: 26, parshaEnglish: 'Shemini', parshaHebrew: 'שְּׁמִינִי', status: 'Pending Audio' },
  { number: 27, parshaEnglish: 'Tazria', parshaHebrew: 'תַּזְרִיעַ', status: 'Pending Audio' },
  { number: 28, parshaEnglish: 'Metzora', parshaHebrew: 'מְּצֹרָע', status: 'Pending Audio' },
  { number: 29, parshaEnglish: 'Acharei Mot', parshaHebrew: 'אַחֲרֵי מוֹת', status: 'Pending Audio' },
  { number: 30, parshaEnglish: 'Kedoshim', parshaHebrew: 'קְדשִׁים', status: 'Pending Audio' },
  { number: 31, parshaEnglish: 'Emor', parshaHebrew: 'אֱמוֹר', status: 'Pending Audio' },
  { number: 32, parshaEnglish: 'Behar', parshaHebrew: 'בְּהַר', status: 'Pending Audio' },
  { number: 33, parshaEnglish: 'Bechukotai', parshaHebrew: 'בְּחֻקֹּתַי', status: 'Pending Audio' },
  { number: 34, parshaEnglish: 'Bamidbar', parshaHebrew: 'בְּמִדְבַּר', status: 'Pending Audio' },
  { number: 35, parshaEnglish: 'Naso', parshaHebrew: 'נָשֹׂא', status: 'Redo, please', comments: 'Aliyot 1-3, 5-7 are almost done. Aliyah 4th has different audios put together so it sounds off.' },
  { number: 36, parshaEnglish: 'Beha’alotecha', parshaHebrew: 'בְּהַעֲלֹתְךָ', status: 'Completed', comments: 'Shared on WhatsApp' },
  { number: 37, parshaEnglish: 'Shelach', parshaHebrew: 'שְׁלַח', status: 'Pending Audio' },
  { number: 38, parshaEnglish: 'Korach', parshaHebrew: 'קֹרַח', status: 'Pending Audio' },
  { number: 39, parshaEnglish: 'Chukat', parshaHebrew: 'חֻקַּת', status: 'Pending Audio' },
  { number: 40, parshaEnglish: 'Balak', parshaHebrew: 'בָּלָק', status: 'Pending Audio' },
  { number: 41, parshaEnglish: 'Pinchas', parshaHebrew: 'פִּינְחָס', status: 'Pending Audio' },
  { number: 42, parshaEnglish: 'Matot', parshaHebrew: 'מַטּוֹת', status: 'Pending Audio' },
  { number: 43, parshaEnglish: 'Masei', parshaHebrew: 'מַסְעֵי', status: 'Pending Audio' },
  { number: 44, parshaEnglish: 'Devarim', parshaHebrew: 'דְּבָרִים', status: 'Pending Audio' },
  { number: 45, parshaEnglish: 'Va’etchanan', parshaHebrew: 'וָאֶתְחַנַּן', status: 'Pending Audio' },
  { number: 46, parshaEnglish: 'Eikev', parshaHebrew: 'עֵקֶב', status: 'Pending Audio' },
  { number: 47, parshaEnglish: 'Re’eh', parshaHebrew: 'רְאֵה', status: 'Pending Audio' },
  { number: 48, parshaEnglish: 'Shoftim', parshaHebrew: 'שֹׁפְטִים', status: 'Pending Audio' },
  { number: 49, parshaEnglish: 'Ki Teitzei', parshaHebrew: 'כִּי תֵצֵא', status: 'Pending Audio' },
  { number: 50, parshaEnglish: 'Ki Tavo', parshaHebrew: 'כִּי תָבוֹא', status: 'Pending Audio' },
  { number: 51, parshaEnglish: 'Nitzavim', parshaHebrew: 'נִצָּבִים', status: 'Pending Audio' },
  { number: 52, parshaEnglish: 'Vayeilech', parshaHebrew: 'וַיֵּלֶךְ', status: 'Completed', comments: 'Shared on WhatsApp' },
  { number: 53, parshaEnglish: 'Ha’azinu', parshaHebrew: 'הַאֲזִינוּ', status: 'Completed', comments: 'Shared on WhatsApp' },
  { number: 54, parshaEnglish: "V'zot HaBerachah", parshaHebrew: 'וְזֹאת הַבְּרָכָה', status: 'Pending Audio' },
  { number: null, parshaEnglish: 'Rosh Chodesh', parshaHebrew: 'ראש חודש', status: 'Pending Audio' },
  { number: null, parshaEnglish: 'Parsha Zachor', parshaHebrew: 'פרשת זכור', status: 'Pending Audio' },
]
