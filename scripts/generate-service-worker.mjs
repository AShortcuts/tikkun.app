import { createHash } from 'node:crypto'
import { readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const distRoot = path.join(repoRoot, 'dist')
const clientManifestPath = path.join(
  repoRoot,
  '.svelte-kit',
  'output',
  'client',
  '.vite',
  'manifest.json'
)
const clientAppPath = path.join(
  repoRoot,
  '.svelte-kit',
  'generated',
  'client-optimized',
  'app.js'
)

const excludedPathPrefixes = [
  'audio/',
  '.vite/',
  'prototypes/',
  'assets/images/prototypes/',
]
const excludedExtensions = new Set([
  '.aac',
  '.aiff',
  '.flac',
  '.m4a',
  '.m4v',
  '.mov',
  '.mp3',
  '.mp4',
  '.ogg',
  '.opus',
  '.wav',
  '.webm',
])
const deferredSourcePatterns = [
  /^audio-cues\//,
  /^app\/admin\/cue-authoring\.ts$/,
  /^app\/components\/CueAnalyticsPage\.ts$/,
  /^app\/video\/recording-harness\.ts$/,
  /^src\/routes\/prototypes\//,
]
const verificationFilePattern = /^google[A-Za-z0-9_-]+\.html$/
const nonCriticalFontPattern = /(?:^|\/)Lora-Regular(?:\.[A-Za-z0-9_-]+)?\.ttf$/
const hostControlFiles = new Set(['_headers', '_redirects'])

export const MAX_SHELL_PRECACHE_URLS = 64
export const MAX_SHELL_PRECACHE_RAW_BYTES = 1_600_000

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/')
}

export function normalizeBasePath(value = '') {
  if (!value || value === '/') return ''
  if (!value.startsWith('/')) {
    throw new Error('Deployment base path must be empty or start with "/"')
  }
  return value.replace(/\/+$/, '')
}

export function cacheNamespaceForBasePath(basePath = '') {
  const normalized = normalizeBasePath(basePath)
  return createHash('sha256')
    .update(normalized || '/')
    .digest('hex')
    .slice(0, 12)
}

export function toDeploymentUrl(filePath, basePath = '') {
  const normalized = normalizePath(filePath)
  const base = normalizeBasePath(basePath)
  if (normalized === 'index.html') return `${base}/`
  if (normalized.endsWith('/index.html')) {
    const route = normalized.slice(0, -'index.html'.length)
    return `${base}/${route
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/')}/`
  }
  return `${base}/${normalized.split('/').map(encodeURIComponent).join('/')}`
}

function filesForManifestEntry(entry) {
  if (!entry || typeof entry !== 'object') return []
  return [
    typeof entry.file === 'string' ? entry.file : null,
    ...(Array.isArray(entry.css) ? entry.css : []),
    ...(Array.isArray(entry.assets) ? entry.assets : []),
  ].filter((filePath) => typeof filePath === 'string')
}

function manifestImports(entry) {
  if (!entry || typeof entry !== 'object' || !Array.isArray(entry.imports)) {
    return []
  }
  // Dynamic entries are classified as roots; following app.js dynamic imports
  // would incorrectly make every deferred route and data module part of core.
  return entry.imports.filter((sourcePath) => typeof sourcePath === 'string')
}

function reachableManifestEntries(manifest, rootSourcePaths) {
  const reachable = new Set()
  const pending = [...rootSourcePaths]

  while (pending.length) {
    const sourcePath = pending.pop()
    if (reachable.has(sourcePath)) continue

    const entry = manifest[sourcePath]
    if (!entry || typeof entry !== 'object') continue
    reachable.add(sourcePath)
    pending.push(...manifestImports(entry))
  }

  return reachable
}

function filesForManifestEntries(manifest, sourcePaths) {
  const files = new Set()
  for (const sourcePath of sourcePaths) {
    for (const filePath of filesForManifestEntry(manifest[sourcePath])) {
      files.add(normalizePath(filePath))
    }
  }
  return files
}

export function prototypeRouteNodeSources(clientAppSource) {
  const nodeIds = new Set()
  const routePattern = /^\s*"\/prototypes[^"]*":\s*\[(\d+)(?:,\[([^\]]*)\])?\],?$/gm
  for (const match of clientAppSource.matchAll(routePattern)) {
    nodeIds.add(Number(match[1]))
    for (const layoutId of match[2]?.split(',') ?? []) {
      if (/^\d+$/.test(layoutId.trim())) nodeIds.add(Number(layoutId))
    }
  }
  return new Set(
    [...nodeIds].map(
      (nodeId) => `.svelte-kit/generated/client-optimized/nodes/${nodeId}.js`
    )
  )
}

export function classifyManifestFiles(manifest, deferredSourcePaths = new Set()) {
  const coreRoots = new Set()
  const deferredRoots = new Set()
  const torahPageFiles = []

  for (const [sourcePath, entry] of Object.entries(manifest)) {
    const normalizedSource = normalizePath(sourcePath)
    const isTextPage = normalizedSource.startsWith('text/pages/')
    const isDeferred =
      deferredSourcePaths.has(normalizedSource) ||
      deferredSourcePatterns.some((pattern) => pattern.test(normalizedSource))
    const isEntryPoint = entry?.isEntry === true || entry?.isDynamicEntry === true

    if (isTextPage || isDeferred) {
      deferredRoots.add(sourcePath)
    } else if (isEntryPoint) {
      coreRoots.add(sourcePath)
    }
    if (normalizedSource.startsWith('text/pages/torah/')) {
      const filePath = entry?.file
      if (typeof filePath === 'string') {
        torahPageFiles.push(normalizePath(filePath))
      }
    }
  }

  const deferredFiles = filesForManifestEntries(
    manifest,
    reachableManifestEntries(manifest, deferredRoots)
  )
  const coreFiles = filesForManifestEntries(
    manifest,
    reachableManifestEntries(manifest, coreRoots)
  )
  const excludedFiles = new Set(
    [...deferredFiles].filter((filePath) => !coreFiles.has(filePath))
  )

  return {
    excludedFiles,
    torahPageFiles: [...new Set(torahPageFiles)].sort(),
  }
}

export function isPageChunk(relativePath, manifest = null) {
  const normalized = normalizePath(relativePath)
  if (!manifest) return /^assets\/page-[A-Za-z0-9_-]+\.js$/.test(normalized)
  const { excludedFiles } = classifyManifestFiles(manifest)
  return excludedFiles.has(normalized)
}

export function shouldPrecache(relativePath, excludedFiles = new Set()) {
  const normalized = normalizePath(relativePath)
  if (normalized === 'service-worker.js') return false
  if (hostControlFiles.has(normalized)) return false
  if (excludedFiles.has(normalized)) return false
  if (excludedPathPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    return false
  }
  if (
    verificationFilePattern.test(normalized) ||
    nonCriticalFontPattern.test(normalized)
  ) {
    return false
  }
  return !excludedExtensions.has(path.extname(normalized).toLowerCase())
}

