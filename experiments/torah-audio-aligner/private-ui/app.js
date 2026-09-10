const $ = (id) => document.getElementById(id);
const audio = $('audio');
const canvas = $('waveform');
const ctx = canvas.getContext('2d');
const rate = 16000;
const bookNames = ['', 'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'];
const clone = (value) => structuredClone(value);
let catalog, csrf, data, state, revision, peaks, selected = 0;
let generatedCueExport = false;
let dirty = false, saveTimer, saving, saveConflict = false, loading = false;
let undo = [], redo = [], windowStart = 0, activeIndex = -1, loadSequence = 0;
let wordButtons = [], tokenMap, job, jobTimer, loopRange = null;
let lastPlaybackTime = -1;
let currentError = '';
let exporting = null, downloadNotice = '';

function time(value, precise = false) {
  const seconds = Math.max(0, value || 0);
  const tail = precise ? (seconds % 60).toFixed(2).padStart(5, '0') : Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${Math.floor(seconds / 60)}:${tail}`;
}

function verseLabel(token) {
  const v = token?.verse;
  return v ? `${bookNames[v.book]} ${v.chapter}:${v.verse}` : 'Canonical Torah word';
}

function element(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}

async function api(path, value) {
  const response = await fetch(path, value === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Private-Token': csrf }, body: JSON.stringify(value),
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body;
}

const endpoint = (action) => `/api/recordings/${data.id}/${action}`;

function showError(error) {
  currentError = error.message || String(error);
  renderError();
  if (error.status === 409 && dirty) saveConflict = true;
  updateSaveStatus();
}

function renderError() {
  const panelOpen = !$('review-panel').hidden;
  $('error-text').textContent = currentError;
  $('review-error-text').textContent = currentError;
  $('error').hidden = !currentError || panelOpen;
  $('review-error').hidden = !currentError || !panelOpen;
}

const action = (fn) => async (event) => {
  try { await fn(event); } catch (error) { showError(error); }
};

function updateSaveStatus() {
  $('save-status').textContent = loading ? 'Opening recording…' : saving ? 'Saving…' : saveConflict ? 'Save conflict' : dirty ? 'Unsaved changes' : revision ? 'Saved on this Mac' : 'Original model result';
  $('save').disabled = !dirty || Boolean(saving) || loading || saveConflict;
  $('undo').disabled = !undo.length || loading || saveConflict;
  $('redo').disabled = !redo.length || loading || saveConflict;
  renderDownloadControls();
  document.dispatchEvent(new Event('aligner-review-change'));
}

function queueSave() {
  clearTimeout(saveTimer);
  if (!saveConflict) saveTimer = setTimeout(() => save().catch(showError), 700);
}

async function save() {
  clearTimeout(saveTimer);
  if (saving) { await saving; if (dirty) return save(); return; }
  if (!dirty) return;
  if (saveConflict) throw new Error('Resolve the save conflict before changing recordings. Download edits, then reload.');
  const submitted = clone(state), id = data.id;
  saving = api(`/api/recordings/${id}/save`, { state: submitted, baseRevision: revision });
  updateSaveStatus();
  try {
    const response = await saving;
    if (data.id !== id) throw new Error('Recording changed while a save was in flight. Reload to recover its saved revision.');
    revision = response.revision;
    dirty = JSON.stringify(state) !== JSON.stringify(submitted);
  } catch (error) {
    if (error.status === 409) saveConflict = true;
    throw error;
  } finally {
    saving = null;
    updateSaveStatus();
  }
  if (dirty) queueSave();
}

function validateEdit(next) {
  let previous = -1, previousEnd = 0;
  const duration = Math.ceil(data.recording.durationSeconds * rate);
  for (const row of next.occurrences) {
    if (!Number.isInteger(row.startSample) || row.startSample <= previous || row.startSample < previousEnd || row.startSample >= duration) {
      throw new Error('Keep word starts in audio order. Adjust the neighboring boundary first.');
    }
    if (row.endSample !== null && (!Number.isInteger(row.endSample) || row.endSample <= row.startSample || row.endSample > duration)) {
      throw new Error('End time must follow this onset and stay inside the recording.');
    }
    previous = row.startSample;
    previousEnd = row.endSample ?? previous + 1;
  }
  if (!next.occurrences.length) throw new Error('Keep at least one word in the recording.');
}

function edit(mutator, { structural = false, rerenderEvents = false } = {}) {
  if (loading || !state) return;
  if (saveConflict) throw new Error('Download your edits and reload to resolve the save conflict before editing.');
  const next = clone(state);
  mutator(next);
  validateEdit(next);
  if (JSON.stringify(next) === JSON.stringify(state)) return;
  undo.push(clone(state));
  if (undo.length > 100) undo.shift();
  redo = [];
  state = next;
  selected = Math.min(selected, state.occurrences.length - 1);
  dirty = true;
  if (structural) renderPassage();
  renderInspector();
  renderReview(rerenderEvents);
  renderWordStates();
  draw();
  updateSaveStatus();
  queueSave();
}

function moveHistory(from, to) {
  if (!from.length || saveConflict) return;
  to.push(clone(state));
  state = from.pop();
  selected = Math.min(selected, state.occurrences.length - 1);
  dirty = true;
  renderAll();
  queueSave();
}

async function loadRecording(id) {
  if (loading || exporting) return;
  if (dirty || saving) {
    try { await save(); } catch (error) { $('recording').value = data.id; throw error; }
  }
  loading = true;
  $('recording').disabled = true;
  $('workspace').setAttribute('aria-busy', 'true');
  $('workspace').inert = true;
  document.querySelector('.audio-desk').inert = true;
  updateSaveStatus();
  audio.pause();
  loopRange = null;
  const sequence = ++loadSequence;
  try {
    const [detail, waveform] = await Promise.all([api(`/api/recordings/${id}/detail`), api(`/api/recordings/${id}/waveform`)]);
    if (sequence !== loadSequence) return;
    data = detail; state = clone(detail.state); revision = detail.revision; peaks = waveform;
    downloadNotice = ''; renderDownloadNotice();
    tokenMap = new Map(data.recording.tokens.map((token) => [token.tokenKey, token]));
    selected = 0; activeIndex = -1; lastPlaybackTime = -1; undo = []; redo = []; dirty = false; saveConflict = false;
    $('recording').value = id;
    audio.src = `/api/recordings/${id}/audio`;
    audio.playbackRate = Number($('speed').value);
    $('seek').max = String(data.recording.durationSeconds);
    $('seek').value = '0';
    $('time').textContent = `0:00 / ${time(data.recording.durationSeconds)}`;
    const uncued = data.recording.split === 'uncued-demonstration';
    $('recording-meta').textContent = `${time(data.recording.durationSeconds)} · ${data.recording.tokens.length} words · ${uncued ? 'No existing cues used' : 'Local model proposal'}`;
    $('passage-title').textContent = data.recording.title;
    windowStart = 0;
    $('insert-token').replaceChildren(...data.recording.tokens.map((token) => {
      const option = element('option', `${token.annotatedText} · ${verseLabel(token)}`);
      option.value = token.tokenKey;
      return option;
    }));
    for (const id of ['play', 'review-play', 'back', 'replay', 'seek', 'align', 'earlier', 'later', 'start', 'use-playhead', 'accept']) $(id).disabled = false;
    renderAll();
  } finally {
    loading = false;
    $('recording').disabled = false;
    $('workspace').setAttribute('aria-busy', 'false');
    $('workspace').inert = false;
    document.querySelector('.audio-desk').inert = false;
    updateSaveStatus();
    if (data) $('recording').value = data.id;
  }
}

function selectWord(index, scroll = false) {
  if (!state || !state.occurrences[index]) return;
  selected = index;
  loopRange = null;
  const start = state.occurrences[index].startSample / rate;
  const windowSize = Number($('zoom').value);
  if (windowSize) windowStart = Math.max(0, Math.min(start - windowSize * .25, data.recording.durationSeconds - windowSize));
  renderInspector(); renderWordStates(); draw();
  if (scroll) scrollWordWithinPassage(index);
  document.dispatchEvent(new Event('aligner-selection'));
}

function scrollWordWithinPassage(index) {
  const word = wordButtons[index];
  if (!word) return;
  const passage = $('passage'), box = word.getBoundingClientRect(), bounds = passage.getBoundingClientRect();
  if (box.top < bounds.top) passage.scrollTop += box.top - bounds.top - 12;
  else if (box.bottom > bounds.bottom) passage.scrollTop += box.bottom - bounds.bottom + 12;
}

async function replayWord() {
  const row = state.occurrences[selected];
  const start = Math.max(0, row.startSample - state.replayLeadSamples) / rate;
  const end = row.endAccepted && row.endSample !== null ? row.endSample / rate : state.occurrences[selected + 1]?.startSample / rate || data.recording.durationSeconds;
  loopRange = { start, end };
  audio.currentTime = start;
  await audio.play();
}

function setStart(sample) {
  if (!Number.isFinite(sample)) throw new Error('Enter a valid onset in seconds.');
  edit((next) => {
    const row = next.occurrences[selected];
    row.startSample = Math.round(sample); row.accepted = false;
    row.endAccepted = false;
    next.performanceReviewedLinear = false;
  });
}

function renderPassage() {
  const fragment = document.createDocumentFragment();
  let verse, group, previousVerse;
  wordButtons = [];
  for (const [index, row] of state.occurrences.entries()) {
    const token = tokenMap.get(row.tokenKey), verseId = verseLabel(token);
    if (verseId !== previousVerse) {
      verse = element('div', undefined, 'verse');
      const v = token.verse;
      const marker = element('span', v ? `${v.chapter}:${v.verse}` : '', 'verse-label');
      marker.title = verseId;
      group = element('div', undefined, 'verse-words');
      group.lang = 'he'; group.dir = 'rtl';
      verse.append(marker, group); fragment.append(verse); previousVerse = verseId;
    }
    const button = element('button', token.annotatedText, 'word');
    button.dataset.index = String(index);
    button.addEventListener('click', action(async () => { selectWord(index); await replayWord(); }));
    group.append(button); wordButtons.push(button);
  }
  $('passage').replaceChildren(fragment);
}

function renderWordStates() {
  const flags = new Set(data.proposal.events.filter((_, i) => !state.eventReviews[String(i)]).map((event) => event.tokenKey));
  state.occurrences.forEach((row, index) => {
    const button = wordButtons[index];
    if (!button) return;
    button.classList.toggle('selected', selected === index);
    button.classList.toggle('playing', activeIndex === index && !audio.paused);
    button.classList.toggle('accepted', row.accepted);
    button.classList.toggle('flagged', flags.has(row.tokenKey));
    button.setAttribute('aria-pressed', String(selected === index));
    button.setAttribute('aria-label', `${tokenMap.get(row.tokenKey).annotatedText}, ${verseLabel(tokenMap.get(row.tokenKey))}, occurrence ${index + 1}, ${row.accepted ? 'timing reviewed' : 'unreviewed'}`);
  });
}

function setInput(id, value) {
  if (document.activeElement !== $(id)) $(id).value = value;
}

function renderInspector() {
  const row = state.occurrences[selected], token = tokenMap.get(row.tokenKey);
  const original = data.proposal.occurrences.find((item) => item.occurrenceId === row.occurrenceId);
  $('selected-word').textContent = token.annotatedText;
  $('selected-verse').textContent = verseLabel(token);
  $('word-position').textContent = `${selected + 1} / ${state.occurrences.length}`;
  $('previous').disabled = selected === 0;
  $('next').disabled = selected === state.occurrences.length - 1;
  setInput('start', (row.startSample / rate).toFixed(3));
  setInput('end', row.endSample === null ? '' : (row.endSample / rate).toFixed(3));
  setInput('note', row.note);
  $('end-accepted').checked = row.endAccepted;
  $('model-onset').textContent = original ? `Model onset ${(original.sourceStartSample / rate).toFixed(3)} s · ${row.accepted ? 'timing reviewed' : 'awaiting your review'}` : 'Manually added occurrence · timing needs review';
  $('unreview').hidden = !row.accepted;
  $('accept').textContent = selected === state.occurrences.length - 1 ? 'Mark timing reviewed' : 'Mark timing reviewed & next';
  const evidence = [];
  const tails = data.proposal.reviewDiagnostics?.possibleTails || [];
  const tail = tails.find((item) => item.tokenKey === row.tokenKey);
  if (tail) evidence.push(`Possible sustained tail after this word${tail.accentNames?.length ? ` (${tail.accentNames.join(', ')})` : ''}. Listen through the next onset before setting an end.`);
  for (const [i, event] of data.proposal.events.entries()) {
    if (event.tokenKey === row.tokenKey && !state.eventReviews[String(i)]) evidence.push(flagLabel(event));
  }
  $('word-evidence').replaceChildren(...evidence.map((text) => element('p', text)));
}

function flagLabel(event) {
  const labels = {
    ambiguous_repeated_prefix: 'Possible partial restart or rearticulation. The model cannot distinguish them yet.',
    candidate_skip: 'Possible missing word match. Check whether the word was read.',
    partial_display_token: 'Only part of this word group was matched. Check each maqaf part.',
    unassigned_audio: 'Audio outside the matched words needs listening review.',
    uncertain_region_anchor: 'The boundary between alignment regions needs review.',
    unresolved_word: 'This word could not be placed reliably.', unclear_audio: 'Audio quality limits what can be verified.',
  };
  return labels[event.kind] || event.kind.replaceAll('_', ' ');
}

function eventIndex(event) {
  const key = event.tokenKey || event.beforeTokenKey;
  if (key) {
    const index = state.occurrences.findIndex((row) => row.tokenKey === key);
    if (index >= 0) return index;
  }
  const sample = event.sourceStartSample ?? event.sourceSample ?? 0;
  return state.occurrences.reduce((best, row, i) => Math.abs(row.startSample - sample) < Math.abs(state.occurrences[best].startSample - sample) ? i : best, 0);
}

function renderEvents() {
  const children = data.proposal.events.map((event, index) => {
    const key = String(index), decision = state.eventReviews[key];
    const section = element('div', undefined, `event${decision ? ' resolved' : ''}`);
    section.id = `reading-flag-${index}`;
    section.append(element('p', flagLabel(event)));
    const field = element('textarea'); field.rows = 2; field.maxLength = 2000;
    field.placeholder = 'Your listening decision and any correction'; field.value = decision || '';
    field.setAttribute('aria-label', `Review note for flag ${index + 1}`);
    const controls = element('div', undefined, 'event-actions');
    const listen = element('button', 'Listen');
    listen.addEventListener('click', action(async () => {
      selectWord(eventIndex(event), true);
      const sample = event.sourceStartSample ?? event.sourceSample ?? state.occurrences[selected].startSample;
      loopRange = null; audio.currentTime = Math.max(0, sample / rate - .5); await audio.play();
    }));
    const review = element('button', decision ? 'Reopen flag' : 'Save decision');
    review.addEventListener('click', action(() => {
      if (!decision && field.value.trim().length < 3) throw new Error('Add a listening decision before resolving this flag.');
      edit((next) => {
        if (decision) delete next.eventReviews[key]; else next.eventReviews[key] = field.value.trim();
        next.performanceReviewedLinear = false;
      }, { rerenderEvents: true });
    }));
    controls.append(listen, review); section.append(field, controls);
    return section;
  });
  const keys = new Set(state.occurrences.map((row) => row.tokenKey));
  const missing = data.recording.tokens.filter((token) => !keys.has(token.tokenKey));
  for (const token of missing) {
    const notice = element('div', undefined, 'event');
    notice.append(element('p', `No occurrence for ${token.annotatedText} (${verseLabel(token)}). If you hear it, use “Add a performed word” in word details.`));
    const choose = element('button', 'Choose this word for insertion');
    choose.addEventListener('click', () => { $('insert-token').value = token.tokenKey; $('word-details').open = true; toggleReview(false); $('insert-token').focus(); });
    notice.append(choose); children.push(notice);
  }
  $('events').replaceChildren(...children.length ? children : [element('p', 'No structural flags. The full recording still needs listening review.', 'empty-flags')]);
  const tails = data.proposal.reviewDiagnostics?.possibleTails || [];
  $('tail-summary').textContent = `${tails.length} possible sustained tails`;
  $('tails').replaceChildren(...tails.map((tail) => {
    const token = tokenMap.get(tail.tokenKey);
    const button = element('button', `${token?.annotatedText || 'Voiced gap'} · ${time(tail.sourceStartSample / rate, true)} · ${(tail.accentNames || []).join(', ')}`);
    button.addEventListener('click', action(async () => { selectWord(eventIndex(tail), true); await replayWord(); }));
    return button;
  }));
}

function exportBlockers() {
  const blockers = [];
  if (!state.reviewer.trim()) blockers.push('add your name');
  const unreviewed = state.occurrences.filter((row) => !row.accepted).length;
  if (!state.performanceReviewedLinear) blockers.push('confirm the complete recording');
  if (unreviewed) blockers.push(`review ${unreviewed} word timing${unreviewed === 1 ? '' : 's'}`);
  const flags = data.proposal.events.length - Object.keys(state.eventReviews).length;
  if (flags) blockers.push(`resolve ${flags} reading flag${flags === 1 ? '' : 's'}`);
  if (state.occurrences.map((row) => row.tokenKey).join('|') !== data.recording.tokens.map((token) => token.tokenKey).join('|')) blockers.push('retain repeats or missing words in a review package');
  if (state.includeAcousticEnds && state.occurrences.some((row) => !row.endAccepted || row.endSample === null)) blockers.push('review every end');
  if (state.includeAcousticEnds && state.occurrences.some((row, i) => i > 0 && state.occurrences[i - 1].endSample > row.startSample - state.playbackLeadSamples)) blockers.push('reduce highlight lead to avoid end overlap');
  return blockers;
}

function renderReview(events = false) {
  const reviewed = state.occurrences.filter((row) => row.accepted).length;
  const flags = data.proposal.events.length - Object.keys(state.eventReviews).length;
  $('review-count').textContent = `${reviewed} of ${state.occurrences.length} timings reviewed`;
  $('flag-count').textContent = `${flags} reading flag${flags === 1 ? '' : 's'}`;
  setInput('reviewer', state.reviewer);
  setInput('lead', state.playbackLeadSamples / 16);
  setInput('preroll', state.replayLeadSamples / 16);
  $('linear').checked = state.performanceReviewedLinear;
  $('include-ends').checked = state.includeAcousticEnds;
  $('accept-all').disabled = !state.performanceReviewedLinear || !state.reviewer.trim();
  renderDownloadControls();
  if (events) renderEvents();
}

function renderDownloadControls() {
  const unavailable = !state || loading || Boolean(exporting) || saveConflict;
  const blockers = state ? exportBlockers() : [];
  $('quick-download-cues').disabled = unavailable;
  $('download-cues').disabled = unavailable || (!generatedCueExport && Boolean(blockers.length));
  $('download-review').disabled = unavailable;
  for (const id of ['quick-download-cues', 'download-cues']) {
    $(id).textContent = exporting?.endsWith('cues') ? 'Preparing cues…' : 'Download Tikkun cues';
  }
  $('quick-download-cues').title = generatedCueExport ? 'Download generated timings with saved review flags. Review in Tikkun admin.' : blockers.length ? 'Open the remaining review steps before downloading.' : 'Download the reviewed timings as a Tikkun cue JSON file.';
  $('export-gate').textContent = !state ? 'Opening recording…' : blockers.length
    ? generatedCueExport ? 'Download now and review in Tikkun admin. Pending flags stay in the cue file.' : `To download: ${blockers.join('; ')}.`
    : `${state.occurrences.length} cues ready. The file is checked for Tikkun compatibility before download.`;
}

function renderDownloadNotice() {
  const panelOpen = !$('review-panel').hidden;
  for (const [id, visible] of [['download-notice', !panelOpen], ['review-download-notice', panelOpen]]) {
    $(id).textContent = downloadNotice;
    $(id).hidden = !downloadNotice || !visible;
  }
}

function renderAll() {
  renderPassage(); renderInspector(); renderReview(true); renderWordStates(); updateSaveStatus(); draw();
}

function toggleReview(open) {
  $('review-panel').hidden = !open;
  $('review-toggle').setAttribute('aria-expanded', String(open));
  updateReviewAccessibility();
  renderError();
  renderDownloadNotice();
  if (open) $('review-close').focus(); else $('review-toggle').focus();
}

const mobileReview = matchMedia('(max-width:700px)');
function updateReviewAccessibility() {
  const modal = mobileReview.matches && !$('review-panel').hidden;
  for (const selector of ['.topbar', '.recording-bar', '.reading', '.inspector', '.audio-desk', '.batch-navigation']) {
    const surface = document.querySelector(selector);
    if (surface) surface.inert = modal || (loading && ['.reading', '.inspector', '.audio-desk'].includes(selector));
  }
  if (modal) { $('review-panel').setAttribute('role', 'dialog'); $('review-panel').setAttribute('aria-modal', 'true'); }
  else { $('review-panel').removeAttribute('role'); $('review-panel').removeAttribute('aria-modal'); }
}
mobileReview.addEventListener('change', updateReviewAccessibility);

function visibleWindow() {
  const width = Number($('zoom').value) || data.recording.durationSeconds;
  return [windowStart, Math.min(data.recording.durationSeconds, windowStart + width)];
}

function draw() {
  if (!data || !peaks) return;
  const size = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(size.width * dpr) || canvas.height !== Math.round(size.height * dpr)) {
    canvas.width = Math.round(size.width * dpr); canvas.height = Math.round(size.height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = size.width, height = size.height;
  ctx.clearRect(0, 0, width, height);
  const [start, end] = visibleWindow(), span = end - start;
  if (span <= 0) return;
  const x = (seconds) => (seconds - start) / span * width;
  const row = state.occurrences[selected], next = state.occurrences[selected + 1];
  const rowEnd = row.endAccepted && row.endSample !== null ? row.endSample / rate : next?.startSample / rate || data.recording.durationSeconds;
  ctx.fillStyle = '#dce9f3';
  ctx.fillRect(Math.max(0, x(row.startSample / rate)), 0, Math.min(width, x(rowEnd)) - Math.max(0, x(row.startSample / rate)), height - 18);
  const mid = (height - 18) / 2, amplitude = mid * .92;
  ctx.strokeStyle = '#849aab'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let pixel = 0; pixel < width; pixel += 1) {
    const first = Math.max(0, Math.floor((start + pixel / width * span) * rate / peaks.stepSamples));
    const last = Math.min(peaks.min.length - 1, Math.ceil((start + (pixel + 1) / width * span) * rate / peaks.stepSamples));
    let min = 0, max = 0;
    for (let i = first; i <= last; i++) { min = Math.min(min, peaks.min[i]); max = Math.max(max, peaks.max[i]); }
    ctx.moveTo(pixel, mid - max / 32768 * amplitude); ctx.lineTo(pixel, mid - min / 32768 * amplitude);
  }
  ctx.stroke();
  ctx.font = '10px -apple-system, sans-serif';
  for (const [i, item] of state.occurrences.entries()) {
    const position = x(item.startSample / rate);
    if (position < 0 || position > width) continue;
    ctx.strokeStyle = i === selected ? '#245f96' : '#bac9d1'; ctx.lineWidth = i === selected ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(position, 6); ctx.lineTo(position, height - 20); ctx.stroke();
    if (span <= 16) { ctx.fillStyle = '#455e6c'; ctx.fillText(String(i + 1), position + 3, 12); }
  }
  const original = data.proposal.occurrences.find((item) => item.occurrenceId === row.occurrenceId);
  if (original?.sourceEndSample && Number($('zoom').value)) {
    const position = x(original.sourceEndSample / rate);
    ctx.setLineDash([3, 4]); ctx.strokeStyle = '#946b35'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(position, 20); ctx.lineTo(position, height - 23); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.fillStyle = '#5b6468';
  for (let i = 0; i <= 4; i++) {
    const seconds = start + span * i / 4;
    const text = time(seconds, span <= 16);
    const position = Math.min(width - ctx.measureText(text).width, width * i / 4);
    ctx.fillText(text, position, height - 2);
  }
  ctx.strokeStyle = '#153d60'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x(audio.currentTime), 0); ctx.lineTo(x(audio.currentTime), height - 18); ctx.stroke();
}

function updatePlayback() {
  if (data && (audio.currentTime !== lastPlaybackTime || !audio.paused)) {
    const seconds = audio.currentTime;
    lastPlaybackTime = seconds;
    if (loopRange && seconds >= loopRange.end && !audio.paused) {
      if ($('loop').checked && !loopRange.once) audio.currentTime = loopRange.start;
      else { audio.pause(); loopRange = null; }
    }
    const sample = seconds * rate + state.playbackLeadSamples;
    let index = -1;
    for (let i = 0; i < state.occurrences.length && state.occurrences[i].startSample <= sample; i++) index = i;
    if (index !== activeIndex) {
      activeIndex = index; renderWordStates();
      if ($('follow').checked && !audio.paused && index >= 0) {
        const button = wordButtons[index], box = button.getBoundingClientRect(), parent = $('passage').getBoundingClientRect();
        if (box.bottom > parent.bottom || box.top < parent.top) $('passage').scrollTop += box.top - parent.top - 45;
      }
    }
    const windowSize = Number($('zoom').value);
    if ($('follow').checked && !audio.paused && windowSize && (seconds > windowStart + windowSize * .9 || seconds < windowStart)) {
      windowStart = Math.max(0, Math.min(seconds - windowSize * .2, data.recording.durationSeconds - windowSize));
    }
    if (document.activeElement !== $('seek')) $('seek').value = String(seconds);
    $('time').textContent = `${time(seconds)} / ${time(data.recording.durationSeconds)}`;
    $('review-time').textContent = $('time').textContent;
    draw();
  }
  requestAnimationFrame(updatePlayback);
}

function download(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = element('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function exportFile(kind) {
  if (loading || exporting || !data) return;
  const id = data.id;
  exporting = kind;
  downloadNotice = '';
  $('recording').disabled = true;
  renderDownloadControls(); renderDownloadNotice();
  try {
    await save();
    const value = await api(`/api/recordings/${id}/export`, { revision, kind });
    const name = `${id}-${kind.endsWith('cues') ? 'tikkun-cues' : 'review'}.json`;
    download(value, name);
    downloadNotice = `Download started: ${name}. Check your browser’s downloads.`;
  } finally {
    exporting = null;
    $('recording').disabled = loading;
    renderDownloadControls(); renderDownloadNotice();
  }
}

async function loadHistory() {
  const id = data.id;
  const result = await api(endpoint('history'));
  if (id !== data.id) return;
  $('history').replaceChildren(...result.revisions.map((row) => {
    const option = element('option', `${new Date(row.savedAt).toLocaleString()} · ${row.reviewer || 'Unnamed reviewer'}`);
    option.value = row.revision; return option;
  }));
  if (!result.revisions.length) $('history').append(element('option', 'No saved revisions yet'));
  $('restore').disabled = !result.revisions.length;
}

async function refreshCatalog() {
  const result = await api('/api/catalog');
  catalog = result.recordings; csrf = result.csrf;
  generatedCueExport = result.generatedCueExport === true;
  const ordered = [...catalog].sort((a, b) => Number(b.generated) - Number(a.generated) || Number(b.uncued) - Number(a.uncued) || a.title.localeCompare(b.title, undefined, { numeric: true }));
  $('recording').replaceChildren(...ordered.map((recording) => {
    const option = element('option', `${recording.title}${recording.generated ? ' · new run' : recording.uncued ? ' · uncued' : ''}`);
    option.value = recording.id; return option;
  }));
  if (data) $('recording').value = data.id;
  return result;
}

async function pollJob() {
  clearTimeout(jobTimer);
  const response = await api('/api/job'); job = response.job;
  $('job').hidden = !job;
  if (!job) return;
  $('job-text').textContent = job.status === 'failed' ? `${job.title}: ${job.error}` : `${job.title} · ${job.phase}${job.elapsedSeconds ? ` · ${job.elapsedSeconds.toFixed(1)} s` : ''}`;
  $('open-result').hidden = job.status !== 'complete';
  $('align').disabled = job.status === 'running';
  if (job.status === 'running') jobTimer = setTimeout(() => pollJob().catch(showError), 1500);
}

$('recording').addEventListener('change', action(() => loadRecording($('recording').value)));
$('save').addEventListener('click', action(save));
$('undo').addEventListener('click', () => moveHistory(undo, redo));
$('redo').addEventListener('click', () => moveHistory(redo, undo));
$('previous').addEventListener('click', () => selectWord(selected - 1, true));
$('next').addEventListener('click', () => selectWord(selected + 1, true));
$('earlier').addEventListener('click', action(() => setStart(state.occurrences[selected].startSample - 320)));
$('later').addEventListener('click', action(() => setStart(state.occurrences[selected].startSample + 320)));
$('start').addEventListener('change', action(() => { setStart($('start').valueAsNumber * rate); renderInspector(); }));
$('use-playhead').addEventListener('click', action(() => setStart(audio.currentTime * rate)));
$('accept').addEventListener('click', action(() => { edit((next) => { next.occurrences[selected].accepted = true; }); selectWord(Math.min(selected + 1, state.occurrences.length - 1), true); }));
$('unreview').addEventListener('click', action(() => edit((next) => { next.occurrences[selected].accepted = false; next.performanceReviewedLinear = false; })));
$('note').addEventListener('change', action(() => edit((next) => { next.occurrences[selected].note = $('note').value; })));
$('end').addEventListener('change', action(() => edit((next) => {
  const value = $('end').value === '' ? null : Math.round($('end').valueAsNumber * rate);
  if (value !== null && !Number.isFinite(value)) throw new Error('Enter a valid end in seconds.');
  next.occurrences[selected].endSample = value; next.occurrences[selected].endAccepted = false;
})));
$('end-accepted').addEventListener('change', action(() => {
  if ($('end-accepted').checked && state.occurrences[selected].endSample === null) { $('end-accepted').checked = false; throw new Error('Set an end time before accepting it.'); }
  edit((next) => { next.occurrences[selected].endAccepted = $('end-accepted').checked; });
}));
$('insert').addEventListener('click', action(() => {
  const sample = Math.round(audio.currentTime * rate);
  let position = state.occurrences.findIndex((row) => row.startSample > sample);
  if (position < 0) position = state.occurrences.length;
  edit((next) => {
    next.occurrences.splice(position, 0, { occurrenceId: `manual:${crypto.randomUUID()}`, tokenKey: $('insert-token').value,
      startSample: sample, endSample: null, accepted: false, endAccepted: false, note: '' });
    next.performanceReviewedLinear = false;
  }, { structural: true, rerenderEvents: true });
  selectWord(position, true);
}));
$('remove').addEventListener('click', action(() => edit((next) => { next.occurrences.splice(selected, 1); next.performanceReviewedLinear = false; }, { structural: true, rerenderEvents: true })));
$('review-toggle').addEventListener('click', () => toggleReview($('review-panel').hidden));
$('review-close').addEventListener('click', () => toggleReview(false));
$('reviewer').addEventListener('change', action(() => edit((next) => { next.reviewer = $('reviewer').value; })));
for (const [id, key] of [['lead', 'playbackLeadSamples'], ['preroll', 'replayLeadSamples']]) {
  $(id).addEventListener('change', action(() => {
    const value = Math.round($(id).valueAsNumber * 16);
    if (!Number.isInteger(value) || value < 0 || value > 16000) throw new Error('Enter a lead from 0 to 1,000 milliseconds.');
    edit((next) => { next[key] = value; });
  }));
}
$('linear').addEventListener('change', action(() => edit((next) => { next.performanceReviewedLinear = $('linear').checked; })));
$('include-ends').addEventListener('change', action(() => edit((next) => { next.includeAcousticEnds = $('include-ends').checked; })));
$('accept-all').addEventListener('click', action(() => {
  if (!state.performanceReviewedLinear || !state.reviewer.trim()) throw new Error('Add your name and confirm full recording review first.');
  edit((next) => { for (const row of next.occurrences) row.accepted = true; });
}));
$('download-review').addEventListener('click', action(() => exportFile('review')));
$('download-cues').addEventListener('click', action(() => exportFile(generatedCueExport ? 'generated-cues' : 'cues')));
$('quick-download-cues').addEventListener('click', action(async () => {
  if (!generatedCueExport && exportBlockers().length) {
    toggleReview(true);
    $('review-panel').scrollTop = 0;
    $('cue-export').focus({ preventScroll: true });
  } else await exportFile(generatedCueExport ? 'generated-cues' : 'cues');
}));
$('history-details').addEventListener('toggle', action(() => $('history-details').open && loadHistory()));
$('restore').addEventListener('click', action(async () => {
  const restored = await api(`${endpoint('revision')}?id=${$('history').value}`);
  edit((next) => Object.assign(next, restored.state), { structural: true, rerenderEvents: true });
  await save(); await loadHistory();
}));
async function togglePlayback() {
  loopRange = null;
  if (audio.paused) await audio.play(); else audio.pause();
}
$('play').addEventListener('click', action(togglePlayback));
$('review-play').addEventListener('click', action(togglePlayback));
$('back').addEventListener('click', () => { loopRange = null; audio.currentTime = Math.max(0, audio.currentTime - 5); });
$('replay').addEventListener('click', action(replayWord));
$('loop').addEventListener('change', action(async () => { if ($('loop').checked) await replayWord(); }));
$('speed').addEventListener('change', () => { audio.playbackRate = Number($('speed').value); });
$('seek').addEventListener('input', () => { loopRange = null; audio.currentTime = Number($('seek').value); });
$('zoom').addEventListener('change', () => { windowStart = Number($('zoom').value) ? Math.max(0, audio.currentTime - Number($('zoom').value) * .25) : 0; draw(); });
canvas.addEventListener('click', action((event) => {
  if (!data) return;
  const rect = canvas.getBoundingClientRect(), [start, end] = visibleWindow();
  const seconds = start + Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * (end - start);
  if (event.shiftKey) setStart(seconds * rate); else { loopRange = null; audio.currentTime = seconds; }
}));
canvas.addEventListener('keydown', (event) => {
  if (!data || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault(); loopRange = null;
  audio.currentTime = Math.max(0, Math.min(data.recording.durationSeconds, audio.currentTime + (event.key === 'ArrowRight' ? .02 : -.02)));
});
for (const event of ['play', 'pause', 'ended']) audio.addEventListener(event, () => {
  $('play-label').textContent = audio.paused ? 'Play' : 'Pause';
  $('review-play').textContent = audio.paused ? 'Play audio' : 'Pause audio';
  $('play-icon').setAttribute('d', audio.paused ? 'M8 5l11 7-11 7z' : 'M6 5h4v14H6zM14 5h4v14h-4z');
  if (data) renderWordStates();
});
audio.addEventListener('error', () => showError(new Error('Audio could not be loaded. Check the private server, then select the recording again.')));
$('align').addEventListener('click', action(async () => {
  await save(); await api(endpoint('align'), {}); await pollJob();
  document.dispatchEvent(new Event('aligner-run-requested'));
}));
$('open-result').addEventListener('click', action(async () => { await refreshCatalog(); await loadRecording(job.resultId); $('job').hidden = true; }));
function dismissError() { currentError = ''; renderError(); }
$('dismiss-error').addEventListener('click', dismissError);
$('review-dismiss-error').addEventListener('click', dismissError);
function downloadRecovery() {
  if (state) download({ schemaVersion: 'torah-private-review-recovery-v1', id: data.id, baseRevision: revision, state }, `${data.id}-recovery.json`);
}
$('download-unsaved').addEventListener('click', downloadRecovery);
$('review-download-unsaved').addEventListener('click', downloadRecovery);
document.addEventListener('keydown', action(async (event) => {
  if (event.key === 'Escape' && !$('review-panel').hidden) toggleReview(false);
  if (event.key === 'Tab' && mobileReview.matches && !$('review-panel').hidden) {
    const controls = [...$('review-panel').querySelectorAll('button:not(:disabled),input,select,textarea,summary')]
      .filter((node) => node.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  if ((event.metaKey || event.ctrlKey) && event.key === 's') { event.preventDefault(); await save(); }
  if (event.code === 'Space' && data && !$('workspace').hidden && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'SUMMARY'].includes(event.target.tagName)) {
    event.preventDefault(); loopRange = null; if (audio.paused) await audio.play(); else audio.pause();
  }
}));
window.addEventListener('beforeunload', (event) => { if (dirty || saving) { event.preventDefault(); event.returnValue = ''; } });
new ResizeObserver(draw).observe(canvas);
requestAnimationFrame(updatePlayback);

try {
  const result = await refreshCatalog();
  await loadRecording(result.defaultId);
  await pollJob();
} catch (error) {
  showError(error);
  $('passage-title').textContent = 'Recording unavailable';
  $('passage-hint').textContent = 'Check the error above. Reload after restoring the missing private artifact.';
}

function reviewSession() { return { data, state, selected, revision }; }
function replayInterval(start, end) {
  loopRange = { start, end, once: true };
  audio.currentTime = start;
  return audio.play();
}
export { api, save, edit, selectWord, replayWord, loadRecording, refreshCatalog,
  toggleReview, reviewSession, replayInterval, showError, element, time, eventIndex };
