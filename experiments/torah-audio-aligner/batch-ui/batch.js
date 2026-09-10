import { api, save, edit, selectWord, replayWord, loadRecording, refreshCatalog,
  toggleReview, reviewSession, replayInterval, showError, element, eventIndex } from '/app.js';

const $ = id => document.getElementById(id);
let library = [], queue, reviews = [], csrf, busy = false, uploads = [], polling = null, renderedRows = '';
let generatedCueExport = false;
const selected = new Set(), zipSelection = new Set(), seenReady = new Set();
const action = fn => async event => { try { await fn(event); } catch (error) { showError(error); } };

function showBatch(open) {
  toggleReview(false);
  $('batch-panel').hidden = !open;
  $('workspace').hidden = open;
  document.querySelector('.audio-desk').hidden = open;
  document.querySelector('.recording-bar').hidden = open;
  document.querySelector('.save-tools').hidden = open;
  $('show-batch').setAttribute('aria-pressed', String(open));
  $('show-batch').textContent = open ? 'Batch & review' : 'Back to batch';
  $('show-reader').setAttribute('aria-pressed', String(!open));
  if (open) { $('audio').pause(); $('show-batch').focus(); }
  else $('show-reader').focus();
}

function existing(source) {
  return reviews.some(row => row.audioId === source.audioId);
}

function visibleSources() {
  const parsha = $('library-parsha').value, search = $('library-search').value.trim().toLocaleLowerCase();
  return library.filter(row => (!parsha || row.readingId === parsha) && row.title.toLocaleLowerCase().includes(search));
}

function renderLibrary() {
  const rows = visibleSources();
  $('library-list').replaceChildren(...rows.map(source => {
    const label = element('label', undefined, 'library-row');
    const check = element('input'); check.type = 'checkbox'; check.value = source.id;
    check.checked = selected.has(source.id); check.disabled = !source.available || busy;
    check.setAttribute('aria-label', `Queue ${source.title}`);
    check.addEventListener('change', () => { if (check.checked) selected.add(source.id); else selected.delete(source.id); renderSelection(); });
    const copy = element('span', source.title);
    copy.dataset.sourceId = source.id;
    copy.append(element('small', !source.available ? 'Audio identity needs attention' : existing(source) ? 'Existing alignment available' : 'Ready to align'));
    label.append(check, copy); return label;
  }));
  if (!rows.length) $('library-list').append(element('p', 'No local recordings match this search.', 'secondary'));
  renderSelection();
}

function renderSelection() {
  $('selection-count').textContent = `${selected.size} selected${selected.size > 25 ? ' · choose up to 25 at a time' : ''}`;
  $('add-selected').disabled = busy || !selected.size || selected.size > 25;
}

async function refreshQueue(fresh = false) {
  if (polling) { await polling; if (!fresh) return; }
  const pending = (async () => {
    const [snapshot, catalog] = await Promise.all([api('/api/batch/queue'), api('/api/catalog')]);
    queue = snapshot; reviews = catalog.recordings; generatedCueExport = catalog.generatedCueExport === true;
    renderQueue(); updateQuickControls();
    for (const copy of $('library-list').querySelectorAll('[data-source-id]')) {
      const source = library.find(row => row.id === copy.dataset.sourceId);
      copy.querySelector('small').textContent = !source.available ? 'Audio identity needs attention' : existing(source) ? 'Existing alignment available' : 'Ready to align';
    }
  })();
  polling = pending;
  try { await pending; } finally { if (polling === pending) polling = null; }
}

async function openResult(identifier) {
  await refreshCatalog();
  await loadRecording(identifier);
  showBatch(false);
  selectWord(0, true);
  document.querySelector('.inspector').scrollTop = 0;
  updateQuickControls();
}

function readyResults() {
  const result = new Map();
  for (const item of queue?.items || []) if (item.status === 'ready') result.set(item.resultId, item);
  return [...result.values()];
}

