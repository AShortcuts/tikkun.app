import {
  projectStatusRows,
  recordingProgressRows,
} from '../data/about-progress.ts'
import { listRecordings, listNarrators } from '../audio/library.ts'
import { generateCueAnalyticsUrl } from '../view-model/navigation/url-parser.ts'

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

  for (const recording of listRecordings()) {
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
        <p class="about-eyebrow">About this Project</p>
        <h1 class="about-title">A reader-first tikkun with professional audio and highlight tracking built around real preparation workflow.</h1>
        <p class="about-copy">
          This project pairs the existing tikkun text experience with narrator-based aliyah recordings,
          synced highlighting, and an internal cue-authoring workflow so recordings and visuals can be
          expanded deliberately over time.
        </p>
        <div class="about-actions">
          <a class="about-link-button" href="${generateCueAnalyticsUrl()}">Cue analytics</a>
        </div>
      </div>

      <section class="about-card stack small">
        <div class="about-card-header">
          <h2>Project status</h2>
          <p>Current implementation progress and next milestones.</p>
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
          <p>Repo-managed snapshot based on the working Google Sheet tracker for website recordings.</p>
        </div>
        <div class="about-table-wrap">
          <table class="about-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Parsha</th>
                <th>Hebrew</th>
                <th>Status</th>
                <th>Comments</th>
                <th>Pending</th>
                <th>Progress</th>
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
                      <td>${row.pendingAudioCount ?? '—'}</td>
                      <td>${row.completionPercent ?? '—'}</td>
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
          <h2>Current audio catalog</h2>
          <p>Playback/download availability exposed by the in-app audio manifest.</p>
        </div>
        <div class="about-table-wrap">
          <table class="about-table">
            <thead>
              <tr>
                <th>Ba'al Koreh</th>
                <th>Parsha</th>
                <th>Aliyot available</th>
                <th>Formats</th>
                <th>Cues</th>
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
                      <td>Manual cue authoring</td>
                      <td>${row.notes[0] ?? '—'}</td>
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
          <h2>Credits</h2>
        </div>
        <p class="about-copy">
          Audio recordings are currently seeded from Yoni Davidov’s aliyah collection.
          Website progress tracking reflects the maintained sheet snapshot, while cue timing
          is authored manually inside the hidden admin workflow and then hardcoded into the site.
        </p>
      </section>
    </section>
  `
}
