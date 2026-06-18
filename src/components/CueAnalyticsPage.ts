import {
  getCueAnalyticsAliyahSummaries,
  getCueAnalyticsOverview,
  getCueAnalyticsParshaSummaries,
  listCueAnalyticsRecords,
  type CueAnalyticsAliyahSummary,
  type CueAnalyticsParshaSummary,
  type CueAnalyticsRecord,
  type CueIntervalSample,
} from '../audio/cue-analytics.ts'
import {
  getCueProgressForRecording,
  listRecordings,
} from '../audio/library.ts'
import { loadAdminDraft, readAdminDraftSummary } from '../admin/draft-storage.ts'
import type { WordCue } from '../audio/types.ts'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import hebrewNumeral from '../hebrew-numeral.ts'
import {
  generateParshaUrl,
  resolveParshaRun,
} from '../view-model/navigation/parsha-routes.ts'
import { generateAboutUrl } from '../view-model/navigation/url-parser.ts'

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
})
const analyticsTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})
const analyticsRouteGenerator = new LeiningGenerator({
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
})
const analyticsRouteCache = new Map<string, ReturnType<typeof resolveParshaRun>>()

function resolveAnalyticsParshaRun(parshaSlug: string) {
  if (!analyticsRouteCache.has(parshaSlug)) {
    analyticsRouteCache.set(
      parshaSlug,
      resolveParshaRun(analyticsRouteGenerator, parshaSlug)
    )
  }

  return analyticsRouteCache.get(parshaSlug) ?? null
}

function generateAnalyticsAliyahUrl(parshaSlug: string, aliyah: number) {
  const resolved = resolveAnalyticsParshaRun(parshaSlug)
  const startRef = resolved?.run.aliyot.find((candidate) => candidate.index === aliyah)?.start

  return generateParshaUrl(resolved?.canonicalSlug ?? parshaSlug, startRef)
}

function formatSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0.00s'
  return `${seconds.toFixed(2)}s`
}

function formatSignedSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds === 0) return '0.00s'
  return `${seconds > 0 ? '+' : '-'}${Math.abs(seconds).toFixed(2)}s`
}

function formatWordsPerMinute(wordsPerMinute: number) {
  if (!Number.isFinite(wordsPerMinute) || wordsPerMinute <= 0) return '0 wpm'
  return `${numberFormatter.format(Math.round(wordsPerMinute))} wpm`
}

