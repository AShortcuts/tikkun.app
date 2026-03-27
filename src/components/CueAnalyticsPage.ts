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
import { getCueProgressForRecording, listRecordings } from '../audio/library.ts'
import { readAdminDraftSummary } from '../admin/draft-storage.ts'
import hebrewNumeral from '../hebrew-numeral.ts'
import { generateAboutUrl } from '../view-model/navigation/url-parser.ts'

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
})

function formatSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0.00s'
  return `${seconds.toFixed(2)}s`
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

function describeSelection(parshaName: string | null, aliyah: number | null) {
  if (parshaName && aliyah) return `${parshaName}, aliyah ${hebrewNumeral(aliyah)}`
  if (parshaName) return `${parshaName}, all available aliyot`
  if (aliyah) return `all parshiot, aliyah ${hebrewNumeral(aliyah)}`
  return 'all authored cue data'
}

function getPointDatasetValue(point: Element, key: string) {
  const value = point.getAttribute(`data-${key}`)
  return value ?? ''
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
      const outlierLabel = getPointDatasetValue(point, 'outlier-label')

      focusLine.setAttribute('x1', `${x}`)
      focusLine.setAttribute('x2', `${x}`)
      focusLine.setAttribute('y1', `${top}`)
      focusLine.setAttribute('y2', `${bottom}`)
      focusLine.setAttribute('visibility', 'visible')
      focusPoint.setAttribute('cx', `${x}`)
      focusPoint.setAttribute('cy', `${y}`)
      focusPoint.setAttribute('visibility', 'visible')

      tooltip.innerHTML = `
        <strong>Cue ${previousCueNumber} → ${cueNumber}</strong>
        <span>${gap}s gap · ${pace} wpm</span>
        <span>${outlierLabel || 'Within expected range'}</span>
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
          <span><i class="mod-outlier"></i>Outlier transition</span>
        </div>
      </div>
      <div class="analytics-graph-stage">
      <span class="analytics-axis-title analytics-axis-title-y">Pace (words per minute)</span>
      <svg
        viewBox="0 0 ${width} ${height}"
        role="img"
        aria-label="Word speed graph with average pace and outlier markers"
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
          .map(
            (point) => `
              <circle
                cx="${point.x.toFixed(2)}"
                cy="${point.y.toFixed(2)}"
                r="${point.sample.isOutlier ? '4.5' : '3.4'}"
                class="analytics-graph-point${point.sample.isOutlier ? ' analytics-graph-outlier' : ''}"
                data-analytics-graph-point
                data-x="${point.x.toFixed(2)}"
                data-y="${point.y.toFixed(2)}"
                data-cue-number="${point.sample.cueNumber}"
                data-previous-cue-number="${point.sample.previousCueNumber}"
                data-gap="${point.sample.gap.toFixed(2)}"
                data-pace="${Math.round(point.sample.wordsPerMinute)}"
                data-outlier-label="${point.sample.outlierDirection === 'slow'
                  ? 'Long pause outlier'
                  : point.sample.outlierDirection === 'fast'
                    ? 'Compressed transition outlier'
                    : ''}"
                tabindex="0"
              />
            `
          )
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
      <p class="analytics-graph-axis-caption">Cue progression through the aliyah</p>
      <p class="analytics-graph-copy">
        Each point represents the pace between two consecutive cues. Outlier markers flag unusually slow or compressed transitions relative to this recording.
      </p>
    </div>
  `
}

