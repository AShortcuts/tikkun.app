import { HDate } from '@hebcal/hdate'
import type { LeiningGenerator } from '../calendar-model/generator.ts'
import { readingTitle, type LeiningInstance, type LeiningRun } from '../calendar-model/model-types.ts'
import { listRecordings, parshaSlugForRun } from '../audio/library.ts'
import { isParshaAudioRecording, type AudioRecording } from '../audio/types.ts'
import {
  createAliyahNavigationActions,
  createNavigationAction,
  createPageNavigationActions,
  type NavigationAction,
} from '../navigation/actions.ts'
import { holidayLeiningKeywords, selectCommandPaletteHolidayRun } from '../navigation/holiday-actions.ts'
import { createLastReadingHash, loadEligibleLastReading } from '../reading/last-reading.ts'
import {
  generateParshaUrl,
  getParshaSearchTermsForSlug,
  resolveParshaRun,
  resolveReadingRun,
} from '../view-model/navigation/parsha-routes.ts'
import { isSemanticallyRoutableReaderHash } from '../view-model/navigation/routable-reader-hash.ts'
import { generateCueAnalyticsUrl, generatePageUrl } from '../view-model/navigation/url-parser.ts'
import type { ReaderBookmark } from './bookmarks.ts'
import type { Checkpoint } from './checkpoints.ts'

/** What the search catalog needs from the running Reader. */
export interface ReaderSearchActionHost {
  storage: Storage | null
  createCalendarGenerator(): LeiningGenerator
  navigate(hash: string): void
  openPrint(): void
  openMedia(): void
  openSettings(): void
  isCueAuthoringUnlocked(): boolean
  openCueAuthoring(): void
  /** The reading at the Reader's focal line, if one is shown. */
  currentReading(): { run: LeiningRun; displayTitle: string } | null
  checkpoints(): readonly Checkpoint[]
  bookmarks(): readonly ReaderBookmark[]
  jumpToCheckpoint(checkpoint: Checkpoint): void
}

export function displayTitleForLeiningRun(run: LeiningRun) {
  return readingTitle(run.leining).he || readingTitle(run.leining).en
}

/** The reading a bookmark belongs to, shown as its search badge. */
export function bookmarkReadingLabel(bookmark: ReaderBookmark, createCalendarGenerator: () => LeiningGenerator) {
  const runId = /^#\/run\/([^/]+)/.exec(bookmark.hash)?.[1]
  if (runId) {
    const run = resolveReadingRun(createCalendarGenerator(), runId)
    return run ? displayTitleForLeiningRun(run) : null
  }

  const parshaSlug = /^#\/(?:torah|esther)\/parsha\/([^/]+)/.exec(bookmark.hash)?.[1]
  return parshaSlug ? parshaSlug.replace(/-/g, ' ') : null
}

export function titleCaseBookmarkBadge(label: string) {
  if (!/[A-Za-z]/.test(label)) return label
  return label.replace(/\S+/g, (word) =>
    word.charAt(0).toLocaleUpperCase() + word.slice(1).toLocaleLowerCase()
  )
}

export function isBookmarkAction(action: NavigationAction) {
  return action.id.startsWith('checkpoint.bookmark:')
}

function upcomingHolidayLeiningActions(host: ReaderSearchActionHost) {
  const generator = host.createCalendarGenerator()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentHebrewYear = new HDate(today).getFullYear()
  const actions: NavigationAction[] = []
  const seenRuns = new Set<string>()

  for (let year = currentHebrewYear; year <= currentHebrewYear + 2; year += 1) {
    for (const leiningDate of generator.forHebrewYear(year)) {
      if (leiningDate.date < today) continue

      for (const leining of leiningDate.leinings) {
        const run = selectCommandPaletteHolidayRun(leining)
        if (!run || seenRuns.has(run.id)) continue

        seenRuns.add(run.id)
        const label = `${leiningDate.title.en} / ${leiningDate.title.he}`
        actions.push(
          createNavigationAction({
            id: `reading.holiday.${run.id}`,
            group: 'reading',
            label,
            aliases: [leiningDate.title.en, leiningDate.title.he],
            keywords: holidayLeiningKeywords(leiningDate.title, `${leining.id}`),
            showWhenEmpty: false,
            destinationId: createLastReadingHash(run),
            href: createLastReadingHash(run),
            run: () => host.navigate(createLastReadingHash(run)),
          })
        )
        if (actions.length >= 16) return actions
      }
    }
  }

  return actions
}