function formatTimedSpan(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const wholeSeconds = Math.round(seconds)
  const minutes = Math.floor(wholeSeconds / 60)
  const remainder = wholeSeconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function formatUpdatedAt(timestamp: number | null) {
  return timestamp ? analyticsTimeFormat.format(timestamp) : 'Unknown save time'
}

function describeSelection(parshaName: string | null, aliyah: number | null) {
  if (parshaName && aliyah) return `${parshaName}, aliyah ${hebrewNumeral(aliyah)}`
  if (parshaName) return `${parshaName}, all available aliyot`
  if (aliyah) return `all parshiot, aliyah ${hebrewNumeral(aliyah)}`
  return 'all playback timing data'
}

function getPointDatasetValue(point: Element, key: string) {
  const value = point.getAttribute(`data-${key}`)
  return value ?? ''
}

function getSourceLabel(record: CueAnalyticsRecord) {
  return record.cueSource === 'draft' ? 'Local draft' : 'Published timing'
}

function describeThreshold(sample: CueIntervalSample) {
  if (sample.outlierDirection === 'invalid') return 'Timing moved backward.'
  if (!sample.thresholdGap || !sample.thresholdDirection) return 'No review threshold crossed.'

  return `Review threshold ${sample.thresholdDirection === 'above' ? '>' : '<'} ${formatSeconds(sample.thresholdGap)}`
}

function describeDeviation(sample: CueIntervalSample) {
  return `${formatSignedSeconds(sample.deviationSeconds)} vs median gap ${formatSeconds(sample.localMedianGap)}`
}

function bindAnalyticsGraphInteractions(scope: ParentNode) {
  for (const graph of scope.querySelectorAll<HTMLElement>('[data-analytics-graph]')) {
    const stage = graph.querySelector<HTMLElement>('.analytics-graph-stage')
    const svg = graph.querySelector<SVGSVGElement>('[data-analytics-graph-svg]')
    const tooltip = graph.querySelector<HTMLElement>('[data-analytics-graph-tooltip]')
    const focusLine = graph.querySelector<SVGLineElement>('[data-analytics-graph-focus-line]')
    const focusPoint = graph.querySelector<SVGCircleElement>('[data-analytics-graph-focus-point]')
    const points = Array.from(
      graph.querySelectorAll<SVGCircleElement>('[data-analytics-graph-point]')
    )

    if (!stage || !svg || !tooltip || !focusLine || !focusPoint || !points.length) continue

    const top = Number(svg.dataset.graphTop ?? '0')
    const bottom = Number(svg.dataset.graphBottom ?? '0')
    const left = Number(svg.dataset.graphLeft ?? '0')
    const right = Number(svg.dataset.graphRight ?? '0')
    let activePoint: SVGCircleElement | null = null

    const clearActivePoint = () => {
      activePoint?.classList.remove('is-active')
      activePoint = null
      graph.classList.remove('is-active')
      tooltip.hidden = true
      focusLine.setAttribute('visibility', 'hidden')
      focusPoint.setAttribute('visibility', 'hidden')
    }

    const setActivePoint = (point: SVGCircleElement) => {
      if (activePoint === point) return

      activePoint?.classList.remove('is-active')
      activePoint = point
      activePoint.classList.add('is-active')
      graph.classList.add('is-active')

      const x = Number(getPointDatasetValue(point, 'x'))
      const y = Number(getPointDatasetValue(point, 'y'))
      const cueNumber = getPointDatasetValue(point, 'cue-number')
      const previousCueNumber = getPointDatasetValue(point, 'previous-cue-number')
      const gap = getPointDatasetValue(point, 'gap')
      const pace = getPointDatasetValue(point, 'pace')
      const reviewLabel = getPointDatasetValue(point, 'review-label')
      const threshold = getPointDatasetValue(point, 'threshold')
      const deviation = getPointDatasetValue(point, 'deviation')

      focusLine.setAttribute('x1', `${x}`)
      focusLine.setAttribute('x2', `${x}`)
      focusLine.setAttribute('y1', `${top}`)
      focusLine.setAttribute('y2', `${bottom}`)
      focusLine.setAttribute('visibility', 'visible')
      focusPoint.setAttribute('cx', `${x}`)
      focusPoint.setAttribute('cy', `${y}`)
      focusPoint.setAttribute('visibility', 'visible')

      tooltip.innerHTML = `
        <strong>Word ${previousCueNumber} → ${cueNumber}</strong>
        <span>${gap}s gap · ${pace} wpm</span>
        <span>${reviewLabel || 'Within expected range'}</span>
        <span>${threshold}</span>
        <span>${deviation}</span>
      `
      tooltip.hidden = false

      const stageRect = stage.getBoundingClientRect()
      const rect = svg.getBoundingClientRect()
      const viewBox = svg.viewBox.baseVal
      const offsetX =
        rect.left - stageRect.left + (viewBox.width ? (x / viewBox.width) * rect.width : 0)
      const offsetY =
        rect.top - stageRect.top + (viewBox.height ? (y / viewBox.height) * rect.height : 0)
      tooltip.style.setProperty('--analytics-tooltip-x', `${offsetX}px`)
      tooltip.style.setProperty('--analytics-tooltip-y', `${offsetY}px`)
    }

    svg.addEventListener('pointermove', (event) => {
      const rect = svg.getBoundingClientRect()
      const viewBox = svg.viewBox.baseVal
      const pointerX =
        ((event.clientX - rect.left) / Math.max(rect.width, 1)) * viewBox.width
      const pointerY =
        ((event.clientY - rect.top) / Math.max(rect.height, 1)) * viewBox.height

      if (pointerX < left || pointerX > right || pointerY < top || pointerY > bottom) {
        clearActivePoint()
        return
      }

      const nearestPoint = points.reduce((closest, point) => {
        if (!closest) return point
        const distance = Math.abs(Number(getPointDatasetValue(point, 'x')) - pointerX)
        const closestDistance = Math.abs(
          Number(getPointDatasetValue(closest, 'x')) - pointerX
        )
        return distance < closestDistance ? point : closest
      }, null as SVGCircleElement | null)

      if (nearestPoint) setActivePoint(nearestPoint)
    })

    svg.addEventListener('pointerleave', clearActivePoint)
    stage.addEventListener('pointerleave', clearActivePoint)

    for (const point of points) {
      point.addEventListener('mouseenter', () => setActivePoint(point))
      point.addEventListener('focus', () => setActivePoint(point))
      point.addEventListener('blur', clearActivePoint)
    }
  }
}

function renderGraph(samples: CueIntervalSample[], averageWordsPerMinute: number) {
  if (!samples.length) return ''

  const width = 560
  const height = 190
  const paddingLeft = 54
  const paddingRight = 14
  const paddingTop = 18
  const paddingBottom = 30
  const values = samples.map((sample) => sample.wordsPerMinute)
  const min = Math.min(...values, averageWordsPerMinute)
  const max = Math.max(...values, averageWordsPerMinute)
  const range = max - min || 1
  const usableWidth = width - paddingLeft - paddingRight
  const usableHeight = height - paddingTop - paddingBottom
  const getX = (index: number) =>
    paddingLeft +
    (samples.length === 1 ? usableWidth / 2 : (index / (samples.length - 1)) * usableWidth)
  const getY = (value: number) =>
    height - paddingBottom - ((value - min) / range) * usableHeight

  const points = samples.map((sample, index) => ({
    sample,
    x: getX(index),
    y: getY(sample.wordsPerMinute),
  }))
  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1]!.x.toFixed(2)} ${(height - paddingBottom).toFixed(2)} L ${points[0]!.x.toFixed(2)} ${(height - paddingBottom).toFixed(2)} Z`
  const averageY = getY(averageWordsPerMinute)
  const tickValues = [max, (max + min) / 2, min]

  return `
    <div class="analytics-graph" data-analytics-graph>
      <div class="analytics-graph-header">
        <div class="analytics-legend" aria-label="Chart legend">
          <span><i class="mod-line"></i>Pace trace</span>
          <span><i class="mod-average"></i>Average pace</span>
          <span><i class="mod-outlier"></i>Review outlier</span>
        </div>
      </div>
      <div class="analytics-graph-stage">
      <span class="analytics-axis-title analytics-axis-title-y">Pace (words per minute)</span>
      <svg
        viewBox="0 0 ${width} ${height}"
        role="img"
        aria-label="Word speed graph with average pace and review markers"
        data-analytics-graph-svg
        data-graph-left="${paddingLeft}"
        data-graph-right="${width - paddingRight}"
        data-graph-top="${paddingTop}"
        data-graph-bottom="${height - paddingBottom}"
      >
        ${tickValues
          .map(
            (value) => `
              <g>
                <line
                  x1="${paddingLeft}"
                  y1="${getY(value).toFixed(2)}"
                  x2="${width - paddingRight}"
                  y2="${getY(value).toFixed(2)}"
                  class="analytics-graph-grid"
                />
                <text
                  x="${paddingLeft - 8}"
                  y="${(getY(value) + 4).toFixed(2)}"
                  text-anchor="end"
                  class="analytics-graph-tick"
                >${Math.round(value)}</text>
              </g>
            `
          )
          .join('')}
        <line
          x1="${paddingLeft}"
          y1="${averageY.toFixed(2)}"
          x2="${width - paddingRight}"
          y2="${averageY.toFixed(2)}"
          class="analytics-graph-average"
        />
        <line
          x1="${paddingLeft}"
          y1="${paddingTop}"
          x2="${paddingLeft}"
          y2="${height - paddingBottom}"
          class="analytics-graph-focus-line"
          data-analytics-graph-focus-line
          visibility="hidden"
        />
        <path d="${areaPath}" class="analytics-graph-fill" />
        <path d="${linePath}" class="analytics-graph-line" />
        ${points
          .map((point) => {
            const pointClass = point.sample.isOutlier ? ' analytics-graph-outlier' : ''

            return `
              <circle
                cx="${point.x.toFixed(2)}"
                cy="${point.y.toFixed(2)}"
                r="${point.sample.isOutlier ? '4.5' : '3.4'}"
                class="analytics-graph-point${pointClass}"
                data-analytics-graph-point
                data-x="${point.x.toFixed(2)}"
                data-y="${point.y.toFixed(2)}"
                data-cue-number="${point.sample.cueNumber}"
                data-previous-cue-number="${point.sample.previousCueNumber}"
                data-gap="${point.sample.gap.toFixed(2)}"
                data-pace="${Math.round(point.sample.wordsPerMinute)}"
                data-review-label="${point.sample.reviewLabel}"
                data-threshold="${describeThreshold(point.sample)}"
                data-deviation="${describeDeviation(point.sample)}"
                tabindex="0"
              />
            `
          })
          .join('')}
        <circle
          cx="${paddingLeft}"
          cy="${height - paddingBottom}"
          r="6"
          class="analytics-graph-focus-point"
          data-analytics-graph-focus-point
          visibility="hidden"
        />
      </svg>
      <div class="analytics-graph-tooltip" data-analytics-graph-tooltip hidden></div>
      </div>
      <p class="analytics-graph-axis-caption">Word progression through the aliyah</p>
      <p class="analytics-graph-copy">
        Each point shows the pace between two saved Words. Review markers flag out-of-order timestamps and long pauses.
      </p>
    </div>
  `
}

function renderLoadingState(copy: string) {
  return `
    <div class="about-card-header">
      <h2>Loading playback analytics</h2>
      <p>${copy}</p>
    </div>
  `
}

function renderOverview(records: CueAnalyticsRecord[], selectionLabel: string) {
  const overview = getCueAnalyticsOverview(records)

  if (!records.length) {
    return `
      <div class="about-card-header">
        <h2>Selection overview</h2>
        <p>No timing matches ${selectionLabel} yet. Use the coverage view below to find recordings that still need timing.</p>
      </div>
    `
  }

  return `
    <div class="about-card-header">
      <h2>Selection overview</h2>
      <p>Current view: ${selectionLabel}.</p>
    </div>
    <div class="analytics-summary-grid">
      <div class="analytics-summary-item">
        <span class="analytics-stat-label">Authored recordings</span>
        <strong class="analytics-stat-value">${overview.recordingCount}</strong>
      </div>
      <div class="analytics-summary-item">
        <span class="analytics-stat-label">Total Words</span>
        <strong class="analytics-stat-value">${numberFormatter.format(overview.cueCount)}</strong>
      </div>
      <div class="analytics-summary-item">
        <span class="analytics-stat-label">Average pace</span>
        <strong class="analytics-stat-value">${formatWordsPerMinute(overview.averageWordsPerMinute)}</strong>
      </div>
      <div class="analytics-summary-item">
        <span class="analytics-stat-label">Median gap</span>
        <strong class="analytics-stat-value">${formatSeconds(overview.medianGap)}</strong>
      </div>
      <div class="analytics-summary-item">
        <span class="analytics-stat-label">Review transitions</span>
        <strong class="analytics-stat-value">${overview.outlierCount}</strong>
      </div>
      <div class="analytics-summary-item">
        <span class="analytics-stat-label">Invalid transitions</span>
        <strong class="analytics-stat-value">${overview.invalidTransitionCount}</strong>
      </div>
    </div>
  `
}

function renderAliyahAverages(summaries: CueAnalyticsAliyahSummary[], selectionLabel: string) {
  const visibleSummaries = summaries.filter((summary) => summary.recordingCount > 0)

  if (!visibleSummaries.length) {
    return `
      <div class="about-card-header">
        <h2>Average by aliyah</h2>
        <p>No timing is available for ${selectionLabel} yet.</p>
      </div>
    `
  }

  return `
    <div class="about-card-header">
      <h2>Average by aliyah</h2>
      <p>Averages within ${selectionLabel}.</p>
    </div>
    <div class="analytics-aliyah-grid">
      ${visibleSummaries
        .map(
          (summary) => `
            <article class="analytics-aliyah-module">
              <h3>Aliyah ${hebrewNumeral(summary.aliyah)}</h3>
              <p>${summary.recordingCount} recordings</p>
              <dl class="analytics-inline-stats">
                <div>
                  <dt>Average pace</dt>
                  <dd>${formatWordsPerMinute(summary.averageWordsPerMinute)}</dd>
                </div>
                <div>
                  <dt>Median gap</dt>
                  <dd>${formatSeconds(summary.medianGap)}</dd>
                </div>
                <div>
                  <dt>Review transitions</dt>
                  <dd>${summary.outlierCount}</dd>
                </div>
                <div>
                  <dt>Longest gap</dt>
                  <dd>${formatSeconds(summary.longestGap)}</dd>
                </div>
              </dl>
            </article>
          `
        )
        .join('')}
    </div>
  `
}

function renderCoverage(
  parshaSummaries: CueAnalyticsParshaSummary[],
  draftAliyotByParsha: Map<string, number[]>,
  completeAliyotByParsha: Map<string, number[]>,
  selectedParsha: string,
  selectedAliyah: number
) {
  const visibleSummaries = parshaSummaries.filter(
    (summary) => !selectedParsha || summary.parshaSlug === selectedParsha
  )

  return `
    <div class="about-card-header">
      <h2>Coverage by parsha</h2>
      <p>Every parsha with audio, which aliyot have timing, and which ones still need work.</p>
    </div>
    <div class="analytics-coverage-legend">
      <span><i class="mod-draft"></i>Local draft active</span>
      <span><i class="mod-cued"></i>Completed timing</span>
      <span><i class="mod-missing"></i>Timing missing</span>
      <span><i class="mod-empty"></i>No audio in this slot</span>
    </div>
    <div class="analytics-coverage-list">
      ${visibleSummaries
        .map((summary) => {
          const draftAliyot = draftAliyotByParsha.get(summary.parshaSlug) ?? []
          const completeAliyot = completeAliyotByParsha.get(summary.parshaSlug) ?? []
          const missingAliyot = summary.availableAliyot.filter(
            (aliyah) => !completeAliyot.includes(aliyah) && !draftAliyot.includes(aliyah)
          )
          const selectedAliyahStatus =
            selectedAliyah <= 0
              ? ''
              : summary.availableAliyot.includes(selectedAliyah)
                ? draftAliyot.includes(selectedAliyah)
                  ? `Aliyah ${hebrewNumeral(selectedAliyah)} currently uses a local draft.`
                  : completeAliyot.includes(selectedAliyah)
                    ? `Aliyah ${hebrewNumeral(selectedAliyah)} already has timing.`
                    : `Aliyah ${hebrewNumeral(selectedAliyah)} has audio and still needs timing.`
                : `Aliyah ${hebrewNumeral(selectedAliyah)} has no audio recording in this parsha.`

          return `
            <article class="analytics-coverage-card">
              <div class="analytics-coverage-header">
                <div>
                  <h3>${summary.parshaName}</h3>
                  <p>${completeAliyot.length} complete · ${draftAliyot.length} draft · ${missingAliyot.length} missing${selectedAliyahStatus ? ` · ${selectedAliyahStatus}` : ''}</p>
                </div>
                <dl class="analytics-coverage-stats">
                  <div>
                    <dt>Average pace</dt>
                    <dd>${formatWordsPerMinute(summary.averageWordsPerMinute)}</dd>
                  </div>
                  <div>
                    <dt>Median gap</dt>
                    <dd>${formatSeconds(summary.medianGap)}</dd>
                  </div>
                  <div>
                    <dt>Missing timing</dt>
                    <dd>${missingAliyot.length ? missingAliyot.map((aliyah) => hebrewNumeral(aliyah)).join(', ') : 'None'}</dd>
                  </div>
                </dl>
              </div>
              <div class="analytics-coverage-strip">
                ${Array.from({ length: 7 }, (_, index) => index + 1)
                  .map((aliyah) => {
                    const state = draftAliyot.includes(aliyah)
                      ? 'mod-draft'
                      : completeAliyot.includes(aliyah)
                        ? 'mod-cued'
                        : summary.availableAliyot.includes(aliyah)
                          ? 'mod-missing'
                          : 'mod-empty'
                    const selectedClass =
                      selectedAliyah === aliyah ? ' is-selected' : ''
                    const href = generateAnalyticsAliyahUrl(summary.parshaSlug, aliyah)
                    return `
                      <a
                        class="analytics-coverage-pill ${state}${selectedClass}"
                        href="${href}"
                        aria-label="Open ${summary.parshaName}, aliyah ${hebrewNumeral(aliyah)}"
                      >
                        ${hebrewNumeral(aliyah)}
                      </a>
                    `
                  })
                  .join('')}
              </div>
            </article>
          `
        })
        .join('')}
    </div>
  `
}

function renderTransitionReview(records: CueAnalyticsRecord[], selectionLabel: string) {
  const outliers = records
    .flatMap((record) =>
      record.intervalSamples
        .filter((sample) => sample.isOutlier)
        .map((sample) => ({
          record,
          sample,
        }))
    )
    .sort((left, right) => right.sample.severity - left.sample.severity)
    .slice(0, 12)

  if (!outliers.length) {
    return `
      <div class="about-card-header">
        <h2>Transition review</h2>
        <p>No review transitions were detected in ${selectionLabel}. Only clear issues are shown here, so the Word spacing looks stable.</p>
      </div>
    `
  }

  return `
    <div class="about-card-header">
      <h2>Transition review</h2>
      <p>Transitions worth checking in ${selectionLabel}. This list only shows out-of-order Words and very long pauses.</p>
    </div>
    <div class="analytics-outlier-list">
      ${outliers
        .map(
          ({ record, sample }) => `
            <article class="analytics-outlier-row">
              <div>
                <p class="analytics-outlier-title">${record.recording.parshaName} · Aliyah ${hebrewNumeral(record.recording.aliyah)}</p>
                <p class="analytics-outlier-copy">Word ${sample.previousCueNumber} → ${sample.cueNumber} · ${record.narratorName} · ${getSourceLabel(record)}</p>
                <p class="analytics-outlier-copy">${describeThreshold(sample)} · ${describeDeviation(sample)}</p>
              </div>
              <div class="analytics-outlier-metrics">
                <strong>${formatSeconds(sample.gap)}</strong>
                <span>${formatWordsPerMinute(sample.wordsPerMinute)}</span>
                <span>${sample.reviewLabel}</span>
              </div>
            </article>
          `
        )
        .join('')}
    </div>
  `
}

function renderRecordModule(record: CueAnalyticsRecord) {
  return `
    <article class="about-card analytics-module stack small">
      <div class="analytics-module-header">
        <div>
          <p class="about-eyebrow">Aliyah ${hebrewNumeral(record.recording.aliyah)}</p>
          <h2>${record.recording.parshaName} · ${record.recording.title}</h2>
          <p class="about-copy analytics-meta">${record.narratorName} · ${getSourceLabel(record)} · ${record.cueCount} Words · ${formatTimedSpan(record.totalDuration)} timed span · ${formatUpdatedAt(record.cueUpdatedAt)}</p>
        </div>
        <div class="analytics-module-callout">
          <span class="analytics-stat-label">Review transitions</span>
          <strong class="analytics-stat-value">${record.outlierCount}</strong>
        </div>
      </div>
      <div class="analytics-stat-grid">
        <div class="analytics-stat">
          <span class="analytics-stat-label">Average pace</span>
          <strong class="analytics-stat-value">${formatWordsPerMinute(record.averageWordsPerMinute)}</strong>
        </div>
        <div class="analytics-stat">
          <span class="analytics-stat-label">Median gap</span>
          <strong class="analytics-stat-value">${formatSeconds(record.medianGap)}</strong>
        </div>
        <div class="analytics-stat">
          <span class="analytics-stat-label">Longest gap</span>
          <strong class="analytics-stat-value">${formatSeconds(record.longestGap)}</strong>
        </div>
        <div class="analytics-stat">
          <span class="analytics-stat-label">Invalid transitions</span>
          <strong class="analytics-stat-value">${record.invalidTransitionCount}</strong>
        </div>
      </div>
      ${renderGraph(record.intervalSamples, record.averageWordsPerMinute)}
    </article>
  `
}

export default function CueAnalyticsPage() {
  return `
    <section class="about-view analytics-view stack large" data-analytics-root="true">
      <div class="about-hero analytics-hero stack small">
        <div class="analytics-toolbar">
          <a class="analytics-back-link" href="${generateAboutUrl()}">Back to About</a>
          <span class="about-eyebrow">Playback Analytics</span>
        </div>
        <h1 class="about-title analytics-title">A clear view of pacing across each aliyah.</h1>
        <p class="about-copy">
          This page reads saved playback timing and local drafts. It shows pace,
          timing issues worth checking, and recordings that still need work.
        </p>
        <section class="about-card analytics-filter-card">
          <div class="analytics-filter-grid">
            <label class="analytics-filter-field">
              <span>Parsha</span>
              <select data-analytics-filter="parsha" disabled>
                <option value="">Loading parshiot…</option>
              </select>
            </label>
            <label class="analytics-filter-field">
              <span>Aliyah</span>
              <select data-analytics-filter="aliyah">
                <option value="">All aliyot</option>
                ${Array.from({ length: 7 }, (_, index) => index + 1)
                  .map(
                    (aliyah) => `
                      <option value="${aliyah}">Aliyah ${hebrewNumeral(aliyah)}</option>
                    `
                  )
                  .join('')}
              </select>
            </label>
          </div>
        </section>
      </div>

      <section class="about-card analytics-summary-card stack small" data-analytics-section="overview">
        ${renderLoadingState('Loading timing and local drafts…')}
      </section>
      <section class="about-card stack small" data-analytics-section="coverage">
        ${renderLoadingState('Building the coverage view…')}
      </section>
      <details class="analytics-details about-catalog-details stack small">
        <summary class="about-card about-catalog-summary analytics-details-summary">
          <svg class="about-catalog-chevron lucide lucide-chevron-right-icon lucide-chevron-right" xmlns="http://www.w3.org/2000/svg" width="24" height="24"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m9 18 6-6-6-6"/></svg>
          <span class="about-card-header">
            <span>
              <span class="about-catalog-title">Detailed playback breakdown</span>
              <span class="about-catalog-copy">Average by aliyah, transition review, and individual recording graphs.</span>
            </span>
          </span>
        </summary>
        <div class="analytics-details-content stack medium">
          <section class="about-card stack small" data-analytics-section="aliyah-averages">
            ${renderLoadingState('Calculating aliyah-level averages…')}
          </section>
          <section class="about-card stack small" data-analytics-section="outliers">
            ${renderLoadingState('Reviewing timing transitions…')}
          </section>
          <section class="analytics-modules stack medium" data-analytics-section="records"></section>
        </div>
      </details>
    </section>
  `
}

export async function mountCueAnalyticsPage(container: HTMLElement) {
  const root = container.querySelector<HTMLElement>('[data-analytics-root="true"]')
  if (!root) return

  const parshaSelect = root.querySelector<HTMLSelectElement>('[data-analytics-filter="parsha"]')
  const aliyahSelect = root.querySelector<HTMLSelectElement>('[data-analytics-filter="aliyah"]')
  const overviewSection = root.querySelector<HTMLElement>('[data-analytics-section="overview"]')
  const coverageSection = root.querySelector<HTMLElement>('[data-analytics-section="coverage"]')
  const aliyahSection = root.querySelector<HTMLElement>(
    '[data-analytics-section="aliyah-averages"]'
  )
  const outliersSection = root.querySelector<HTMLElement>('[data-analytics-section="outliers"]')
  const recordsSection = root.querySelector<HTMLElement>('[data-analytics-section="records"]')

  if (
    !parshaSelect ||
    !aliyahSelect ||
    !overviewSection ||
    !coverageSection ||
    !aliyahSection ||
    !outliersSection ||
    !recordsSection
  ) {
    return
  }

  const availableRecordings = listRecordings().filter((entry) => entry.status === 'available')
  const cueOverrides = new Map<string, WordCue[]>()
  const cueSourceByAudioId = new Map<string, 'published' | 'draft'>()
  const cueUpdatedAtByAudioId = new Map<string, number | null>()
  const draftAliyotByParsha = new Map<string, number[]>()
  const completeAliyotByParsha = new Map<string, number[]>()

  for (const recording of availableRecordings) {
    const draftSummary = readAdminDraftSummary(recording.id)
    const cueProgress = getCueProgressForRecording(recording)

    if (draftSummary?.cueCount) {
      const draft = loadAdminDraft(recording.id, draftSummary.tokenCount)
      if (draft?.cues.length) {
        cueOverrides.set(recording.id, draft.cues)
        cueSourceByAudioId.set(recording.id, 'draft')
        cueUpdatedAtByAudioId.set(recording.id, draft.updatedAt)
      }

      const targetMap = draftSummary.isIncomplete ? draftAliyotByParsha : completeAliyotByParsha
      const existingAliyot = targetMap.get(recording.parshaSlug) ?? []
      existingAliyot.push(recording.aliyah)
      targetMap.set(recording.parshaSlug, existingAliyot)
      continue
    }

    if (cueProgress.isUnfinished) {
      const existingAliyot = draftAliyotByParsha.get(recording.parshaSlug) ?? []
      existingAliyot.push(recording.aliyah)
      draftAliyotByParsha.set(recording.parshaSlug, existingAliyot)
      continue
    }

    if (cueProgress.isComplete) {
      const existingAliyot = completeAliyotByParsha.get(recording.parshaSlug) ?? []
      existingAliyot.push(recording.aliyah)
      completeAliyotByParsha.set(recording.parshaSlug, existingAliyot)
    }
  }

  const allRecords = listCueAnalyticsRecords({
    cueOverrides,
    cueSourceByAudioId,
    cueUpdatedAtByAudioId,
  })
  const parshaSummaries = getCueAnalyticsParshaSummaries(allRecords)

  parshaSelect.innerHTML = `
    <option value="">All parshiot with audio</option>
    ${parshaSummaries
      .map(
        (summary) => `
          <option value="${summary.parshaSlug}">${summary.parshaName}</option>
        `
      )
      .join('')}
  `
  parshaSelect.disabled = false

  const render = () => {
    const selectedParsha = parshaSelect.value
    const selectedAliyah = Number(aliyahSelect.value) || 0
    const selectedParshaName =
      parshaSummaries.find((summary) => summary.parshaSlug === selectedParsha)?.parshaName ?? null
    const filteredRecords = allRecords.filter(
      (record) =>
        (!selectedParsha || record.recording.parshaSlug === selectedParsha) &&
        (!selectedAliyah || record.recording.aliyah === selectedAliyah)
    )
    const visibleAnalyticsRecords = filteredRecords.filter((record) => record.transitionCount > 0)
    const selectionLabel = describeSelection(selectedParshaName, selectedAliyah || null)

    overviewSection.innerHTML = renderOverview(visibleAnalyticsRecords, selectionLabel)
    coverageSection.innerHTML = renderCoverage(
      parshaSummaries,
      draftAliyotByParsha,
      completeAliyotByParsha,
      selectedParsha,
      selectedAliyah
    )
    aliyahSection.innerHTML = renderAliyahAverages(
      getCueAnalyticsAliyahSummaries(visibleAnalyticsRecords),
      selectionLabel
    )
    outliersSection.innerHTML = renderTransitionReview(visibleAnalyticsRecords, selectionLabel)
    recordsSection.innerHTML = visibleAnalyticsRecords.length
      ? visibleAnalyticsRecords.map(renderRecordModule).join('')
      : `
          <section class="about-card stack small analytics-empty-state">
            <div class="about-card-header">
              <h2>No timing transitions in this slice</h2>
              <p>Change the filter or use the coverage section above to find recordings that still need timing.</p>
            </div>
          </section>
        `
    bindAnalyticsGraphInteractions(recordsSection)
  }

  parshaSelect.addEventListener('change', render)
  aliyahSelect.addEventListener('change', render)
  render()
}
