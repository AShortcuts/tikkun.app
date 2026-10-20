import { expect, test, vi } from 'vitest'
import type { LineType } from '../components/Page.ts'
import { ScrollResolver } from '../location.ts'
import { canonicalLineWords } from '../reader/canonical-line-words.ts'
import { loadPassageSelection, projectPassageWords } from './passage-selection.ts'

test('projects maqaf expansion, ktiv/kri, and column/fragment offsets without reindexing', () => {
  const line: LineType = {
    text: [['קודם־לזה׃', 'הוצא#[הַיְצֵ֣א] וְאֶת־כָּל־אֲשֶׁר׃ אחרי']],
    verses: [], aliyot: [], isPetucha: false,
  }
  const selected = new Set(['9:0:1:0', '9:0:1:1'])
  const projection = projectPassageWords([{ pageNumber: 9, lines: [line] }], selected)
  expect(projection.annotated).toEqual(selected)
  expect(projection.unannotated).toEqual(new Set(['9:0:1:0', '9:0:1:1', '9:0:1:2', '9:0:1:3']))
  expect(projection.unannotatedKeysByAnnotated.get('9:0:1:1')).toEqual(['9:0:1:1', '9:0:1:2', '9:0:1:3'])
  expect(projection.unannotatedVerseEnds).toEqual(new Set(['9:0:1:3']))
})

test('keeps both inverted-nun decorations while canonical keys retain the gaps', () => {
  const line: LineType = {
    text: [['(׆)#וַיְהִי בִּנְסֹעַ׃#(׆)#(פ)']], verses: [], aliyot: [], isPetucha: false,
  }
  const canonical = canonicalLineWords(3, 0, line)
  const projection = projectPassageWords([{ pageNumber: 3, lines: [line] }], new Set(canonical.map(word => word.tokenKey)))
  expect(canonical.map(word => word.tokenKey)).toEqual(['3:0:0:1', '3:0:0:2'])
  expect(projection.annotated).toEqual(new Set(['3:0:0:0', '3:0:0:1', '3:0:0:2', '3:0:0:3']))
})

test('requires actual sof-pasuk before returning a loaded selection', async () => {
  const ref = { scroll: 'torah' as const, b: 1, c: 1, v: 1 }
  const resolver = new ScrollResolver('torah', { getPageCount: () => 1, getLocation: () => ({ pageNumber: 1, lineNumber: 1 }) })
  const loadPage = vi.fn(async (): Promise<LineType[]> => [{ text: [['טקסט חסר סיום']], verses: [{ book: 1, chapter: 1, verse: 1 }], aliyot: [], isPetucha: false }])
  await expect(loadPassageSelection([{ start: ref, end: ref }], { resolver, loadPage })).rejects.toThrow('Missing verse ending')
  expect(loadPage).toHaveBeenCalledOnce()
})

test('loads preceding boundary context but excludes its page from the selected output', async () => {
  const ref = { scroll: 'torah' as const, b: 1, c: 1, v: 2 }
  const resolver = new ScrollResolver('torah', { getPageCount: () => 2, getLocation: () => ({ pageNumber: 2, lineNumber: 1 }) })
  const loadPage = vi.fn(async (page: number): Promise<LineType[]> => [{
    text: [[page === 1 ? 'פסוק קודם' : 'סופו׃ נבחר׃ שכן׃']],
    verses: page === 1 ? [{ book: 1, chapter: 1, verse: 1 }] : [{ book: 1, chapter: 1, verse: 2 }, { book: 1, chapter: 1, verse: 3 }],
    aliyot: [], isPetucha: false,
  }])
  const selection = await loadPassageSelection([{ start: ref, end: ref }], { resolver, loadPage })
  expect(selection.pages.map(page => page.pageNumber)).toEqual([2])
  expect(selection.tokenKeys).toEqual(new Set(['2:0:0:1']))
  expect(loadPage).toHaveBeenCalledTimes(2)
})