function htmlAttribute(tag, name) {
  const quoted = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i')
  )
  if (quoted) return quoted[1] ?? quoted[2] ?? ''

  const unquoted = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*([^\\s"'=<>]+)`, 'i')
  )
  return unquoted?.[1] ?? null
}

export function shellAssetReferencesFromHtml(
  htmlSource,
  htmlFile = 'index.html',
  basePath = ''
) {
  const base = normalizeBasePath(basePath)
  const origin = 'https://tikkun.invalid'
  const documentUrl = new URL(toDeploymentUrl(htmlFile, base), origin)
  const references = new Set()

  for (const match of htmlSource.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0]
    const rel = htmlAttribute(tag, 'rel')
    const href = htmlAttribute(tag, 'href')
    const relTokens = new Set(rel?.toLowerCase().split(/\s+/).filter(Boolean))
    if (
      !href ||
      (!relTokens.has('stylesheet') && !relTokens.has('modulepreload'))
    ) {
      continue
    }

    const resolved = new URL(href, documentUrl)
    if (resolved.origin !== origin) continue

    let deploymentPath = decodeURIComponent(resolved.pathname)
    if (base) {
      if (!deploymentPath.startsWith(`${base}/`)) continue
      deploymentPath = deploymentPath.slice(base.length)
    }
    const outputPath = normalizePath(deploymentPath).replace(/^\/+/, '')
    if (outputPath) references.add(outputPath)
  }

  return [...references].sort()
}

export function assertPrecachedHtmlDependencies({
  shellFiles,
  htmlSources,
  basePath = '',
}) {
  const shellFileSet = new Set(shellFiles.map(normalizePath))
  const missing = []

  for (const [htmlFile, htmlSource] of htmlSources) {
    for (const dependency of shellAssetReferencesFromHtml(
      htmlSource,
      htmlFile,
      basePath
    )) {
      if (!shellFileSet.has(dependency)) {
        missing.push(`${normalizePath(htmlFile)} -> ${dependency}`)
      }
    }
  }

  if (missing.length) {
    throw new Error(
      `Service-worker shell omits assets required by precached HTML: ${missing.join('; ')}`
    )
  }
}

export function assertShellPrecacheBudget({ urlCount, rawBytes }) {
  const violations = []
  if (urlCount > MAX_SHELL_PRECACHE_URLS) {
    violations.push(
      `${urlCount} URLs exceeds ${MAX_SHELL_PRECACHE_URLS}-URL limit`
    )
  }
  if (rawBytes > MAX_SHELL_PRECACHE_RAW_BYTES) {
    violations.push(
      `${rawBytes} raw bytes exceeds ${MAX_SHELL_PRECACHE_RAW_BYTES}-byte limit`
    )
  }
  if (violations.length) {
    throw new Error(
      `Service-worker shell precache budget exceeded: ${violations.join('; ')}. Defer nonessential routes or assets.`
    )
  }
}

export function torahPageFilesFromManifest(manifest) {
  return classifyManifestFiles(manifest).torahPageFiles
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return walk(entryPath)
      return entry.isFile() ? [entryPath] : []
    })
  )
  return files.flat()
}

