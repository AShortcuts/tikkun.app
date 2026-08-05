import { createHash } from 'node:crypto'
import { readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const distRoot = path.join(repoRoot, 'dist')

const excludedPathPrefixes = ['audio/', '.vite/']
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
const deferredAssetPattern =
  /^assets\/(?:cue-data|optional-(?:about|cue-authoring|cue-analytics|recording-harness))-[A-Za-z0-9_-]+\.js$/
const deferredStylesheetPattern = /^assets\/cue-authoring-[A-Za-z0-9_-]+\.css$/
const pageChunkPattern = /^assets\/page-[A-Za-z0-9_-]+\.js$/
const verificationFilePattern = /^google[A-Za-z0-9_-]+\.html$/
const nonCriticalFontPattern = /^assets\/Lora-Regular-[A-Za-z0-9_-]+\.ttf$/

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/')
}

function toUrlPath(filePath) {
  return `/${filePath.split(path.sep).map(encodeURIComponent).join('/')}`
}

export function isPageChunk(relativePath) {
  return pageChunkPattern.test(normalizePath(relativePath))
}

export function shouldPrecache(relativePath) {
  const normalized = normalizePath(relativePath)
  if (normalized === 'service-worker.js') return false
  if (excludedPathPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    return false
  }
  if (
    deferredAssetPattern.test(normalized) ||
    deferredStylesheetPattern.test(normalized) ||
    verificationFilePattern.test(normalized) ||
    nonCriticalFontPattern.test(normalized) ||
    isPageChunk(normalized)
  ) {
    return false
  }
  return !excludedExtensions.has(path.extname(normalized).toLowerCase())
}

export function torahPageFilesFromManifest(manifest) {
  const files = Object.entries(manifest)
    .filter(([sourcePath]) =>
      normalizePath(sourcePath).includes('text/pages/torah/')
    )
    .map(([, entry]) => entry?.file)
    .filter((filePath) => typeof filePath === 'string' && isPageChunk(filePath))

  return [...new Set(files)].sort()
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
  buildHash,
  shellUrls,
  torahPageUrls,
}) {
  return `const SHELL_CACHE_PREFIX = 'tikkun-shell-'
const SHELL_CACHE_NAME = SHELL_CACHE_PREFIX + '${buildHash}'
const TORAH_CACHE_NAME = 'tikkun-torah-v1'
const SHELL_URLS = ${JSON.stringify(shellUrls, null, 2)}
const TORAH_PAGE_URLS = ${JSON.stringify(torahPageUrls, null, 2)}
const TORAH_PAGE_PATHS = new Set(TORAH_PAGE_URLS)
const TORAH_DOWNLOAD_CONCURRENCY = 4
const MEDIA_PATH_RE = /^\\/(?:audio)\\//
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
  if (MEDIA_PATH_RE.test(url.pathname) || MEDIA_EXTENSION_RE.test(url.pathname)) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/index.html'))
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
          (key.startsWith('tikkun-') &&
            !key.startsWith(SHELL_CACHE_PREFIX) &&
            !key.startsWith('tikkun-torah-'))
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
      .map((request) => cache.delete(request))
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
  const cached = await cache.match(request)
  const fallback = cached ?? (await cache.match(fallbackUrl))
  if (fallback) return fallback
  if (networkResponse) return networkResponse
  throw networkError
}
`
}

async function readTorahPageFiles(root) {
  const manifestPath = path.join(root, '.vite', 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const files = torahPageFilesFromManifest(manifest)
  if (!files.length) {
    throw new Error('Vite manifest did not contain any Torah page chunks')
  }
  return files
}

export async function generateServiceWorker(root = distRoot) {
  const allFiles = await walk(root)
  const shellFiles = allFiles
    .map((filePath) => path.relative(root, filePath))
    .filter(shouldPrecache)
    .sort()
  const torahPageFiles = await readTorahPageFiles(root)

  const hash = createHash('sha256')
  const buildFiles = [...new Set([...shellFiles, ...torahPageFiles])].sort()
  for (const relativePath of buildFiles) {
    hash.update(relativePath)
    hash.update(await readFile(path.join(root, relativePath)))
  }

  const buildHash = hash.digest('hex').slice(0, 16)
  const shellUrls = ['/', ...shellFiles.map(toUrlPath)]
  const torahPageUrls = torahPageFiles.map(toUrlPath)
  const distStats = await stat(root)
  const generatedAt = new Date(distStats.mtimeMs).toISOString()
  const serviceWorkerSource = renderServiceWorkerSource({
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
    `Generated service-worker.js with ${shellUrls.length} shell URLs and ${torahPageUrls.length} opt-in Torah pages (${buildHash}, ${generatedAt})`
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generateServiceWorker()
}
