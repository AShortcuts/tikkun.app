export function renderRecordingDependenciesWorker(manifest, namespace) {
  return `
const DEPENDENCY_METADATA = ${JSON.stringify(manifest)}
const DEPENDENCY_CACHE_NAME = 'tikkun-dependencies-${namespace}'
const activeDependencyFiles = new Map()

function dependencyCacheName(url) {
  if (SHELL_URLS.includes(url)) return SHELL_CACHE_NAME
  if (TORAH_PAGE_PATHS.has(url)) return TORAH_CACHE_NAME
  return DEPENDENCY_CACHE_NAME
}

function requestedDependencies(data, manifest) {
  if (!DEPENDENCY_METADATA.version || data.version !== DEPENDENCY_METADATA.version) {
    throw new Error('Offline content belongs to another app build. Apply the available update and reload.')
  }
  if (!Array.isArray(data.cues) || data.cues.length > (data.type === 'PREFLIGHT_RECORDING_DOWNLOADS' ? 10_000 : 32) || data.cues.some((source) =>
    typeof source !== 'string' || !Object.hasOwn(manifest.cues, source))) {
    throw new Error('Unknown published timing dependency.')
  }
  const assets = [...manifest.core, ...data.cues.flatMap((source) => manifest.cues[source])]
  return [...new Map(assets.map((asset) => [asset.url, asset])).values()]
}

async function dependencyStored(asset) {
  const cache = await caches.open(dependencyCacheName(asset.url))
  const response = await cache.match(asset.url)
  return Boolean(response && response.status === 200 && await validateRecordingCacheBody(response, asset))
}

async function dependencyManifest(prepare, signal, readOnly = false) {
  const asset = DEPENDENCY_METADATA.asset
  let response
  if (!await dependencyStored(asset)) {
    if (readOnly) response = await withOfflineTransferSlot(signal, () => fetchDependency(asset, signal))
    else {
      if (!prepare) return null
      await acquireDependency(asset, signal)
    }
  }
  if (!response) {
    const cache = await caches.open(dependencyCacheName(asset.url))
    response = await cache.match(asset.url)
  }
  if (!response) throw new Error('Offline dependency catalog is missing.')
  const manifest = await response.json()
  if (manifest.version !== DEPENDENCY_METADATA.version || !Array.isArray(manifest.core) || !manifest.cues) {
    throw new Error('Offline dependency catalog is invalid.')
  }
  return manifest
}

async function fetchDependency(asset, signal) {
  signal.throwIfAborted()
  const response = await fetch(new URL(asset.url, self.location.origin).href, { signal, cache: 'reload', redirect: 'error' })
  if (response.status !== 200) {
    await response.body?.cancel()
    throw new Error('Required offline content could not be downloaded.')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Offline content has no response body.')
  const bytes = new Uint8Array(asset.byteLength)
  const hasher = createSha256()
  let offset = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      if (chunk.done) break
      if (offset + chunk.value.byteLength > bytes.length) throw new Error('Offline content size changed.')
      bytes.set(chunk.value, offset)
      hasher.update(chunk.value)
      offset += chunk.value.byteLength
    }
    if (offset !== bytes.length || hasher.digestHex() !== asset.digest) throw new Error('Offline content failed integrity verification.')
    signal.throwIfAborted()
    const headers = new Headers(response.headers)
    headers.delete('Content-Encoding')
    headers.set('Content-Length', String(bytes.length))
    return new Response(bytes, { status: 200, headers })
  } finally {
    await reader.cancel().finally(() => reader.releaseLock())
  }
}

async function transferDependency(asset, signal) {
  return withOfflineTransferSlot(signal, async () => {
    const response = await fetchDependency(asset, signal)
    signal.throwIfAborted()
    const cache = await caches.open(dependencyCacheName(asset.url))
    await cache.put(asset.url, response)
  })
}

async function acquireDependency(asset, signal) {
  signal.throwIfAborted()
  let operation = activeDependencyFiles.get(asset.url)
  if (operation?.controller.signal.aborted) {
    await operation.promise.catch(() => {})
    signal.throwIfAborted()
    operation = activeDependencyFiles.get(asset.url)
  }
  if (!operation) {
    const controller = new AbortController()
    operation = { asset, controller, users: new Set(), promise: null }
    const owner = operation
    owner.promise = transferDependency(asset, controller.signal).finally(() => {
      if (activeDependencyFiles.get(asset.url) === owner) activeDependencyFiles.delete(asset.url)
    })
    activeDependencyFiles.set(asset.url, owner)
  }
  const owner = operation
  const user = Symbol()
  owner.users.add(user)
  const cancel = () => {
    owner.users.delete(user)
    if (!owner.users.size) owner.controller.abort()
  }
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) cancel()
  try { await owner.promise; signal.throwIfAborted() }
  finally { signal.removeEventListener('abort', cancel); owner.users.delete(user) }
}

async function preflightRecordingBatch(data, signal, progress) {
  if (!Array.isArray(data.recordings) || !data.recordings.length || data.recordings.length > 10_000) {
    throw new Error('Invalid offline download batch.')
  }
  const audio = new Map()
  const addAudio = (asset) => {
    const previous = audio.get(asset.url)
    if (previous && (previous.digest !== asset.digest || previous.byteLength !== asset.byteLength)) {
      throw new Error('Conflicting recording identities in download batch.')
    }
    audio.set(asset.url, asset)
  }
  data.recordings.map(parseRecordingDescriptor).forEach(addAudio)
  const manifest = await dependencyManifest(false, signal, true)
  const support = new Map([DEPENDENCY_METADATA.asset, ...requestedDependencies(data, manifest)]
    .map((asset) => [asset.url, asset]))
  // Include transfers already started by other clients of this worker. Queued
  // work in other tabs still requires application-wide queue coordination.
  let activeCount = 0
  for (const operation of activeRecordingOperations.values()) {
    if (operation.kind !== 'download' || operation.settled || operation.abortController.signal.aborted) continue
    addAudio(operation.descriptor)
    activeCount += 1
  }
  for (const operation of activeDependencyFiles.values()) {
    if (operation.controller.signal.aborted) continue
    support.set(operation.asset.url, operation.asset)
    activeCount += 1
  }
  const missing = []
  const reservationAssets = []
  const cache = await caches.open(RECORDING_CACHE_NAME)
  for (const asset of audio.values()) {
    signal.throwIfAborted()
    const response = await cache.match(asset.url)
    const metadata = response && recordingCacheMetadata(response)
    let valid = false
    if (metadata && metadata.digest === asset.digest && metadata.byteLength === asset.byteLength &&
        recordingCacheUrlMatchesMetadata(asset.url, metadata)) {
      const known = verifiedRecordingCacheEntries.get(asset.url)
      valid = known?.signature === recordingCacheValidationSignature(metadata)
        ? await known.promise : await validateRecordingCacheBody(response, metadata)
      if (valid) rememberRecordingCacheValidation(asset.url, metadata)
    }
    if (!valid) { missing.push(asset.byteLength); reservationAssets.push({ url: asset.url, byteLength: asset.byteLength }) }
    progress()
  }
  for (const asset of support.values()) {
    signal.throwIfAborted()
    if (!await dependencyStored(asset)) { missing.push(asset.byteLength); reservationAssets.push({ url: new URL(asset.url, self.location.origin).href, byteLength: asset.byteLength }) }
    progress()
  }
  // CacheStorage can retain existing content while staging incoming writes.
  // Keep a conservative extra copy for each possible concurrent write, plus a
  // safety reserve. Never credit a stored old version as already reclaimed.
  const missingBytes = missing.reduce((sum, bytes) => sum + bytes, 0)
  const stagingBytes = missing.sort((a, b) => b - a).slice(0, Math.max(2, activeCount)).reduce((sum, bytes) => sum + bytes, 0)
  const requiredBytes = missing.length ? missingBytes + stagingBytes + 33_554_432 : 0
  if (!Number.isSafeInteger(requiredBytes)) throw new Error('Offline download batch size is too large.')
  let estimate
  try { estimate = await self.navigator?.storage?.estimate() }
  catch (error) { console.warn('Browser download capacity is unavailable.', error) }
  const validBytes = (value) => Number.isSafeInteger(value) && value >= 0
  const availableBytes = validBytes(estimate?.quota) && validBytes(estimate?.usage)
    ? Math.max(0, estimate.quota - estimate.usage) : null
  signal.throwIfAborted()
  if (availableBytes !== null && requiredBytes > availableBytes) {
    throw new Error('Not enough browser storage for this batch. Remove downloads or choose fewer recordings.')
  }
  return { requiredBytes, missingBytes, stagingBytes, availableBytes, reservationAssets }
}

async function handleRecordingDependencies(event) {
  const reporter = createMessageReporter(event)
  const controller = new AbortController()
  const port = event.ports?.[0]
  if (port) {
    port.onmessage = (message) => { if (message.data?.type === 'CANCEL_RECORDING_DEPENDENCIES') controller.abort() }
    port.start?.()
  }
  const preflight = event.data.type === 'PREFLIGHT_RECORDING_DOWNLOADS'
  const post = (state, extra = {}) => reporter.post({ type: preflight ? 'RECORDING_PREFLIGHT' : 'RECORDING_DEPENDENCIES', version: DEPENDENCY_METADATA.version, state, ...extra })
  try {
    if (!DEPENDENCY_METADATA.version || event.data.version !== DEPENDENCY_METADATA.version) {
      throw new Error('Offline content belongs to another app build. Apply the available update and reload.')
    }
    if (preflight) {
      post('ready', await preflightRecordingBatch(event.data, controller.signal, () => post('progress')))
      return
    }
    const manifest = await dependencyManifest(event.data.type === 'PREPARE_RECORDING_DEPENDENCIES', controller.signal)
    if (!manifest) { post('missing'); return }
    const assets = requestedDependencies(event.data, manifest)
    let completedBytes = 0
    const totalBytes = assets.reduce((sum, asset) => sum + asset.byteLength, 0)
    for (const asset of assets) {
      controller.signal.throwIfAborted()
      if (!await dependencyStored(asset)) {
        if (event.data.type === 'GET_RECORDING_DEPENDENCIES') { post('missing', { totalBytes }); return }
        await acquireDependency(asset, controller.signal)
      }
      completedBytes += asset.byteLength
      post('progress', { completedBytes, totalBytes })
    }
    controller.signal.throwIfAborted()
    post('ready', { totalBytes })
  } catch (error) {
    post('error', { errorMessage: controller.signal.aborted ? 'Offline content preparation cancelled.' : error.message || 'Offline content preparation failed.' })
  } finally {
    if (port) port.onmessage = null
    reporter.close()
  }
}
`
}
