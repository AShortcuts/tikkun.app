import { createHash } from 'node:crypto'
import { readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const distRoot = path.join(repoRoot, 'dist')

const excludedPathPrefixes = ['audio/']
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
const deferredChunkPattern =
  /^assets\/(?:cue-data|optional-(?:about|cue-authoring|cue-analytics|recording-harness))-[A-Za-z0-9_-]+\.js$/

function toUrlPath(filePath) {
  return `/${filePath.split(path.sep).map(encodeURIComponent).join('/')}`
}

export function shouldPrecache(relativePath) {
  const normalized = relativePath.split(path.sep).join('/')
  if (normalized === 'service-worker.js') return false
  if (excludedPathPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    return false
  }
  if (deferredChunkPattern.test(normalized)) return false
  return !excludedExtensions.has(path.extname(normalized).toLowerCase())
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

export function renderServiceWorkerSource({ buildHash, precacheUrls }) {
  return `const CACHE_NAME = 'tikkun-${buildHash}'
const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)}
const MEDIA_PATH_RE = /^\\/(?:audio)\\//
const MEDIA_EXTENSION_RE = /\\.(?:aac|aiff|flac|m4a|m4v|mov|mp3|mp4|ogg|opus|wav|webm)$/i

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('tikkun-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
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

  event.respondWith(cacheFirst(request))
})

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(request, response.clone())
  }
  return response
}

async function networkFirst(request, fallbackUrl) {
  let networkResponse
  let networkError
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(request, response.clone())
      return response
    }
    if (response.status < 500) return response
    networkResponse = response
  } catch (error) {
    networkError = error
  }

  const cached = await caches.match(request)
  const fallback = cached ?? (await caches.match(fallbackUrl))
  if (fallback) return fallback
  if (networkResponse) return networkResponse
  throw networkError
}
`
}

export async function generateServiceWorker(root = distRoot) {
  const allFiles = await walk(root)
  const precacheFiles = allFiles
    .map((filePath) => path.relative(root, filePath))
    .filter(shouldPrecache)
    .sort()

  const hash = createHash('sha256')
  for (const relativePath of precacheFiles) {
    hash.update(relativePath)
    hash.update(await readFile(path.join(root, relativePath)))
  }

  const buildHash = hash.digest('hex').slice(0, 16)
  const precacheUrls = ['/', ...precacheFiles.map(toUrlPath)]
  const distStats = await stat(root)
  const generatedAt = new Date(distStats.mtimeMs).toISOString()
  const serviceWorkerSource = renderServiceWorkerSource({ buildHash, precacheUrls })

  const targetFile = path.join(root, 'service-worker.js')
  const stagedFile = `${targetFile}.stage-${process.pid}-${Date.now()}`
  try {
    await writeFile(stagedFile, serviceWorkerSource)
    await rename(stagedFile, targetFile)
  } finally {
    await rm(stagedFile, { force: true })
  }

  console.log(
    `Generated service-worker.js with ${precacheUrls.length} precached URLs (${buildHash}, ${generatedAt})`
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generateServiceWorker()
}