export function renderServiceWorkerSource({
  basePath = '',
  buildHash,
  shellUrls,
  torahPageUrls,
}) {
  const cacheNamespace = cacheNamespaceForBasePath(basePath)
  return `const BASE_PATH = '${normalizeBasePath(basePath)}'
const APP_FALLBACK_URL = BASE_PATH + '/'
const SHELL_CACHE_PREFIX = 'tikkun-shell-${cacheNamespace}-'
const SHELL_CACHE_NAME = SHELL_CACHE_PREFIX + '${buildHash}'
const TORAH_CACHE_NAME = 'tikkun-torah-${cacheNamespace}'
const RECORDING_CACHE_NAME = 'tikkun-recordings-${cacheNamespace}'
const SHELL_URLS = ${JSON.stringify(shellUrls, null, 2)}
const TORAH_PAGE_URLS = ${JSON.stringify(torahPageUrls, null, 2)}
const TORAH_PAGE_PATHS = new Set(TORAH_PAGE_URLS)
const TORAH_DOWNLOAD_CONCURRENCY = 4
const RECORDING_PROGRESS_INTERVAL_BYTES = 256 * 1024
const RECORDING_VERSION_PARAM = 'tikkun-media'
const RECORDING_AUDIO_ID_HEADER = 'X-Tikkun-Audio-Id'
const RECORDING_DIGEST_HEADER = 'X-Tikkun-Media-Digest'
const MEDIA_PATH_PREFIX = BASE_PATH + '/audio/'
const MEDIA_EXTENSION_RE = /\\.(?:aac|aiff|flac|m4a|m4v|mov|mp3|mp4|ogg|opus|wav|webm)$/i
const SHA256_INITIAL_STATE = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
])
const SHA256_ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])
let activeTorahDownload = null
const activeRecordingOperations = new Map()
const verifiedRecordingCacheEntries = new Map()
let recordingOperationGeneration = 0
let activeOtherRecordingRemoval = null
let activeAllRecordingRemoval = null

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      removeObsoleteShellCaches(),
      pruneTorahCache(),
      pruneRecordingCache(),
    ])
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting())
    return
  }

  if (event.data?.type === 'GET_TORAH_DOWNLOAD_STATUS') {
    event.waitUntil(reportTorahDownloadStatus(event))
    return
  }

  if (event.data?.type === 'DOWNLOAD_TORAH_PAGES') {
    event.waitUntil(handleTorahDownload(event))
    return
  }

  if (event.data?.type === 'GET_RECORDING_DOWNLOAD_STATUS') {
    event.waitUntil(reportRecordingDownloadStatus(event))
    return
  }

  if (event.data?.type === 'GET_RECORDING_DOWNLOAD_INVENTORY') {
    event.waitUntil(reportRecordingDownloadInventory(event))
    return
  }

  if (event.data?.type === 'DOWNLOAD_RECORDING') {
    event.waitUntil(handleRecordingDownload(event))
    return
  }

  if (event.data?.type === 'REMOVE_RECORDING_DOWNLOAD') {
    event.waitUntil(handleRecordingRemoval(event))
    return
  }

  if (event.data?.type === 'REMOVE_OTHER_RECORDING_DOWNLOADS') {
    event.waitUntil(handleOtherRecordingRemoval(event))
    return
  }

  if (event.data?.type === 'REMOVE_ALL_RECORDING_DOWNLOADS') {
    event.waitUntil(handleAllRecordingRemoval(event))
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith(MEDIA_PATH_PREFIX)) {
    if (request.method === 'GET' || request.method === 'HEAD') {
      event.respondWith(serveRecordingRequest(request))
    }
    return
  }
  if (MEDIA_EXTENSION_RE.test(url.pathname)) {
    return
  }
  if (request.method !== 'GET') return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, APP_FALLBACK_URL))
    return
  }

  const cacheName = TORAH_PAGE_PATHS.has(url.pathname)
    ? TORAH_CACHE_NAME
    : SHELL_CACHE_NAME
  event.respondWith(cacheFirst(request, cacheName))
})

function createMessageReporter(event) {
  const port = event.ports?.[0] ?? null
  const source = event.source
  return {
    post(message) {
      if (port) port.postMessage(message)
      else source?.postMessage(message)
    },
    close() {
      port?.close()
    },
  }
}

async function reportTorahDownloadStatus(event) {
  const reporter = createMessageReporter(event)
  try {
    reporter.post(await getTorahDownloadStatus())
  } finally {
    reporter.close()
  }
}

async function handleTorahDownload(event) {
  const reporter = createMessageReporter(event)
  try {
    const currentStatus = await getTorahDownloadStatus()
    reporter.post({ ...currentStatus, state: currentStatus.complete ? 'complete' : 'downloading' })
    if (currentStatus.complete) return

    if (!activeTorahDownload) {
      activeTorahDownload = downloadTorahPages((status) => reporter.post(status))
        .finally(() => {
          activeTorahDownload = null
        })
    }
    const completedStatus = await activeTorahDownload
    reporter.post({ ...completedStatus, state: 'complete' })
  } catch (error) {
    const status = await getTorahDownloadStatus()
    reporter.post({
      ...status,
      state: 'error',
      errorMessage:
        error instanceof Error ? error.message : 'The Torah download failed.',
    })
  } finally {
    reporter.close()
  }
}

function parseRecordingDescriptor(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('The recording download request is invalid.')
  }
  const audioId = value.audioId
  const title = value.title
  const digest = value.digest
  const byteLength = value.byteLength
  if (
    typeof audioId !== 'string' ||
    !audioId ||
    audioId.length > 200 ||
    typeof title !== 'string' ||
    !title ||
    title.length > 500 ||
    typeof digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(digest) ||
    !Number.isSafeInteger(byteLength) ||
    byteLength <= 0 ||
    typeof value.url !== 'string'
  ) {
    throw new Error('The recording download request is invalid.')
  }

  const url = new URL(value.url, self.location.origin)
  if (
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(MEDIA_PATH_PREFIX) ||
    url.searchParams.get(RECORDING_VERSION_PARAM) !== digest
  ) {
    throw new Error('The recording download URL is invalid.')
  }
  url.hash = ''
  return { audioId, title, url: url.href, digest, byteLength }
}

function recordingStatus(
  descriptor,
  state,
  downloadedBytes,
  errorMessage,
  cacheFacts = {
    exactStored: false,
    otherCount: 0,
    otherBytes: 0,
  }
) {
  return {
    type: 'RECORDING_DOWNLOAD_STATUS',
    audioId: descriptor.audioId,
    state,
    downloadedBytes,
    totalBytes: descriptor.byteLength,
    otherCount: cacheFacts.otherCount,
    otherBytes: cacheFacts.otherBytes,
    exactStored: cacheFacts.exactStored === true || state === 'complete',
    complete: state === 'complete',
    ...(errorMessage ? { errorMessage } : {}),
  }
}

function recordingCacheMetadata(cached) {
  const audioId = cached.headers.get(RECORDING_AUDIO_ID_HEADER)
  const digest = cached.headers.get(RECORDING_DIGEST_HEADER)
  const lengthValue = cached.headers.get('Content-Length') ?? ''
  const byteLength = /^\\d+$/.test(lengthValue) ? Number(lengthValue) : NaN
  if (
    cached.status !== 200 ||
    !cached.body ||
    !audioId ||
    !digest ||
    !/^[a-f0-9]{64}$/.test(digest) ||
    !Number.isSafeInteger(byteLength) ||
    byteLength <= 0
  ) {
    return null
  }
  return { audioId, digest, byteLength }
}

function recordingCacheValidationSignature(metadata) {
  return metadata.audioId + ':' + metadata.digest + ':' + metadata.byteLength
}

function recordingCacheUrlMatchesMetadata(requestUrl, metadata) {
  const url = new URL(requestUrl)
  return (
    url.origin === self.location.origin &&
    url.pathname.startsWith(MEDIA_PATH_PREFIX) &&
    url.searchParams.get(RECORDING_VERSION_PARAM) === metadata.digest
  )
}

function forgetRecordingCacheValidation(requestUrl) {
  verifiedRecordingCacheEntries.delete(
    typeof requestUrl === 'string' ? requestUrl : requestUrl.url
  )
}

function rememberRecordingCacheValidation(requestUrl, metadata) {
  verifiedRecordingCacheEntries.set(requestUrl, {
    signature: recordingCacheValidationSignature(metadata),
    promise: Promise.resolve(true),
  })
}

async function deleteRecordingCacheEntry(cache, request) {
  forgetRecordingCacheValidation(request)
  return cache.delete(request)
}

async function validateRecordingCacheBody(cached, metadata) {
  const reader = cached.body?.getReader()
  if (!reader) return false

  const hasher = createSha256()
  let bytesRead = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytesRead += chunk.value.byteLength
      if (bytesRead > metadata.byteLength) {
        await reader.cancel('Cached recording exceeded its published size.')
        return false
      }
      hasher.update(chunk.value)
    }
  } catch {
    return false
  }
  return bytesRead === metadata.byteLength && hasher.digestHex() === metadata.digest
}

async function ensureRecordingCacheEntryValid(cache, request, cached, metadata) {
  const requestUrl = typeof request === 'string' ? request : request.url
  const signature = recordingCacheValidationSignature(metadata)
  const current = verifiedRecordingCacheEntries.get(requestUrl)
  if (current?.signature === signature) return current.promise

  const entry = {
    signature,
    promise: validateRecordingCacheBody(cached, metadata),
  }
  verifiedRecordingCacheEntries.set(requestUrl, entry)
  const valid = await entry.promise
  if (!valid && verifiedRecordingCacheEntries.get(requestUrl) === entry) {
    verifiedRecordingCacheEntries.delete(requestUrl)
    await cache.delete(request)
  }
  return valid
}

async function inspectRecordingCache(descriptor) {
  const cache = await caches.open(RECORDING_CACHE_NAME)
  const requests = await cache.keys()
  let exactStored = false
  let otherCount = 0
  let otherBytes = 0
  await Promise.all(
    requests.map(async (request) => {
      const cached = await cache.match(request)
      if (!cached) return
      const metadata = recordingCacheMetadata(cached)
      if (!metadata) {
        await deleteRecordingCacheEntry(cache, request)
        return
      }
      if (request.url === descriptor.url) {
        const metadataMatches =
          metadata.audioId === descriptor.audioId &&
          metadata.digest === descriptor.digest &&
          metadata.byteLength === descriptor.byteLength &&
          recordingCacheUrlMatchesMetadata(request.url, metadata)
        if (!metadataMatches) {
          await deleteRecordingCacheEntry(cache, request)
        } else if (
          await ensureRecordingCacheEntryValid(
            cache,
            request,
            cached,
            metadata
          )
        ) {
          exactStored = true
        }
        return
      }
      otherCount += 1
      otherBytes += metadata.byteLength
    })
  )
  return { exactStored, otherCount, otherBytes }
}

async function readRecordingDownloadStatus(descriptor) {
  const facts = await inspectRecordingCache(descriptor)
  return recordingStatus(
    descriptor,
    facts.exactStored ? 'complete' : 'idle',
    facts.exactStored ? descriptor.byteLength : 0,
    undefined,
    facts
  )
}

function liveRecordingOperationStatus(descriptor) {
  const operation = activeRecordingOperations.get(descriptor.audioId) ?? null
  if (!operation || operation.descriptor.url !== descriptor.url) return null
  if (operation.settled) return operation.terminalStatus
  return recordingStatus(
    descriptor,
    operation.kind === 'download' ? 'downloading' : 'removing',
    operation.downloadedBytes,
    undefined,
    operation.cacheFacts
  )
}

async function readLiveRecordingDownloadStatus(descriptor) {
  const activeStatus = liveRecordingOperationStatus(descriptor)
  if (activeStatus) return activeStatus

  const cachedStatus = await readRecordingDownloadStatus(descriptor)
  return liveRecordingOperationStatus(descriptor) ?? cachedStatus
}

function recordingInventoryStatus(
  state,
  inventory,
  errorMessage
) {
  return {
    type: 'RECORDING_DOWNLOAD_INVENTORY_STATUS',
    state,
    count: inventory.count,
    totalBytes: inventory.totalBytes,
    complete: inventory.count === 0 && state !== 'removing' && state !== 'error',
    ...(errorMessage ? { errorMessage } : {}),
  }
}

async function inspectRecordingInventory() {
  const cache = await caches.open(RECORDING_CACHE_NAME)
  const requests = await cache.keys()
  let count = 0
  let totalBytes = 0
  await Promise.all(
    requests.map(async (request) => {
      const cached = await cache.match(request)
      const metadata = cached ? recordingCacheMetadata(cached) : null
      if (!metadata || !recordingCacheUrlMatchesMetadata(request.url, metadata)) {
        await deleteRecordingCacheEntry(cache, request)
        return
      }
      count += 1
      totalBytes += metadata.byteLength
    })
  )
  return { count, totalBytes }
}

async function readRecordingInventoryCacheStatus() {
  return recordingInventoryStatus('idle', await inspectRecordingInventory())
}

async function readLiveRecordingInventoryStatus() {
  const operation = activeAllRecordingRemoval
  if (operation?.settled) return operation.terminalStatus
  const inventory = await inspectRecordingInventory()
  if (activeAllRecordingRemoval?.settled) {
    return activeAllRecordingRemoval.terminalStatus
  }
  if (activeAllRecordingRemoval || activeOtherRecordingRemoval) {
    return recordingInventoryStatus('removing', inventory)
  }
  return recordingInventoryStatus('idle', inventory)
}

async function recordingInventoryErrorStatus(error) {
  const errorMessage =
    error instanceof Error ? error.message : 'The recording inventory operation failed.'
  try {
    const status = await readRecordingInventoryCacheStatus()
    return { ...status, state: 'error', complete: false, errorMessage }
  } catch {
    return recordingInventoryStatus('error', { count: 0, totalBytes: 0 }, errorMessage)
  }
}

async function recordingErrorStatus(descriptor, error) {
  const errorMessage =
    error instanceof Error ? error.message : 'The recording operation failed.'
  try {
    const status = await readRecordingDownloadStatus(descriptor)
    return {
      ...status,
      state: 'error',
      complete: false,
      errorMessage,
    }
  } catch {
    return recordingStatus(descriptor, 'error', 0, errorMessage)
  }
}

async function reportRecordingDownloadStatus(event) {
  const reporter = createMessageReporter(event)
  try {
    const descriptor = parseRecordingDescriptor(event.data?.recording)
    reporter.post(await readLiveRecordingDownloadStatus(descriptor))
  } catch (error) {
    const audioId =
      typeof event.data?.recording?.audioId === 'string'
        ? event.data.recording.audioId
        : ''
    reporter.post({
      type: 'RECORDING_DOWNLOAD_STATUS',
      audioId,
      state: 'error',
      downloadedBytes: 0,
      totalBytes: 0,
      otherCount: 0,
      otherBytes: 0,
      exactStored: false,
      complete: false,
      errorMessage:
        error instanceof Error ? error.message : 'The recording status could not be checked.',
    })
  } finally {
    reporter.close()
  }
}

async function reportRecordingDownloadInventory(event) {
  const reporter = createMessageReporter(event)
  try {
    reporter.post(await readLiveRecordingInventoryStatus())
  } catch (error) {
    reporter.post(await recordingInventoryErrorStatus(error))
  } finally {
    reporter.close()
  }
}

async function handleRecordingDownload(event) {
  const reporter = createMessageReporter(event)
  let descriptor = null
  let operation = null
  try {
    descriptor = parseRecordingDescriptor(event.data?.recording)
    if (activeOtherRecordingRemoval || activeAllRecordingRemoval) {
      const currentStatus = await readRecordingDownloadStatus(descriptor)
      reporter.post({
        ...currentStatus,
        state: 'error',
        complete: false,
        errorMessage:
          'Offline recordings are still being removed. Wait for that operation to finish and try again.',
      })
      return
    }
    const currentStatus = await readRecordingDownloadStatus(descriptor)
    if (currentStatus.complete) {
      reporter.post(currentStatus)
      return
    }

    if (activeOtherRecordingRemoval || activeAllRecordingRemoval) {
      reporter.post({
        ...currentStatus,
        state: 'error',
        complete: false,
        errorMessage:
          'Offline recordings are still being removed. Wait for that operation to finish and try again.',
      })
      return
    }
    operation = activeRecordingOperations.get(descriptor.audioId) ?? null
    if (
      operation &&
      (operation.kind !== 'download' || operation.descriptor.url !== descriptor.url)
    ) {
      reporter.post({
        ...currentStatus,
        state: 'error',
        complete: false,
        errorMessage:
          'Another offline operation is still running for this recording. Wait for it to finish and try again.',
      })
      return
    }
    if (!operation) {
      operation = startRecordingDownloadOperation(descriptor, currentStatus)
    }
    operation.reporters.add(reporter)
    reporter.post(
      recordingStatus(
        descriptor,
        'downloading',
        operation.downloadedBytes,
        undefined,
        operation.cacheFacts
      )
    )
    reporter.post(await operation.promise)
  } catch (error) {
    const fallback = descriptor ?? {
      audioId:
        typeof event.data?.recording?.audioId === 'string'
          ? event.data.recording.audioId
          : '',
      byteLength: 0,
    }
    reporter.post(await recordingErrorStatus(fallback, error))
  } finally {
    if (operation) releaseRecordingOperation(operation, reporter)
    reporter.close()
  }
}

async function handleRecordingRemoval(event) {
  const reporter = createMessageReporter(event)
  let descriptor = null
  let operation = null
  try {
    descriptor = parseRecordingDescriptor(event.data?.recording)
    if (activeOtherRecordingRemoval || activeAllRecordingRemoval) {
      const currentStatus = await readRecordingDownloadStatus(descriptor)
      reporter.post({
        ...currentStatus,
        state: 'error',
        complete: false,
        errorMessage:
          'Offline recordings are still being removed. Wait for that operation to finish and try again.',
      })
      return
    }
    const currentStatus = await readRecordingDownloadStatus(descriptor)
    if (activeOtherRecordingRemoval || activeAllRecordingRemoval) {
      reporter.post({
        ...currentStatus,
        state: 'error',
        complete: false,
        errorMessage:
          'Offline recordings are still being removed. Wait for that operation to finish and try again.',
      })
      return
    }
    operation = activeRecordingOperations.get(descriptor.audioId) ?? null
    if (
      operation &&
      (operation.kind !== 'remove-current' ||
        operation.descriptor.url !== descriptor.url)
    ) {
      reporter.post({
        ...currentStatus,
        state: 'error',
        complete: false,
        errorMessage:
          'This recording is still being saved. Wait for that operation to finish, then remove it.',
      })
      return
    }
    if (!operation) {
      operation = startRecordingRemovalOperation(
        descriptor,
        currentStatus
      )
    }
    operation.reporters.add(reporter)
    reporter.post(
      recordingStatus(
        descriptor,
        'removing',
        currentStatus.downloadedBytes,
        undefined,
        currentStatus
      )
    )
    reporter.post(await operation.promise)
  } catch (error) {
    const fallback = descriptor ?? {
      audioId:
        typeof event.data?.recording?.audioId === 'string'
          ? event.data.recording.audioId
          : '',
      byteLength: 0,
    }
    reporter.post(await recordingErrorStatus(fallback, error))
  } finally {
    if (operation) releaseRecordingOperation(operation, reporter)
    reporter.close()
  }
}

async function handleOtherRecordingRemoval(event) {
  const reporter = createMessageReporter(event)
  let descriptor = null
  let operation = null
  try {
    descriptor = parseRecordingDescriptor(event.data?.recording)
    if (activeAllRecordingRemoval) {
      const currentStatus = await readRecordingDownloadStatus(descriptor)
      reporter.post({
        ...currentStatus,
        state: 'error',
        complete: false,
        errorMessage:
          'Offline recordings are already being removed. Wait for that operation to finish and try again.',
      })
      return
    }
    operation = activeOtherRecordingRemoval
    if (operation && operation.descriptor.url !== descriptor.url) {
      const currentStatus = await readRecordingDownloadStatus(descriptor)
      reporter.post({
        ...currentStatus,
        state: 'error',
        complete: false,
        errorMessage:
          'Other offline recordings are already being removed for another active recording.',
      })
      return
    }
    if (!operation) {
      if (activeRecordingOperations.size > 0) {
        const currentStatus = await readRecordingDownloadStatus(descriptor)
        reporter.post({
          ...currentStatus,
          state: 'error',
          complete: false,
          errorMessage:
            'A recording operation is still running. Wait for it to finish before removing other recordings.',
        })
        return
      }
      operation = startOtherRecordingRemovalOperation(descriptor)
    }
    operation.reporters.add(reporter)
    reporter.post(recordingStatus(descriptor, 'removing', 0))
    reporter.post(await operation.promise)
  } catch (error) {
    const fallback = descriptor ?? {
      audioId:
        typeof event.data?.recording?.audioId === 'string'
          ? event.data.recording.audioId
          : '',
      byteLength: 0,
    }
    reporter.post(await recordingErrorStatus(fallback, error))
  } finally {
    if (operation) releaseOtherRecordingRemovalOperation(operation, reporter)
    reporter.close()
  }
}

async function handleAllRecordingRemoval(event) {
  const reporter = createMessageReporter(event)
  let operation = null
  try {
    if (activeOtherRecordingRemoval) {
      reporter.post({
        ...(await readRecordingInventoryCacheStatus()),
        state: 'error',
        complete: false,
        errorMessage:
          'Offline recordings are already being removed. Wait for that operation to finish and try again.',
      })
      return
    }
    operation = activeAllRecordingRemoval
    if (!operation) {
      if (activeRecordingOperations.size > 0) {
        reporter.post({
          ...(await readRecordingInventoryCacheStatus()),
          state: 'error',
          complete: false,
          errorMessage:
            'A recording operation is still running. Wait for it to finish before removing saved recordings.',
        })
        return
      }
      operation = startAllRecordingRemovalOperation()
    }
    operation.reporters.add(reporter)
    const inventory = await inspectRecordingInventory()
    reporter.post(recordingInventoryStatus('removing', inventory))
    reporter.post(await operation.promise)
  } catch (error) {
    reporter.post(await recordingInventoryErrorStatus(error))
  } finally {
    if (operation) releaseAllRecordingRemovalOperation(operation, reporter)
    reporter.close()
  }
}

function createRecordingOperation(kind, descriptor, cacheFacts) {
  const operation = {
    kind,
    descriptor,
    generation: ++recordingOperationGeneration,
    downloadedBytes: kind === 'download' ? 0 : cacheFacts.downloadedBytes,
    cacheFacts: {
      exactStored: cacheFacts.exactStored,
      otherCount: cacheFacts.otherCount,
      otherBytes: cacheFacts.otherBytes,
    },
    reporters: new Set(),
    settled: false,
    terminalStatus: null,
    promise: null,
  }
  activeRecordingOperations.set(descriptor.audioId, operation)
  return operation
}

function reportRecordingOperationProgress(operation, downloadedBytes) {
  operation.downloadedBytes = downloadedBytes
  const status = recordingStatus(
    operation.descriptor,
    'downloading',
    downloadedBytes,
    undefined,
    operation.cacheFacts
  )
  for (const reporter of operation.reporters) {
    try {
      reporter.post(status)
    } catch {
      operation.reporters.delete(reporter)
    }
  }
}

function finishRecordingOperation(operation, promise) {
  operation.promise = promise.then((status) => {
    operation.settled = true
    operation.terminalStatus = status
    if (
      operation.reporters.size === 0 &&
      activeRecordingOperations.get(operation.descriptor.audioId) === operation
    ) {
      activeRecordingOperations.delete(operation.descriptor.audioId)
    }
    return status
  })
  return operation
}

function startRecordingDownloadOperation(descriptor, currentStatus) {
  const operation = createRecordingOperation(
    'download',
    descriptor,
    currentStatus
  )
  return finishRecordingOperation(
    operation,
    downloadRecording(descriptor, (downloadedBytes) => {
      reportRecordingOperationProgress(operation, downloadedBytes)
    })
      .then(() => readRecordingDownloadStatus(descriptor))
      .catch((error) => recordingErrorStatus(descriptor, error))
  )
}

function startRecordingRemovalOperation(descriptor, currentStatus) {
  const operation = createRecordingOperation(
    'remove-current',
    descriptor,
    currentStatus
  )
  return finishRecordingOperation(
    operation,
    removeRecording(descriptor).catch((error) =>
      recordingErrorStatus(descriptor, error)
    )
  )
}

function releaseRecordingOperation(operation, reporter) {
  operation.reporters.delete(reporter)
  if (
    operation.settled &&
    operation.reporters.size === 0 &&
    activeRecordingOperations.get(operation.descriptor.audioId) === operation
  ) {
    activeRecordingOperations.delete(operation.descriptor.audioId)
  }
}

async function removeRecording(descriptor) {
  const cache = await caches.open(RECORDING_CACHE_NAME)
  const requests = await cache.keys()
  await settleRecordingCacheTasks(
    requests.map(async (request) => {
      if (request.url === descriptor.url) {
        await deleteRecordingCacheEntry(cache, request)
      }
    })
  )
  return readRecordingDownloadStatus(descriptor)
}

function startOtherRecordingRemovalOperation(descriptor) {
  const operation = {
    descriptor,
    generation: ++recordingOperationGeneration,
    reporters: new Set(),
    settled: false,
    promise: null,
  }
  activeOtherRecordingRemoval = operation
  operation.promise = removeOtherRecordings(descriptor)
    .catch((error) => recordingErrorStatus(descriptor, error))
    .then((status) => {
      operation.settled = true
      if (
        operation.reporters.size === 0 &&
        activeOtherRecordingRemoval === operation
      ) {
        activeOtherRecordingRemoval = null
      }
      return status
    })
  return operation
}

function releaseOtherRecordingRemovalOperation(operation, reporter) {
  operation.reporters.delete(reporter)
  if (
    operation.settled &&
    operation.reporters.size === 0 &&
    activeOtherRecordingRemoval === operation
  ) {
    activeOtherRecordingRemoval = null
  }
}

async function removeOtherRecordings(descriptor) {
  const cache = await caches.open(RECORDING_CACHE_NAME)
  const requests = await cache.keys()
  await settleRecordingCacheTasks(
    requests.map(async (request) => {
      if (request.url !== descriptor.url) {
        await deleteRecordingCacheEntry(cache, request)
      }
    })
  )
  return readRecordingDownloadStatus(descriptor)
}

function startAllRecordingRemovalOperation() {
  const operation = {
    generation: ++recordingOperationGeneration,
    reporters: new Set(),
    settled: false,
    terminalStatus: null,
    promise: null,
  }
  activeAllRecordingRemoval = operation
  operation.promise = removeAllRecordings()
    .catch((error) => recordingInventoryErrorStatus(error))
    .then((status) => {
      operation.settled = true
      operation.terminalStatus = status
      if (
        operation.reporters.size === 0 &&
        activeAllRecordingRemoval === operation
      ) {
        activeAllRecordingRemoval = null
      }
      return status
    })
  return operation
}

function releaseAllRecordingRemovalOperation(operation, reporter) {
  operation.reporters.delete(reporter)
  if (
    operation.settled &&
    operation.reporters.size === 0 &&
    activeAllRecordingRemoval === operation
  ) {
    activeAllRecordingRemoval = null
  }
}

async function removeAllRecordings() {
  const cache = await caches.open(RECORDING_CACHE_NAME)
  const requests = await cache.keys()
  await settleRecordingCacheTasks(
    requests.map((request) => deleteRecordingCacheEntry(cache, request))
  )
  return readRecordingInventoryCacheStatus()
}

async function settleRecordingCacheTasks(tasks) {
  const results = await Promise.allSettled(tasks)
  const failure = results.find((result) => result.status === 'rejected')
  if (failure) throw failure.reason
}

function rightRotate(value, amount) {
  return (value >>> amount) | (value << (32 - amount))
}

function createSha256() {
  const state = new Uint32Array(SHA256_INITIAL_STATE)
  const block = new Uint8Array(64)
  const words = new Uint32Array(64)
  let blockLength = 0
  let bytesHashed = 0
  let finished = false

  const transform = (bytes, offset) => {
    for (let index = 0; index < 16; index += 1) {
      const wordOffset = offset + index * 4
      words[index] =
        (bytes[wordOffset] << 24) |
        (bytes[wordOffset + 1] << 16) |
        (bytes[wordOffset + 2] << 8) |
        bytes[wordOffset + 3]
    }
    for (let index = 16; index < 64; index += 1) {
      const previous = words[index - 15]
      const earlier = words[index - 2]
      const sigma0 =
        rightRotate(previous, 7) ^
        rightRotate(previous, 18) ^
        (previous >>> 3)
      const sigma1 =
        rightRotate(earlier, 17) ^
        rightRotate(earlier, 19) ^
        (earlier >>> 10)
      words[index] =
        (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
    }

    let a = state[0]
    let b = state[1]
    let c = state[2]
    let d = state[3]
    let e = state[4]
    let f = state[5]
    let g = state[6]
    let h = state[7]
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)
      const choose = (e & f) ^ (~e & g)
      const temporary1 =
        (h + sum1 + choose + SHA256_ROUND_CONSTANTS[index] + words[index]) >>> 0
      const sum0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temporary2 = (sum0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temporary1) >>> 0
      d = c
      c = b
      b = a
      a = (temporary1 + temporary2) >>> 0
    }
    state[0] = (state[0] + a) >>> 0
    state[1] = (state[1] + b) >>> 0
    state[2] = (state[2] + c) >>> 0
    state[3] = (state[3] + d) >>> 0
    state[4] = (state[4] + e) >>> 0
    state[5] = (state[5] + f) >>> 0
    state[6] = (state[6] + g) >>> 0
    state[7] = (state[7] + h) >>> 0
  }

  const update = (chunk) => {
    if (finished) throw new Error('SHA-256 digest is already complete.')
    bytesHashed += chunk.byteLength
    let offset = 0
    if (blockLength > 0) {
      const take = Math.min(64 - blockLength, chunk.byteLength)
      block.set(chunk.subarray(0, take), blockLength)
      blockLength += take
      offset = take
      if (blockLength === 64) {
        transform(block, 0)
        blockLength = 0
      }
    }
    while (offset + 64 <= chunk.byteLength) {
      transform(chunk, offset)
      offset += 64
    }
    if (offset < chunk.byteLength) {
      block.set(chunk.subarray(offset), 0)
      blockLength = chunk.byteLength - offset
    }
  }

  const digestHex = () => {
    if (finished) throw new Error('SHA-256 digest is already complete.')
    finished = true
    const bitLengthHigh = Math.floor(bytesHashed / 0x20000000) >>> 0
    const bitLengthLow = (bytesHashed * 8) >>> 0
    block[blockLength] = 0x80
    blockLength += 1
    if (blockLength > 56) {
      block.fill(0, blockLength)
      transform(block, 0)
      blockLength = 0
    }
    block.fill(0, blockLength, 56)
    block[56] = bitLengthHigh >>> 24
    block[57] = bitLengthHigh >>> 16
    block[58] = bitLengthHigh >>> 8
    block[59] = bitLengthHigh
    block[60] = bitLengthLow >>> 24
    block[61] = bitLengthLow >>> 16
    block[62] = bitLengthLow >>> 8
    block[63] = bitLengthLow
    transform(block, 0)
    return Array.from(state, (word) => word.toString(16).padStart(8, '0')).join('')
  }

  return { update, digestHex }
}

async function downloadRecording(descriptor, onProgress) {
  const response = await fetch(descriptor.url, { credentials: 'same-origin' })
  if (!response.ok || response.status !== 200 || !response.body) {
    throw new Error('The recording could not be downloaded.')
  }
  const declaredLengthValue = response.headers.get('Content-Length')
  const declaredLength =
    declaredLengthValue && /^\\d+$/.test(declaredLengthValue)
      ? Number(declaredLengthValue)
      : null
  if (
    declaredLengthValue !== null &&
    (!Number.isSafeInteger(declaredLength) ||
      declaredLength !== descriptor.byteLength)
  ) {
    throw new Error('The downloaded recording size does not match the published file.')
  }

  const headers = new Headers(response.headers)
  headers.set('Content-Length', String(descriptor.byteLength))
  headers.set('Accept-Ranges', 'bytes')
  headers.set(RECORDING_AUDIO_ID_HEADER, descriptor.audioId)
  headers.set(RECORDING_DIGEST_HEADER, descriptor.digest)
  headers.set('ETag', '"sha256-' + descriptor.digest + '"')
  const reader = response.body.getReader()
  const hasher = createSha256()
  let downloadedBytes = 0
  let lastReportedBytes = 0
  const body = new ReadableStream({
    async pull(controller) {
      const chunk = await reader.read()
      if (chunk.done) {
        if (downloadedBytes !== descriptor.byteLength) {
          controller.error(
            new Error('The downloaded recording size does not match the published file.')
          )
          return
        }
        if (hasher.digestHex() !== descriptor.digest) {
          controller.error(
            new Error('The downloaded recording content does not match the published file.')
          )
          return
        }
        onProgress(downloadedBytes)
        controller.close()
        return
      }
      downloadedBytes += chunk.value.byteLength
      if (downloadedBytes > descriptor.byteLength) {
        await reader.cancel('Recording exceeded its published size.')
        controller.error(
          new Error('The downloaded recording size does not match the published file.')
        )
        return
      }
      hasher.update(chunk.value)
      controller.enqueue(chunk.value)
      if (
        downloadedBytes - lastReportedBytes >= RECORDING_PROGRESS_INTERVAL_BYTES
      ) {
        lastReportedBytes = downloadedBytes
        onProgress(downloadedBytes)
      }
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
  const cache = await caches.open(RECORDING_CACHE_NAME)
  forgetRecordingCacheValidation(descriptor.url)
  await cache.put(
    descriptor.url,
    new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  )
  // Download stream proved size and digest. Trust until this worker mutates the
  // entry; a restarted worker hashes it once before status or playback.
  rememberRecordingCacheValidation(descriptor.url, descriptor)

}

function parseByteRange(value, totalBytes) {
  const match = /^bytes=(\\d*)-(\\d*)$/.exec(value.trim())
  if (!match || (!match[1] && !match[2])) return null
  let start
  let end
  if (!match[1]) {
    const suffixLength = Number.parseInt(match[2], 10)
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null
    start = Math.max(0, totalBytes - suffixLength)
    end = totalBytes - 1
  } else {
    start = Number.parseInt(match[1], 10)
    end = match[2] ? Number.parseInt(match[2], 10) : totalBytes - 1
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= totalBytes ||
      end < start
    ) {
      return null
    }
    end = Math.min(end, totalBytes - 1)
  }
  return { start, end }
}

function streamByteRange(body, start, end) {
  const reader = body.getReader()
  let sourceOffset = 0
  let remaining = end - start + 1
  return new ReadableStream({
    async pull(controller) {
      while (remaining > 0) {
        const chunk = await reader.read()
        if (chunk.done) {
          controller.error(new Error('The cached recording ended unexpectedly.'))
          return
        }
        const chunkStart = sourceOffset
        const chunkEnd = sourceOffset + chunk.value.byteLength
        sourceOffset = chunkEnd
        if (chunkEnd <= start) continue
        const from = Math.max(0, start - chunkStart)
        const available = chunk.value.byteLength - from
        const take = Math.min(available, remaining)
        controller.enqueue(chunk.value.subarray(from, from + take))
        remaining -= take
        if (remaining === 0) {
          void reader.cancel('Requested byte range is complete.')
          controller.close()
        }
        return
      }
      controller.close()
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}

async function validatedRecordingCacheResponse(cache, requestUrl) {
  const cached = await cache.match(requestUrl)
  if (!cached) return null
  const metadata = recordingCacheMetadata(cached)
  if (!metadata || !recordingCacheUrlMatchesMetadata(requestUrl, metadata)) {
    await deleteRecordingCacheEntry(cache, requestUrl)
    return null
  }
  if (!(await ensureRecordingCacheEntryValid(
    cache,
    requestUrl,
    cached,
    metadata
  ))) {
    return null
  }

  const fresh = await cache.match(requestUrl)
  const freshMetadata = fresh ? recordingCacheMetadata(fresh) : null
  if (
    !fresh ||
    !freshMetadata ||
    recordingCacheValidationSignature(freshMetadata) !==
      recordingCacheValidationSignature(metadata)
  ) {
    forgetRecordingCacheValidation(requestUrl)
    return null
  }
  return { cached: fresh, metadata: freshMetadata }
}

async function serveRecordingRequest(request) {
  const cache = await caches.open(RECORDING_CACHE_NAME)
  const verified = await validatedRecordingCacheResponse(cache, request.url)
  if (!verified) return fetch(request)

  const { cached, metadata } = verified
  const headers = new Headers(cached.headers)
  const totalBytes = metadata.byteLength
  headers.set('Accept-Ranges', 'bytes')

  if (request.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      statusText: cached.statusText,
      headers,
    })
  }

  const rangeHeader = request.headers.get('Range')
  const ifRange = request.headers.get('If-Range')
  if (!rangeHeader || !ifRangeMatches(headers, ifRange)) {
    return new Response(cached.body, {
      status: 200,
      statusText: cached.statusText,
      headers,
    })
  }

  const range = parseByteRange(rangeHeader, totalBytes)
  if (!range) {
    headers.set('Content-Range', 'bytes */' + totalBytes)
    headers.set('Content-Length', '0')
    return new Response(null, { status: 416, headers })
  }

  const contentLength = range.end - range.start + 1
  headers.set('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + totalBytes)
  headers.set('Content-Length', String(contentLength))
  return new Response(
    streamByteRange(cached.body, range.start, range.end),
    { status: 206, headers }
  )
}

function ifRangeMatches(headers, ifRange) {
  if (!ifRange) return true
  const value = ifRange.trim()
  if (value.startsWith('"')) {
    const entityTag = headers.get('ETag')
    return Boolean(entityTag && !entityTag.startsWith('W/') && value === entityTag)
  }
  const lastModified = headers.get('Last-Modified')
  if (!lastModified) return false
  const ifRangeTime = Date.parse(value)
  const lastModifiedTime = Date.parse(lastModified)
  return (
    Number.isFinite(ifRangeTime) &&
    Number.isFinite(lastModifiedTime) &&
    lastModifiedTime <= ifRangeTime
  )
}

async function getCachedTorahPagePaths() {
  const cache = await caches.open(TORAH_CACHE_NAME)
  const requests = await cache.keys()
  return new Set(requests.map((request) => new URL(request.url).pathname))
}

async function getTorahDownloadStatus() {
  const cachedPaths = await getCachedTorahPagePaths()
  const downloaded = TORAH_PAGE_URLS.filter((url) => cachedPaths.has(url)).length
  const total = TORAH_PAGE_URLS.length
  return {
    type: 'TORAH_DOWNLOAD_STATUS',
    state: downloaded === total ? 'complete' : 'idle',
    downloaded,
    total,
    complete: downloaded === total,
  }
}

async function downloadTorahPages(onProgress) {
  const cache = await caches.open(TORAH_CACHE_NAME)
  const cachedPaths = await getCachedTorahPagePaths()
  const pendingUrls = TORAH_PAGE_URLS.filter((url) => !cachedPaths.has(url))
  let downloaded = TORAH_PAGE_URLS.length - pendingUrls.length
  let nextIndex = 0

  const reportProgress = () =>
    onProgress({
      type: 'TORAH_DOWNLOAD_STATUS',
      state: 'downloading',
      downloaded,
      total: TORAH_PAGE_URLS.length,
      complete: false,
    })

  reportProgress()
  const worker = async () => {
    while (nextIndex < pendingUrls.length) {
      const url = pendingUrls[nextIndex]
      nextIndex += 1
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('Could not download Torah page ' + url)
      }
      await cache.put(url, response)
      downloaded += 1
      reportProgress()
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(TORAH_DOWNLOAD_CONCURRENCY, pendingUrls.length) },
      worker
    )
  )
  return getTorahDownloadStatus()
}

async function removeObsoleteShellCaches() {
  const keys = await caches.keys()
  await Promise.all(
    keys
      .filter(
        (key) => key.startsWith(SHELL_CACHE_PREFIX) && key !== SHELL_CACHE_NAME
      )
      .map((key) => caches.delete(key))
  )
}

async function pruneTorahCache() {
  const cache = await caches.open(TORAH_CACHE_NAME)
  const requests = await cache.keys()
  await Promise.all(
    requests
      .filter((request) => !TORAH_PAGE_PATHS.has(new URL(request.url).pathname))
      .map((request) => caches.delete(request))
  )
}

async function pruneRecordingCache() {
  const cache = await caches.open(RECORDING_CACHE_NAME)
  const requests = await cache.keys()
  await Promise.all(
    requests.map(async (request) => {
      const cached = await cache.match(request)
      const metadata = cached ? recordingCacheMetadata(cached) : null
      const url = new URL(request.url)
      if (
        !metadata ||
        url.origin !== self.location.origin ||
        !url.pathname.startsWith(MEDIA_PATH_PREFIX) ||
        url.searchParams.get(RECORDING_VERSION_PARAM) !== metadata.digest
      ) {
        await deleteRecordingCacheEntry(cache, request)
      }
    })
  )
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

async function matchCachedNavigation(cache, request) {
  const cached = await cache.match(request)
  if (cached) return cached

  const url = new URL(request.url)
  const finalSegment = url.pathname.split('/').at(-1) ?? ''
  if (!url.pathname.endsWith('/') && !finalSegment.includes('.')) {
    return cache.match(url.pathname + '/')
  }
  return undefined
}

async function networkFirst(request, fallbackUrl) {
  let networkResponse
  let networkError
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE_NAME)
      await cache.put(request, response.clone())
      return response
    }
    if (response.status < 500) return response
    networkResponse = response
  } catch (error) {
    networkError = error
  }

  const cache = await caches.open(SHELL_CACHE_NAME)
  const cached = await matchCachedNavigation(cache, request)
  const fallback = cached ?? (await cache.match(fallbackUrl))
  if (fallback) return fallback
  if (networkResponse) return networkResponse
  throw networkError
}
`
}