function renderOverview(records: CueAnalyticsRecord[], selectionLabel: string) {
  const overview = getCueAnalyticsOverview(records)

  if (!records.length) {
    return `
      <div class="about-card-header">
        <h2>Selection overview</h2>
        <p>No cue JSON files match ${selectionLabel} yet. Use the coverage view below to see which audio recordings still need cue files.</p>
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
        <span class="analytics-stat-label">Total cues</span>
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
        <span class="analytics-stat-label">Longest pause</span>
        <strong class="analytics-stat-value">${formatSeconds(overview.longestGap)}</strong>
      </div>
      <div class="analytics-summary-item">
        <span class="analytics-stat-label">Outlier transitions</span>
        <strong class="analytics-stat-value">${overview.outlierCount}</strong>
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
        <p>No authored cue files are available for ${selectionLabel} yet.</p>
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
                  <dt>Average span</dt>
                  <dd>${formatTimedSpan(summary.averageDuration)}</dd>
                </div>
                <div>
                  <dt>Outliers</dt>
                  <dd>${summary.outlierCount}</dd>
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
      <p>This is the operational view: every parsha with available audio, how many aliyot already have cue JSON, and exactly which ones still need authoring.</p>
    </div>
    <div class="analytics-coverage-legend">
      <span><i class="mod-draft"></i>Unfinished cues</span>
      <span><i class="mod-cued"></i>Completed cues</span>
      <span><i class="mod-missing"></i>Audio present, cue file missing</span>
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
                  ? `Aliyah ${hebrewNumeral(selectedAliyah)} is unfinished.`
                  : completeAliyot.includes(selectedAliyah)
                  ? `Aliyah ${hebrewNumeral(selectedAliyah)} already has cues.`
                  : `Aliyah ${hebrewNumeral(selectedAliyah)} has audio and still needs a cue JSON file.`
                : `Aliyah ${hebrewNumeral(selectedAliyah)} has no audio recording in this parsha.`

          return `
            <article class="analytics-coverage-card">
              <div class="analytics-coverage-header">
                <div>
                  <h3>${summary.parshaName}</h3>
                  <p>${completeAliyot.length} complete · ${draftAliyot.length} unfinished · ${missingAliyot.length} missing${selectedAliyahStatus ? ` · ${selectedAliyahStatus}` : ''}</p>
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
                    <dt>Missing cues</dt>
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
                    return `
                      <span class="analytics-coverage-pill ${state}${selectedClass}">
                        ${hebrewNumeral(aliyah)}
                      </span>
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

function renderOutliers(records: CueAnalyticsRecord[], selectionLabel: string) {
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
        <h2>Outlier review</h2>
        <p>No unusual interval outliers were detected in ${selectionLabel}. That usually means the cue spacing is relatively even.</p>
      </div>
    `
  }

  return `
    <div class="about-card-header">
      <h2>Outlier review</h2>
      <p>These are the cue transitions most likely to deserve a second look in ${selectionLabel}.</p>
    </div>
    <div class="analytics-outlier-list">
      ${outliers
        .map(
          ({ record, sample }) => `
            <article class="analytics-outlier-row">
              <div>
                <p class="analytics-outlier-title">${record.recording.parshaName} · Aliyah ${hebrewNumeral(record.recording.aliyah)}</p>
                <p class="analytics-outlier-copy">Cue ${sample.previousCueNumber} → ${sample.cueNumber} · ${record.narratorName}</p>
              </div>
              <div class="analytics-outlier-metrics">
                <strong>${formatSeconds(sample.gap)}</strong>
                <span>${formatWordsPerMinute(sample.wordsPerMinute)}</span>
                <span>${sample.outlierDirection === 'slow' ? 'Long pause outlier' : 'Compressed transition outlier'}</span>
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
          <p class="about-copy analytics-meta">${record.narratorName} · ${record.cueCount} cues · ${formatTimedSpan(record.totalDuration)} timed span</p>
        </div>
        <div class="analytics-module-callout">
          <span class="analytics-stat-label">Outliers</span>
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
          <span class="analytics-stat-label">Longest pause</span>
          <strong class="analytics-stat-value">${formatSeconds(record.longestGap)}</strong>
        </div>
        <div class="analytics-stat">
          <span class="analytics-stat-label">Fastest transition</span>
          <strong class="analytics-stat-value">${formatSeconds(record.shortestGap)}</strong>
        </div>
      </div>
      ${renderGraph(record.intervalSamples, record.averageWordsPerMinute)}
    </article>
  `
}

export default function CueAnalyticsPage() {
  const records = listCueAnalyticsRecords()
  const parshaOptions = getCueAnalyticsParshaSummaries(records)

  return `
    <section class="about-view analytics-view stack large" data-analytics-root="true">
      <div class="about-hero analytics-hero stack small">
        <div class="analytics-toolbar">
          <a class="analytics-back-link" href="${generateAboutUrl()}">Back to About</a>
          <span class="about-eyebrow">Cue Analytics</span>
        </div>
        <h1 class="about-title analytics-title">A live map of where each aliyah pushes, settles, and lingers.</h1>
        <p class="about-copy">
          This page reads the authored cue files directly and turns them into something operational:
          pacing trends, outliers worth checking, and a coverage view that shows which audio recordings
          still need cue JSON files.
        </p>
        <section class="about-card analytics-filter-card">
          <div class="analytics-filter-grid">
            <label class="analytics-filter-field">
              <span>Parsha</span>
              <select data-analytics-filter="parsha">
                <option value="">All parshiot with audio</option>
                ${parshaOptions
                  .map(
                    (summary) => `
                      <option value="${summary.parshaSlug}">${summary.parshaName}</option>
                    `
                  )
                  .join('')}
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

      <section class="about-card analytics-summary-card stack small" data-analytics-section="overview"></section>
      <section class="about-card stack small" data-analytics-section="coverage"></section>
      <section class="about-card stack small" data-analytics-section="aliyah-averages"></section>
      <section class="about-card stack small" data-analytics-section="outliers"></section>
      <section class="analytics-modules stack medium" data-analytics-section="records"></section>
    </section>
  `
}

export function mountCueAnalyticsPage(container: HTMLElement) {
  const root = container.querySelector<HTMLElement>('[data-analytics-root="true"]')
  if (!root) return

  const allRecords = listCueAnalyticsRecords().filter((record) => record.intervalCount > 0)
  const parshaSummaries = getCueAnalyticsParshaSummaries(allRecords)
  const draftAliyotByParsha = new Map<string, number[]>()
  const completeAliyotByParsha = new Map<string, number[]>()
  for (const recording of listRecordings().filter((entry) => entry.status === 'available')) {
    const cueProgress = getCueProgressForRecording(recording)
    const draftSummary = readAdminDraftSummary(recording.id)
    const isUnfinished = Boolean(draftSummary?.isIncomplete || cueProgress.isUnfinished)

    if (isUnfinished) {
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
    const selectionLabel = describeSelection(selectedParshaName, selectedAliyah || null)

    overviewSection.innerHTML = renderOverview(filteredRecords, selectionLabel)
    coverageSection.innerHTML = renderCoverage(
      parshaSummaries,
      draftAliyotByParsha,
      completeAliyotByParsha,
      selectedParsha,
      selectedAliyah
    )
    aliyahSection.innerHTML = renderAliyahAverages(
      getCueAnalyticsAliyahSummaries(filteredRecords),
      selectionLabel
    )
    outliersSection.innerHTML = renderOutliers(filteredRecords, selectionLabel)
    recordsSection.innerHTML = filteredRecords.length
      ? filteredRecords.map(renderRecordModule).join('')
      : `
          <section class="about-card stack small analytics-empty-state">
            <div class="about-card-header">
              <h2>No authored cue files in this slice</h2>
              <p>Change the filter or use the coverage section above to find audio recordings that still need cue JSON files.</p>
            </div>
          </section>
        `
    bindAnalyticsGraphInteractions(recordsSection)
  }

  parshaSelect.addEventListener('change', render)
  aliyahSelect.addEventListener('change', render)
  render()
}