function searchableParshaActions(host: ReaderSearchActionHost) {
  const generator = host.createCalendarGenerator()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentHebrewYear = new HDate(today).getFullYear()
  const actions: NavigationAction[] = []
  const seenRuns = new Set<string>()

  for (let year = currentHebrewYear; year <= currentHebrewYear + 2; year += 1) {
    for (const leiningDate of generator.forHebrewYear(year)) {
      if (leiningDate.date < today) continue
      for (const leining of leiningDate.leinings) {
        if (!leining.isParsha) continue
        for (const run of leining.runs) {
          if (run.scroll !== 'torah' || seenRuns.has(run.id)) continue
          seenRuns.add(run.id)
          const parshaSlug = parshaSlugForRun(run)
          actions.push(
            ...createAliyahNavigationActions({
              run,
              displayTitle: displayTitleForLeiningRun(run),
              showWhenEmpty: false,
              dedupeKeyPrefix: parshaSlug ? `reading.parsha.${parshaSlug}` : undefined,
              navigate: (hash) => host.navigate(hash),
            })
          )
        }
      }
    }
  }

  return actions
}

function selectSearchableHolidayRuns(leining: LeiningInstance) {
  const run = selectCommandPaletteHolidayRun(leining)
  return run ? [run] : []
}

function searchableHolidayActions(host: ReaderSearchActionHost) {
  const generator = host.createCalendarGenerator()
  const today = new Date()
  const currentHebrewYear = new HDate(today).getFullYear()
  const actions: NavigationAction[] = []
  const seenRuns = new Set<string>()

  for (let year = currentHebrewYear; year <= currentHebrewYear + 1; year += 1) {
    for (const leiningDate of generator.forHebrewYear(year)) {
      for (const leining of leiningDate.leinings) {
        if (leining.isParsha) continue
        for (const run of selectSearchableHolidayRuns(leining)) {
          if (seenRuns.has(run.id)) continue
          seenRuns.add(run.id)
          actions.push(
            ...createAliyahNavigationActions({
              run,
              displayTitle: displayTitleForLeiningRun(run),
              showWhenEmpty: false,
              navigate: (hash) => host.navigate(hash),
            })
          )
        }
      }
    }
  }

  return actions
}

function recordingActionAliases(
  recording: Extract<AudioRecording, { reading: { kind: 'parsha' } }>
) {
  const terms = [
    recording.parshaSlug,
    recording.parshaName,
    ...getParshaSearchTermsForSlug(recording.parshaSlug),
  ]
  return [
    ...terms,
    ...terms.flatMap((term) => [
      `${term} ${recording.aliyah}`,
      `${term} Aliyah ${recording.aliyah}`,
    ]),
  ]
}

