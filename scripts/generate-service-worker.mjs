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
const TORAH_CACHE_NAME = 'tikkun-torah-${cacheNamespace}-v1'
const LEGACY_TORAH_CACHE_NAME = 'tikkun-torah-v1'
const LEGACY_SHELL_CACHE_PATTERN = /^tikkun-shell-[a-f0-9]{16}$/
const SHELL_URLS = ${JSON.stringify(shellUrls, null, 2)}
const TORAH_PAGE_URLS = ${JSON.stringify(torahPageUrls, null, 2)}
const TORAH_PAGE_PATHS = new Set(TORAH_PAGE_URLS)
const TORAH_DOWNLOAD_CONCURRENCY = 4
const MEDIA_PATH_PREFIX = BASE_PATH + '/audio/'
const MEDIA_EXTENSION_RE = /\\.(?:aac|aiff|flac|m4a|m4v|mov|mp3|mp4|ogg|opus|wav|webm)$/i
let activeTorahDownload = null

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([removeObsoleteShellCaches(), pruneTorahCache()])
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
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith(MEDIA_PATH_PREFIX) || MEDIA_EXTENSION_RE.test(url.pathname)) {
    return
  }

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
        (key) =>
          (key.startsWith(SHELL_CACHE_PREFIX) && key !== SHELL_CACHE_NAME) ||
          (BASE_PATH === '' &&
            (LEGACY_SHELL_CACHE_PATTERN.test(key) ||
              key === LEGACY_TORAH_CACHE_NAME))
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