function renderQueue() {
  const waiting = queue.items.filter(item => item.status === 'queued').length;
  const results = readyResults();
  const remaining = results.filter(item => !item.review.exportReady).length;
  $('batch-summary').textContent = `${waiting} waiting · ${remaining} to review${queue.running ? ' · aligning' : ''}`;
  $('queue-status').textContent = queue.pauseReason || (queue.running ? 'Aligning one recording. You can review completed results now.' : waiting ? 'Queue saved. Start when you are ready.' : results.length ? 'Results saved. Review them at your pace.' : 'Add recordings to begin. Nothing starts until you choose Start queue.');
  $('queue-budget').textContent = `${Math.floor(queue.remainingTestingSeconds / 60)} minutes remain in the approved testing allowance. No model downloads are needed.`;
  $('queue-start').disabled = busy || !waiting || !queue.paused;
  $('queue-start').textContent = queue.items.some(item => item.status === 'interrupted') ? 'Resume queue' : 'Start queue';
  $('queue-pause').disabled = busy || queue.paused;
  $('queue-cancel').disabled = busy || !waiting;
  $('review-next').disabled = !remaining;
  const eligible = new Set(results.filter(item => generatedCueExport || item.review.exportReady).map(item => item.resultId));
  for (const id of zipSelection) if (!eligible.has(id)) zipSelection.delete(id);
  for (const id of eligible) if (!seenReady.has(id)) { zipSelection.add(id); seenReady.add(id); }
  const fingerprint = JSON.stringify([queue.items, busy, [...zipSelection]]);
  if (fingerprint === renderedRows) { updateZip(); return; }
  renderedRows = fingerprint;
  const focused = $('queue-list').contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') : null;
  $('queue-list').replaceChildren(...queue.items.map(item => {
    const row = element('div', undefined, 'queue-row');
    row.dataset.itemId = item.id;
    if (item.status === 'ready' && (generatedCueExport || item.review.exportReady)) {
      const check = element('input'); check.type = 'checkbox'; check.checked = zipSelection.has(item.resultId);
      check.setAttribute('aria-label', `Include ${item.title} in cue ZIP`);
      check.addEventListener('change', () => { if (check.checked) zipSelection.add(item.resultId); else zipSelection.delete(item.resultId); renderQueue(); });
      row.append(check);
    }
    const copy = element('div', undefined, 'queue-row-copy');
    copy.append(element('strong', item.title));
    const status = item.status === 'ready'
      ? `${item.review.exportReady ? 'Reviewed · ready to download' : `${generatedCueExport ? 'Download available · ' : ''}${item.review.reviewed}/${item.review.words} timings reviewed · ${item.review.flags} flags`}${item.reused ? ' · existing result' : ''}`
      : item.phase;
    copy.append(element('p', status, 'secondary'));
    if (item.error) copy.append(element('p', item.error, 'secondary queue-error'));
    row.append(copy);
    if (item.status === 'ready') {
      const review = element('button', item.review.exportReady ? 'Open' : 'Review');
      review.setAttribute('aria-label', `${item.review.exportReady ? 'Open' : 'Review'} ${item.title}`);
      review.addEventListener('click', action(() => openResult(item.resultId))); row.append(review);
    } else if (['failed', 'interrupted', 'cancelled'].includes(item.status)) {
      const retry = element('button', 'Retry'); retry.disabled = busy;
      retry.setAttribute('aria-label', `Retry ${item.title}`);
      retry.addEventListener('click', action(async () => { await api('/api/batch/control', { action: 'retry', itemId: item.id }); await refreshQueue(true); }));
      row.append(retry);
    }
    return row;
  }));
  if (!queue.items.length) $('queue-list').append(element('p', 'No queued recordings. Select an aliyah to begin.', 'secondary'));
  if (focused) [...$('queue-list').querySelectorAll('[aria-label]')].find(node => node.getAttribute('aria-label') === focused)?.focus({ preventScroll: true });
  updateZip();
}

function updateZip() {
  $('download-batch').disabled = busy || !zipSelection.size || zipSelection.size > 100;
  $('download-batch').textContent = zipSelection.size ? `Download ${zipSelection.size} cue ${zipSelection.size === 1 ? 'file' : 'files'} (.zip)` : 'Download cues (.zip)';
  $('zip-help').textContent = generatedCueExport ? 'No review required. Unzip, then use Import cues in the matching recording’s admin panel. Flags stay in each file until reviewed.' : 'This running service supports reviewed exports. Open the updated private preview for downloads before review.';
}

async function enqueue(selections, force = false) {
  return api('/api/batch/queue', { selections, force, requestId: crypto.randomUUID().replaceAll('-', '') });
}

$('show-batch').addEventListener('click', action(async () => { await save(); showBatch(true); await refreshQueue(true); renderLibrary(); }));
$('show-reader').addEventListener('click', () => showBatch(false));
$('library-parsha').addEventListener('change', renderLibrary);
$('library-search').addEventListener('input', renderLibrary);
$('select-visible').addEventListener('click', () => { for (const row of visibleSources()) if (row.available) selected.add(row.id); renderLibrary(); });
$('select-new').addEventListener('click', () => { for (const row of visibleSources()) if (row.available && !existing(row)) selected.add(row.id); renderLibrary(); });
$('clear-selection').addEventListener('click', () => { selected.clear(); renderLibrary(); });
$('select-downloads').addEventListener('click', () => { for (const item of readyResults()) if (generatedCueExport || item.review.exportReady) zipSelection.add(item.resultId); renderQueue(); });
$('clear-downloads').addEventListener('click', () => { zipSelection.clear(); renderQueue(); });
$('add-selected').addEventListener('click', action(async () => {
  busy = true; renderSelection();
  try { await enqueue([...selected].map(sourceId => ({ sourceId })), $('force-alignment').checked); selected.clear(); await refreshQueue(true); }
  finally { busy = false; renderLibrary(); renderQueue(); }
}));
for (const [id, operation] of [['queue-start', 'start'], ['queue-pause', 'pause'], ['queue-cancel', 'cancel-waiting']]) {
  $(id).addEventListener('click', action(async () => {
    busy = true; renderQueue();
    try { await api('/api/batch/control', { action: operation, minutes: $('run-minutes').valueAsNumber }); await refreshQueue(true); }
    finally { busy = false; renderQueue(); }
  }));
}
$('review-next').addEventListener('click', action(async () => {
  await save(); await refreshQueue(true);
  const next = readyResults().filter(item => !item.review.exportReady).sort((a, b) => b.review.flags - a.review.flags)[0];
  if (next) await openResult(next.resultId);
}));