async function readBuildManifest(manifestPath = clientManifestPath) {
  return JSON.parse(await readFile(manifestPath, 'utf8'))
}

export async function generateServiceWorker(
  root = distRoot,
  {
    basePath = process.env.TIKKUN_BASE_PATH ?? '',
    manifestPath = clientManifestPath,
    appPath = clientAppPath,
  } = {}
) {
  const normalizedBasePath = normalizeBasePath(basePath)
  const [manifest, clientAppSource] = await Promise.all([
    readBuildManifest(manifestPath),
    readFile(appPath, 'utf8'),
  ])
  const { excludedFiles, torahPageFiles } = classifyManifestFiles(
    manifest,
    prototypeRouteNodeSources(clientAppSource)
  )
  if (!torahPageFiles.length) {
    throw new Error('SvelteKit client manifest did not contain Torah page chunks')
  }

  const allFiles = await walk(root)
  const shellFiles = allFiles
    .map((filePath) => normalizePath(path.relative(root, filePath)))
    .filter((relativePath) => shouldPrecache(relativePath, excludedFiles))
    .sort()

  const htmlSources = new Map(
    await Promise.all(
      shellFiles
        .filter((relativePath) => relativePath.endsWith('.html'))
        .map(async (relativePath) => [
          relativePath,
          await readFile(path.join(root, relativePath), 'utf8'),
        ])
    )
  )
  assertPrecachedHtmlDependencies({
    shellFiles,
    htmlSources,
    basePath: normalizedBasePath,
  })

  const hash = createHash('sha256')
  const buildFiles = [...new Set([...shellFiles, ...torahPageFiles])].sort()
  const shellFileSet = new Set(shellFiles)
  let shellRawBytes = 0
  for (const relativePath of buildFiles) {
    const contents = await readFile(path.join(root, relativePath))
    hash.update(relativePath)
    hash.update(contents)
    if (shellFileSet.has(relativePath)) shellRawBytes += contents.byteLength
  }
  assertShellPrecacheBudget({
    urlCount: shellFiles.length,
    rawBytes: shellRawBytes,
  })

  const buildHash = hash.digest('hex').slice(0, 16)
  const shellUrls = shellFiles.map((filePath) =>
    toDeploymentUrl(filePath, normalizedBasePath)
  )
  const torahPageUrls = torahPageFiles.map((filePath) =>
    toDeploymentUrl(filePath, normalizedBasePath)
  )
  const distStats = await stat(root)
  const generatedAt = new Date(distStats.mtimeMs).toISOString()
  const serviceWorkerSource = renderServiceWorkerSource({
    basePath: normalizedBasePath,
    buildHash,
    shellUrls,
    torahPageUrls,
  })

  const targetFile = path.join(root, 'service-worker.js')
  const stagedFile = `${targetFile}.stage-${process.pid}-${Date.now()}`
  try {
    await writeFile(stagedFile, serviceWorkerSource)
    await rename(stagedFile, targetFile)
  } finally {
    await rm(stagedFile, { force: true })
  }

  console.log(
    `Generated service-worker.js with ${shellUrls.length} shell URLs, ${shellRawBytes} shell raw bytes, and ${torahPageUrls.length} opt-in Torah pages (${buildHash}, ${generatedAt})`
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generateServiceWorker()
}
