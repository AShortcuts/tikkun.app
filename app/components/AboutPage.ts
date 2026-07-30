import {
  projectStatusRows,
  recordingProgressRows,
} from '../data/about-progress.ts'
import { listRecordings, listNarrators } from '../audio/library.ts'
import { isParshaAudioRecording } from '../audio/types.ts'
import { generateCueAnalyticsUrl } from '../view-model/navigation/url-parser.ts'
import { iconMarkup } from './icons.ts'

const statusClass = (status: string) =>
  `status-pill mod-${status.toLowerCase().replace(/[^a-z]+/g, '-')}`

export default function AboutPage() {
  const narrators = new Map(listNarrators().map((narrator) => [narrator.id, narrator]))
  const recordingsByParsha = new Map<
    string,
    {
      narratorId: string
      parshaName: string
      parshaNumber?: number
      availableAliyot: number[]
      formats: Set<string>
      notes: string[]
    }
  >()

  for (const recording of listRecordings().filter(isParshaAudioRecording)) {
    const existing = recordingsByParsha.get(recording.parshaSlug) ?? {
      narratorId: recording.narratorId,
      parshaName: recording.parshaName,
      parshaNumber: recording.parshaNumber,
      availableAliyot: [],
      formats: new Set<string>(),
      notes: [],
    }
    existing.availableAliyot.push(recording.aliyah)
    existing.formats.add(recording.format)
    if (recording.notes) existing.notes.push(recording.notes)
    recordingsByParsha.set(recording.parshaSlug, existing)
  }

  return `
    <section class="about-view stack large">
      <div class="about-hero stack small">
        <p class="about-eyebrow">About this project</p>
        <h1 class="about-title">A practical tikkun for preparing Torah readings with audio synced highlights.</h1>
        <p class="about-copy">
          This site combines clear Torah text, aliyah recordings, and word-by-word timing by the best ba'al korim
          so readers can practice and prepare flawlessly anytime, anywhere.
        </p>
        <div class="about-actions">
          <a class="about-link-button" href="${generateCueAnalyticsUrl()}">Playback analytics</a>
        </div>
      </div>

      <section class="about-card stack small">
        <div class="about-card-header">
          <h2>Project status</h2>
          <p>Current work and next steps.</p>
        </div>
        <div class="about-table-wrap">
          <table class="about-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Status</th>
                <th>Notes</th>
                <th>Next milestone</th>
              </tr>
            </thead>
            <tbody>
              ${projectStatusRows
                .map(
                  (row) => `
                    <tr>
                      <td>${row.feature}</td>
                      <td><span class="${statusClass(row.status)}">${row.status}</span></td>
                      <td>${row.notes}</td>
                      <td>${row.nextMilestone}</td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </section>

      <section class="about-card stack small">
        <div class="about-card-header">
          <h2>Recording progress</h2>
          <p>A simple snapshot of recording work for the site.</p>
        </div>
        <div class="about-status-legend" aria-label="Recording status legend">
          <div>
            <span class="${statusClass('Completed')}">Completed</span>
            <p>Highlight sync is done.</p>
          </div>
          <div>
            <span class="${statusClass('In progress')}">In progress</span>
            <p>Audio files are ready, but highlight sync is not done yet.</p>
          </div>
          <div>
            <span class="${statusClass('Pending Audio')}">Pending Audio</span>
            <p>Audio recordings are not available yet.</p>
          </div>
        </div>
        <p class="about-progress-link">
          This is an updated copy of the current progress
          <span class="inline-direction-arrow" aria-hidden="true">${iconMarkup('arrowRight')}</span>
          <a href="https://docs.google.com/spreadsheets/d/1cLuwv9ZkfomgErWM5QAuP-zev4J_v7Tx8SoGE9cI32E/edit?usp=sharing" target="_blank" rel="noopener noreferrer">Google Sheet</a>
        </p>
        <div class="about-table-wrap">
          <table class="about-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Parsha</th>
                <th>Hebrew</th>
                <th>Status</th>
                <th>Comments</th>
              </tr>
            </thead>
            <tbody>
              ${recordingProgressRows
                .map(
                  (row) => `
                    <tr>
                      <td>${row.number ?? '—'}</td>
                      <td>${row.link ? `<a href="${row.link}" target="_blank">${row.parshaEnglish}</a>` : row.parshaEnglish}</td>
                      <td dir="rtl">${row.parshaHebrew}</td>
                      <td><span class="${statusClass(row.status)}">${row.status}</span></td>
                      <td>${row.comments ?? '—'}</td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </section>

      <details class="about-card about-catalog-details stack small">
        <summary class="about-catalog-summary">
          <span class="about-catalog-chevron" aria-hidden="true">${iconMarkup('arrowRight')}</span>
          <span class="about-card-header">
            <span>
              <span class="about-catalog-title">Current audio catalog</span>
              <span class="about-catalog-copy">Recordings currently available for playback and download.</span>
            </span>
          </span>
        </summary>
        <div class="about-table-wrap">
          <table class="about-table">
            <thead>
              <tr>
                <th>Ba'al Koreh</th>
                <th>Parsha</th>
                <th>Aliyot available</th>
                <th>Formats</th>
                <th>Timing</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${[...recordingsByParsha.values()]
                .sort(
                  (a, b) =>
                    (a.parshaNumber ?? Number.MAX_SAFE_INTEGER) -
                      (b.parshaNumber ?? Number.MAX_SAFE_INTEGER) ||
                    a.parshaName.localeCompare(b.parshaName)
                )
                .map(
                  (row) => `
                    <tr>
                      <td>${narrators.get(row.narratorId)?.displayName ?? row.narratorId}</td>
                      <td>${row.parshaName}</td>
                      <td>${row.availableAliyot.sort((a, b) => a - b).join(', ')}</td>
                      <td>${[...row.formats].join(', ')}</td>
                      <td>Manual timing</td>
                      <td>${row.notes[0] ?? '—'}</td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </details>

      <section class="about-card stack small">
        <div class="about-card-header">
          <h2>Credits</h2>
        </div>
        <p class="about-copy">
          Audio recordings are currently seeded from Yoni Davidov’s aliyah collection.
          Recording progress comes from the maintained tracker. Word timing is added
          manually in the admin tools and shipped with the site.
        </p>
      </section>
    </section>
  `
}