$('upload-files').addEventListener('change', () => {
  uploads = [...$('upload-files').files].map(file => ({ file, sourceId: '', uploadId: null }));
  $('upload-mappings').replaceChildren(...uploads.map((row, index) => {
    const group = element('div', undefined, 'upload-mapping');
    const label = element('label', `${row.file.name} · ${(row.file.size / 1024 / 1024).toFixed(1)} MB`);
    label.htmlFor = `upload-passage-${index}`;
    const select = element('select'); select.id = label.htmlFor;
    const prompt = element('option', 'Choose the complete aliyah'); prompt.value = ''; select.append(prompt);
    for (const source of library) { const option = element('option', source.title); option.value = source.id; select.append(option); }
    select.addEventListener('change', () => { row.sourceId = select.value; row.uploadId = null; updateUploads(); });
    group.append(label, select); return group;
  }));
  updateUploads();
});
function updateUploads() {
  $('upload-add').disabled = busy || !uploads.length || uploads.length > 25 || uploads.some(row => !row.sourceId || row.file.size > 100 * 1024 * 1024);
  $('upload-status').textContent = uploads.length > 25 ? 'Choose up to 25 audio files at a time.' : uploads.some(row => row.file.size > 100 * 1024 * 1024) ? 'Each audio file must be smaller than 100 MB.' : '';
}
$('upload-add').addEventListener('click', action(async () => {
  busy = true; updateUploads(); $('upload-files').disabled = true;
  $('upload-mappings').inert = true;
  try {
    for (const [index, row] of uploads.entries()) {
      if (row.uploadId) continue;
      $('upload-status').textContent = `Uploading ${index + 1} of ${uploads.length}: ${row.file.name}`;
      const params = new URLSearchParams({ sourceId: row.sourceId, filename: row.file.name });
      const response = await fetch(`/api/batch/upload?${params}`, { method: 'POST', headers: { 'X-Private-Token': csrf, 'Content-Type': 'application/octet-stream' }, body: row.file });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Upload failed. Your earlier uploaded files are retained for retry.');
      row.uploadId = result.uploadId;
    }
    await enqueue(uploads.map(({ sourceId, uploadId }) => ({ sourceId, uploadId })));
    $('upload-status').textContent = `${uploads.length} recordings added. Start the queue when ready.`;
    uploads = []; $('upload-mappings').replaceChildren(); $('upload-files').value = '';
    await refreshQueue(true);
  } finally { busy = false; $('upload-files').disabled = false; $('upload-mappings').inert = false; $('upload-add').disabled = !uploads.length; renderQueue(); }
}));

$('download-batch').addEventListener('click', action(async () => {
  await save(); await refreshQueue(true);
  busy = true; updateZip();
  try {
    const selections = readyResults().filter(item => zipSelection.has(item.resultId) && (generatedCueExport || item.review.exportReady)).map(item => ({ id: item.resultId, revision: item.review.revision }));
    const result = await api('/api/batch/export?prepare=1', { selections });
    const link = element('a'); link.href = result.downloadUrl; link.download = 'tikkun-generated-cues.zip';
    document.body.append(link); link.click(); link.remove();
    $('batch-download-status').replaceChildren(element('span', `${selections.length} cue ${selections.length === 1 ? 'file' : 'files'} prepared with review flags. `));
    const again = element('a', 'Download ZIP again'); again.href = result.downloadUrl; again.download = 'tikkun-generated-cues.zip';
    $('batch-download-status').append(again);
  } finally { busy = false; updateZip(); }
}));