/** Every destination and tool offered by the command palette and the picker's search. */
export function createReaderSearchActions(host: ReaderSearchActionHost) {
  const actions: NavigationAction[] = [
    createNavigationAction({
      id: 'tools.print',
      group: 'tools',
      label: 'Print passage',
      aliases: ['Print', 'Print preview'],
      keywords: ['paper', 'pdf', 'aliyah'],
      emptyPriority: 41,
      run: () => host.openPrint(),
    }),
    createNavigationAction({
      id: 'reading.current',
      group: 'reading',
      label: 'Today / Next Reading',
      aliases: ['Today', 'Next Reading', 'Next Shabbat'],
      keywords: ['current reading', 'upcoming reading'],
      emptyPriority: 100,
      destinationId: '#/next',
      href: '#/next',
      run: () => host.navigate('#/next'),
    }),
    createNavigationAction({
      id: 'tools.analytics',
      group: 'tools',
      label: 'Cue Analytics',
      aliases: ['Playback Analytics', 'Word Analytics'],
      keywords: ['timing'],
      emptyPriority: 40,
      run: () => host.navigate(generateCueAnalyticsUrl()),
    }),
    createNavigationAction({
      id: 'tools.media',
      group: 'tools',
      label: 'Media & Storage',
      aliases: ['Downloads', 'Offline audio'],
      keywords: ['download', 'storage', 'recordings'],
      emptyPriority: 38,
      run: () => host.openMedia(),
    }),
    createNavigationAction({
      id: 'tools.settings',
      group: 'tools',
      label: 'Reader Settings',
      aliases: ['Preferences'],
      keywords: ['theme', 'highlight'],
      emptyPriority: 39,
      run: () => host.openSettings(),
    }),
    createNavigationAction({
      id: 'admin.open',
      group: 'admin',
      label: 'Cue Authoring',
      keywords: ['timing', 'authoring', 'record cues'],
      available: host.isCueAuthoringUnlocked(),
      emptyPriority: 30,
      run: () => host.openCueAuthoring(),
    }),
  ]

  actions.push(...upcomingHolidayLeiningActions(host))

  const current = host.currentReading()
  if (current) {
    const activeParshaSlug = current.run.leining.isParsha
      ? parshaSlugForRun(current.run)
      : null
    actions.push(
      ...createAliyahNavigationActions({
        run: current.run,
        displayTitle: current.displayTitle,
        dedupeKeyPrefix: activeParshaSlug
          ? `reading.parsha.${activeParshaSlug}`
          : undefined,
        emptyPriority: 85,
        showWhenEmpty: false,
        navigate: (hash) => host.navigate(hash),
      })
    )
  }

  for (const recording of listRecordings()) {
    if (recording.status !== 'available' || !isParshaAudioRecording(recording)) continue
    const resolved = resolveParshaRun(host.createCalendarGenerator(), recording.parshaSlug)
    const aliyah = resolved?.run.aliyot.find(
      (candidate) => candidate.index === recording.aliyah
    )
    const targetHash = resolved && aliyah
      ? createLastReadingHash(resolved.run, aliyah.start)
      : generateParshaUrl(recording.parshaSlug)
    actions.push(
      createNavigationAction({
        id: `reading.${recording.id}`,
        group: 'reading',
        label: `${recording.parshaName} Aliyah ${recording.aliyah}`,
        dedupeKey: `reading.parsha.${recording.parshaSlug}.${recording.aliyah}`,
        destinationId: targetHash,
        searchConstraint: {
          kind: 'aliyah',
          aliyah: recording.aliyah,
          allowTerms: ['recording', 'audio'],
        },
        href: targetHash,
        aliases: recordingActionAliases(recording),
        keywords: ['recording', 'audio'],
        showWhenEmpty: false,
        run: () => host.navigate(targetHash),
      })
    )
  }

  actions.push(...searchableParshaActions(host))
  actions.push(...searchableHolidayActions(host))
  actions.push(
    ...createPageNavigationActions({
      navigateToPage: (scroll, page) => host.navigate(generatePageUrl(scroll, page)),
    })
  )

  const lastReading = loadEligibleLastReading(
    host.storage,
    Date.now(),
    isSemanticallyRoutableReaderHash
  )
  if (lastReading) {
    actions.push(
      createNavigationAction({
        id: 'resume.last-reading',
        group: 'resume',
        label: `Resume ${lastReading.aliyahLabel ? `${lastReading.parshaName}, ${lastReading.aliyahLabel}` : lastReading.parshaName}`,
        aliases: ['Resume Reading', 'Last Reading'],
        keywords: ['resume', 'last reading'],
        emptyPriority: 95,
        destinationId: lastReading.hash,
        href: lastReading.hash,
        run: () => host.navigate(lastReading.hash),
      })
    )
  }

  for (const checkpoint of host.checkpoints()) {
    const bookmark = checkpoint.kind === 'bookmark'
      ? host.bookmarks().find((candidate) => candidate.id === checkpoint.id)
      : null
    actions.push(
      createNavigationAction({
        id: `checkpoint.${checkpoint.id}`,
        group: checkpoint.kind === 'bookmark' ? 'resume' : 'checkpoint',
        label: checkpoint.label,
        badgeLabel: bookmark ? bookmarkReadingLabel(bookmark, host.createCalendarGenerator) ?? undefined : undefined,
        keywords: ['bookmark', 'checkpoint', checkpoint.tokenKey],
        emptyPriority: checkpoint.kind === 'bookmark' ? 90 : 88,
        run: () => host.jumpToCheckpoint(checkpoint),
      })
    )
  }

  return actions
}
