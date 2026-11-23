// Data for the navigation prototype. Readings, dates and recordings are real; everything
// personal (preparing, bookmarks, progress, downloads) is sample data for the design review.
import { HDate, Sedra, parshiot } from '@hebcal/core'
import { recordingWorkRows } from '../../../../app/data/about-progress.ts'
import chayeiSarah from '../../../../text/pages/torah/23.json'

export interface Parsha { index: number; name: string; hebrew: string; recorded: boolean }
export interface Book { name: string; hebrew: string; parshiot: Parsha[] }

// One cue file per recorded parsha folder, such as "05 chayei-sarah"; keys only, nothing loads.
const recorded = new Set(Object.keys(import.meta.glob('/audio-cues/yoni-davidov/*/1.json'))
  .map(path => Number(/\/(\d+) [^/]+\/1\.json$/.exec(path)?.[1]) - 1))
// The app's own spellings, numbered 1-54; the calendar library only supplies dates.
const names = new Map(recordingWorkRows.filter(row => row.number).map(row => [row.number as number, row]))
const parsha = (index: number): Parsha => ({ index, name: names.get(index + 1)?.parshaEnglish ?? parshiot[index],
  hebrew: names.get(index + 1)?.parshaHebrew ?? parshiot[index], recorded: recorded.has(index) })
const bookRanges: [string, string, number, number][] = [
  ['Bereshit', 'בראשית', 0, 12], ['Shemot', 'שמות', 12, 23], ['Vayikra', 'ויקרא', 23, 33],
  ['Bamidbar', 'במדבר', 33, 43], ['Devarim', 'דברים', 43, 54],
]
export const books: Book[] = bookRanges.map(([name, he, from, to]) => ({
  name, hebrew: he, parshiot: Array.from({ length: to - from }, (_, i) => parsha(from + i)).filter(p => p.name),
}))
export const recordedCount = recorded.size

export interface Upcoming { date: Date; parsha: Parsha; daysAway: number }
export function upcoming(today = new Date(), count = 3): Upcoming[] {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const result: Upcoming[] = []
  for (let week = 0; result.length < count && week < 8; week++) {
    const date = new Date(start)
    date.setDate(start.getDate() + ((6 - start.getDay() + 7) % 7) + week * 7)
    const hd = new HDate(date)
    const names = new Sedra(hd.getFullYear(), false).get(hd)
    const index = parshiot.indexOf(names[0])
    if (index < 0) continue
    result.push({ date, parsha: parsha(index), daysAway: Math.round((date.getTime() - start.getTime()) / 86_400_000) })
  }
  return result
}

export const aliyahNames = ['Rishon', 'Sheni', 'Shlishi', "Revi'i", 'Chamishi', 'Shishi', "Shvi'i"]

// Sample personal data, shaped like what the app stores on the device.
export const sample = {
  preparing: { parshaIndex: 5, aliyot: [4, 5, 6, 7], practiced: [4, 5], reminder: 'Sunday and Wednesday at 7:30 pm' },
  continueReading: { parshaIndex: 4, aliyah: 3, position: '1:48', length: '4:12' },
  bookmarks: [
    { label: 'Chayei Sarah 24:1', note: 'Start of Revi\'i' },
    { label: 'Toldot 27:30', note: 'Tricky trop' },
    { label: 'Vayera 22:1', note: 'Akeidah' },
  ],
  // Sizes of the real recordings folders on disk.
  downloads: [{ parshaIndex: 4, megabytes: 25.5 }, { parshaIndex: 5, megabytes: 15.8 }],
  newRecordings: [5, 6],
  storageMegabytes: { recordings: 41.3, text: 2.3, available: 31_800 },
}

// The opening of Chayei Sarah from Bereshit 23:1, the real Torah text of page 23, without
// the text's paragraph markers such as #(פ).
const pageLines = chayeiSarah as { text: string[][]; verses: { chapter: number; verse: number }[] }[]
const opening = pageLines.findIndex(line => line.verses.some(ref => ref.chapter === 23 && ref.verse === 1))
export const passage: string[] = pageLines.slice(opening, opening + 14)
  .map(line => line.text.flat().join(' ').replace(/#\([^)]*\)/g, '').trim())

export const whatsNew = [
  { title: 'Readings from your phone, always current', body: 'New recordings and corrected highlighting arrive as soon as they are published.' },
  { title: 'Print your Tikkun pages', body: 'Print one aliyah or a whole reading, in the layout you read in.' },
  { title: 'A clearer version number', body: 'Settings shows which version you have and whether it is the latest.' },
]