const quick = element('details'); quick.open = true;
quick.append(element('summary', 'Quick review'));
const quickBody = element('div', undefined, 'quick-review');
const pair = element('div', undefined, 'quick-pair');
const replayVerse = element('button', 'Replay pasuk'); replayVerse.id = 'replay-pasuk';
const nextWord = element('button', 'Next unreviewed'); nextWord.id = 'next-unreviewed';
const acceptVerse = element('button', 'Mark pasuk reviewed & next'); acceptVerse.id = 'accept-pasuk';
const nextFlag = element('button', 'Next reading flag'); nextFlag.id = 'next-reading-flag';
pair.append(replayVerse, nextWord); quickBody.append(pair, acceptVerse, nextFlag); quick.append(quickBody);
$('unreview').after(quick);

function verseRange() {
  const { data, state, selected } = reviewSession();
  if (!state || !data) return null;
  const tokens = new Map(data.recording.tokens.map(token => [token.tokenKey, token]));
  const verse = index => JSON.stringify(tokens.get(state.occurrences[index].tokenKey).verse);
  const key = verse(selected);
  let first = selected, last = selected;
  while (first > 0 && verse(first - 1) === key) first--;
  while (last + 1 < state.occurrences.length && verse(last + 1) === key) last++;
  return { first, last, start: Math.max(0, state.occurrences[first].startSample - state.replayLeadSamples) / 16000,
    end: state.occurrences[last + 1]?.startSample / 16000 || data.recording.durationSeconds };
}
function updateQuickControls() {
  const { data, state } = reviewSession();
  replayVerse.disabled = acceptVerse.disabled = !state;
  nextWord.disabled = !state || state.occurrences.every(row => row.accepted);
  const flags = data ? data.proposal.events.filter((_, i) => !state.eventReviews[String(i)]).length : 0;
  nextFlag.disabled = !flags; nextFlag.textContent = flags ? `Next reading flag (${flags})` : 'No remaining reading flags';
}
replayVerse.addEventListener('click', action(async () => { const range = verseRange(); if (range) { selectWord(range.first, true); await replayInterval(range.start, range.end); } }));
nextWord.addEventListener('click', action(async () => {
  const { state, selected } = reviewSession();
  let index = state.occurrences.findIndex((row, i) => i > selected && !row.accepted);
  if (index < 0) index = state.occurrences.findIndex(row => !row.accepted);
  if (index >= 0) { selectWord(index, true); await replayWord(); }
}));
acceptVerse.addEventListener('click', action(() => {
  const range = verseRange(); if (!range) return;
  edit(next => { for (let i = range.first; i <= range.last; i++) next.occurrences[i].accepted = true; });
  const { state } = reviewSession();
  if (range.last + 1 < state.occurrences.length) selectWord(range.last + 1, true);
  updateQuickControls();
}));
nextFlag.addEventListener('click', action(async () => {
  const { data, state, selected } = reviewSession();
  const flags = data.proposal.events.map((event, index) => ({ event, index, word: eventIndex(event) })).filter(row => !state.eventReviews[String(row.index)]);
  const flag = flags.find(row => row.word > selected) || flags[0];
  if (!flag) return;
  selectWord(flag.word, true); toggleReview(true);
  const section = $(`reading-flag-${flag.index}`), panel = $('review-panel');
  const target = section.querySelector('textarea'); target.focus({ preventScroll: true });
  panel.scrollTop += section.getBoundingClientRect().top - panel.getBoundingClientRect().top - document.querySelector('.review-heading-sticky').getBoundingClientRect().height - 12;
  await replayWord();
}));
document.addEventListener('aligner-review-change', updateQuickControls);
document.addEventListener('aligner-selection', updateQuickControls);
document.addEventListener('aligner-run-requested', action(async () => { showBatch(true); await refreshQueue(true); }));
$('align').textContent = 'Queue fresh alignment';
$('beta-about').textContent = 'Uses the existing local model, Tikkun recordings, and mapped MP3/M4A uploads. Batch alignment runs one recording at a time, with four CPU threads and a three-minute acoustic limit. Uploads are limited to 100 MB and 15 minutes per complete aliyah. Live following is not implemented. Timing review does not verify pronunciation or taamim correctness. Nothing here publishes to Tikkun.';

try {
  const [sources, catalog] = await Promise.all([api('/api/batch/library'), api('/api/catalog')]);
  library = sources.sources; reviews = catalog.recordings; csrf = catalog.csrf;
  const options = new Map(library.map(row => [row.readingId, row.title.replace(/ Aliyah .*/, '')]));
  const all = element('option', 'All parshiyot'); all.value = '';
  $('library-parsha').replaceChildren(all, ...[...options].map(([id, title]) => { const option = element('option', title); option.value = id; return option; }));
  $('library-parsha').value = options.has('behalotecha') ? 'behalotecha' : '';
  $('library-parsha').disabled = false;
  renderLibrary(); await refreshQueue(); showBatch(true);
  setInterval(() => { if (!document.hidden) refreshQueue().catch(showError); }, 3000);
} catch (error) { showError(error); }
