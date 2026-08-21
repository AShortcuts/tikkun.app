import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { chromium } from 'playwright'

const DEFAULT_DIST_ROOT = path.resolve('dist')
const DEFAULT_READER_HASH = '#/torah/parsha/beresheet/1-1-1'
const EXPECTED_RECORDING_PATH = '/audio/yoni-davidov/beresheet/1.m4a'

const CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.m4a', 'audio/mp4'],
  ['.mp3', 'audio/mpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.ttf', 'font/ttf'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

export function normalizePreviewBasePath(value) {
  if (!value || value === '/') {
    throw new Error('Preview verification requires a non-root TIKKUN_BASE_PATH')
  }
  if (!value.startsWith('/') || value.includes('?') || value.includes('#')) {
    throw new Error(
      'TIKKUN_BASE_PATH must be an absolute path without a query or fragment',
    )
  }
  return value.replace(/\/+$/, '')
}

export function previewCacheNamespace(basePath) {
  return createHash('sha256')
    .update(normalizePreviewBasePath(basePath))
    .digest('hex')
    .slice(0, 12)
}

export function artifactPathForRequest(distRoot, basePath, requestUrl) {
  const normalizedBase = normalizePreviewBasePath(basePath)
  const url = new URL(requestUrl, 'http://127.0.0.1')
  if (
    url.pathname !== normalizedBase &&
    !url.pathname.startsWith(`${normalizedBase}/`)
  ) {
    return null
  }

  let relativePath
  try {
    relativePath = decodeURIComponent(url.pathname.slice(normalizedBase.length))
  } catch {
    return null
  }
  relativePath = relativePath.replace(/^\/+/, '')
  if (!relativePath || relativePath.endsWith('/')) {
    relativePath = path.join(relativePath, 'index.html')
  }

  const root = path.resolve(distRoot)
  const candidate = path.resolve(root, relativePath)
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    return null
  }
  return candidate
}

export function parseByteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value ?? '')
  if (!match || (!match[1] && !match[2]) || size <= 0) return null

  let start
  let end
  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null
    start = Math.max(0, size - suffixLength)
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] ? Number(match[2]) : size - 1
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= size ||
      end < start
    ) {
      return null
    }
    end = Math.min(end, size - 1)
  }
  return { start, end }
}

export function createRecordingRangeProbes(byteLength, sampleBytes = 1024) {
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0) {
    throw new Error('Recording byte length must be a positive safe integer')
  }
  if (!Number.isSafeInteger(sampleBytes) || sampleBytes <= 0) {
    throw new Error('Range sample size must be a positive safe integer')
  }

  const length = Math.min(byteLength, sampleBytes)
  const lastStart = byteLength - length
  const starts = [0, Math.floor(lastStart / 2), lastStart]
  return ['beginning', 'middle', 'end'].map((label, index) => {
    const start = starts[index]
    const end = start + length - 1
    return {
      label,
      start,
      end,
      length,
      header: `bytes=${start}-${end}`,
      contentRange: `bytes ${start}-${end}/${byteLength}`,
    }
  })
}

export async function createPreviewArtifactServer({
  distRoot = DEFAULT_DIST_ROOT,
  basePath,
} = {}) {
  const normalizedBase = normalizePreviewBasePath(basePath)
  const requests = []
  let originAvailable = true
  let activeDistRoot = path.resolve(distRoot)
  const server = createServer(async (request, response) => {
    const requestUrl = request.url ?? '/'
    const method = request.method ?? 'GET'
    const record = {
      method,
      path: new URL(requestUrl, 'http://127.0.0.1').pathname,
      status: 500,
    }
    requests.push(record)

    if (!originAvailable) {
      record.status = 0
      response.destroy()
      return
    }

    if (method !== 'GET' && method !== 'HEAD') {
      record.status = 405
      response.writeHead(405, { Allow: 'GET, HEAD' })
      response.end()
      return
    }

    const artifactPath = artifactPathForRequest(
      activeDistRoot,
      normalizedBase,
      requestUrl,
    )
    if (!artifactPath) {
      record.status = 404
      response.writeHead(404)
      response.end('Not found')
      return
    }

    let fileStats
    try {
      fileStats = await stat(artifactPath)
    } catch {
      record.status = 404
      response.writeHead(404)
      response.end('Not found')
      return
    }
    if (!fileStats.isFile()) {
      record.status = 404
      response.writeHead(404)
      response.end('Not found')
      return
    }

    const contentType = CONTENT_TYPES.get(
      path.extname(artifactPath).toLowerCase(),
    )
    const headers = {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Type': contentType ?? 'application/octet-stream',
    }
    const rangeHeader = request.headers.range
    const range = rangeHeader
      ? parseByteRange(rangeHeader, fileStats.size)
      : null
    if (rangeHeader && !range) {
      record.status = 416
      response.writeHead(416, {
        ...headers,
        'Content-Range': `bytes */${fileStats.size}`,
      })
      response.end()
      return
    }

    if (range) {
      record.status = 206
      response.writeHead(206, {
        ...headers,
        'Content-Length': String(range.end - range.start + 1),
        'Content-Range': `bytes ${range.start}-${range.end}/${fileStats.size}`,
      })
      if (method === 'HEAD') response.end()
      else createReadStream(artifactPath, range).pipe(response)
      return
    }

    record.status = 200
    response.writeHead(200, {
      ...headers,
      'Content-Length': String(fileStats.size),
    })
    if (method === 'HEAD') response.end()
    else createReadStream(artifactPath).pipe(response)
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Preview artifact server did not bind a TCP port')
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    setDistRoot: (nextDistRoot) => {
      activeDistRoot = path.resolve(nextDistRoot)
    },
    setOriginAvailable: (available) => {
      originAvailable = available
    },
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}

export async function verifyPreviewArtifact({
  distRoot = DEFAULT_DIST_ROOT,
  basePath = process.env.TIKKUN_BASE_PATH,
  browserChannel = process.env.TIKKUN_PREVIEW_BROWSER_CHANNEL,
} = {}) {
  const normalizedBase = normalizePreviewBasePath(basePath)
  const namespace = previewCacheNamespace(normalizedBase)
  const server = await createPreviewArtifactServer({
    distRoot,
    basePath: normalizedBase,
  })
  let browser
  let browserTarget = 'playwright-chromium'
  const failures = []
  const pageErrors = []
  const consoleErrors = []
  const badResponses = []
  const escapedRequests = []
  const expectedOfflineDiagnostics = []
  let connectionPhase = 'online'
  try {
    const launchedBrowser = await launchPreviewBrowser(browserChannel)
    browser = launchedBrowser.browser
    browserTarget = launchedBrowser.target
    const context = await browser.newContext({ serviceWorkers: 'allow' })
    const previewPrefix = `${server.origin}${normalizedBase}`
    const serviceWorkerUrl = `${previewPrefix}/service-worker.js`
    const attachDiagnostics = (targetPage) => {
      targetPage.on('pageerror', (error) => pageErrors.push(error.message))
      targetPage.on('console', (message) => {
        if (message.type() !== 'error') return
        const text = message.text()
        if (
          connectionPhase === 'offline' &&
          ((text.startsWith(
            'Failed to prepare the application service worker',
          ) &&
            text.includes('Failed to fetch')) ||
            /^Failed to load resource: net::ERR_(?:CONNECTION_RESET|FAILED|INTERNET_DISCONNECTED)$/.test(
              text,
            ))
        ) {
          const location = message.location().url
          expectedOfflineDiagnostics.push(
            `console: ${text}${location ? ` (${location})` : ''}`,
          )
          return
        }
        consoleErrors.push(text)
      })
      targetPage.on('request', (request) => {
        if (
          request.url().startsWith(server.origin) &&
          request.url() !== previewPrefix &&
          !request.url().startsWith(`${previewPrefix}/`)
        ) {
          escapedRequests.push(request.url())
        }
      })
      targetPage.on('requestfailed', (request) => {
        if (!request.url().startsWith(server.origin)) return
        const errorText = request.failure()?.errorText ?? 'failed'
        // Navigating between smoke routes intentionally cancels in-flight HEAD and
        // media reads. Their server status is checked separately below.
        if (errorText === 'net::ERR_ABORTED') return
        if (
          connectionPhase === 'offline' &&
          request.method() === 'HEAD' &&
          request.url() === serviceWorkerUrl &&
          [
            'net::ERR_CONNECTION_RESET',
            'net::ERR_FAILED',
            'net::ERR_INTERNET_DISCONNECTED',
          ].includes(errorText)
        ) {
          expectedOfflineDiagnostics.push(
            `request: ${request.method()} ${request.url()}: ${errorText}`,
          )
          return
        }
        failures.push(`${request.method()} ${request.url()}: ${errorText}`)
      })
      targetPage.on('response', (response) => {
        if (
          response.url().startsWith(server.origin) &&
          response.status() >= 400
        ) {
          badResponses.push(
            `${response.status()} ${response.request().method()} ${response.url()}`,
          )
        }
      })
    }
    let page = await context.newPage()
    attachDiagnostics(page)

    await visitRoute(page, `${previewPrefix}/`, '#home-title', 'Home')
    await assertLocalDocumentUrls(page, server.origin, normalizedBase, 'Home')

    await visitRoute(
      page,
      `${previewPrefix}/readings/`,
      '#readings-title',
      'Readings',
    )
    await page
      .locator('.coverage-search input[type="search"]')
      .fill('Beresheet')
    await page.waitForFunction(() => {
      const count = document
        .querySelector('.coverage-result-count')
        ?.textContent?.trim()
      const names = Array.from(
        document.querySelectorAll('.coverage-name'),
        (element) => element.textContent?.trim(),
      )
      return (
        count?.startsWith('Showing 1 of ') &&
        names.length === 1 &&
        names[0] === 'Beresheet'
      )
    })
    await assertLocalDocumentUrls(
      page,
      server.origin,
      normalizedBase,
      'Readings',
    )

    await visitRoute(
      page,
      `${previewPrefix}/reader/${DEFAULT_READER_HASH}`,
      '[data-target-id="app-root"]',
      'Reader',
    )
    await page.waitForSelector(
      '[data-target-id="tikkun-book"] [data-page-number]',
      { timeout: 15_000 },
    )
    const playButton = page
      .locator('.aliyah-audio-button[data-aliyah-index="1"]:visible')
      .first()
    await playButton.click()
    const recordingUrl = await waitForSelectedRecording(page, {
      requirePlayback: true,
    })
    const expectedRecordingPrefix = `${previewPrefix}${EXPECTED_RECORDING_PATH}`
    assert(
      recordingUrl.startsWith(expectedRecordingPrefix),
      `Reader recording escaped preview base: ${recordingUrl}`,
    )
    await assertLocalDocumentUrls(page, server.origin, normalizedBase, 'Reader')
    await pauseRecording(page)

    await page.waitForFunction(
      () => Boolean(navigator.serviceWorker.controller),
      undefined,
      { timeout: 15_000 },
    )
    const serviceWorker = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready
      return {
        scope: registration.scope,
        scriptUrl: registration.active?.scriptURL ?? '',
        controllerUrl: navigator.serviceWorker.controller?.scriptURL ?? '',
        caches: await caches.keys(),
      }
    })
    assert(
      serviceWorker.scope === `${previewPrefix}/`,
      `Unexpected service-worker scope: ${serviceWorker.scope}`,
    )
    assert(
      serviceWorker.scriptUrl === `${previewPrefix}/service-worker.js`,
      `Unexpected service-worker URL: ${serviceWorker.scriptUrl}`,
    )
    assert(
      serviceWorker.controllerUrl === `${previewPrefix}/service-worker.js`,
      `Unexpected controlling service-worker URL: ${serviceWorker.controllerUrl}`,
    )
    assert(
      serviceWorker.caches.some((name) =>
        name.startsWith(`tikkun-shell-${namespace}-`),
      ),
      `Missing preview-namespaced shell cache: ${serviceWorker.caches.join(', ')}`,
    )
    assert(
      serviceWorker.caches.every(
        (name) =>
          !name.startsWith('tikkun-shell-') ||
          name.startsWith(`tikkun-shell-${namespace}-`),
      ),
      `Shell cache escaped preview namespace: ${serviceWorker.caches.join(', ')}`,
    )

    const recordingArtifactPath = artifactPathForRequest(
      distRoot,
      normalizedBase,
      recordingUrl,
    )
    assert(recordingArtifactPath, 'Reader recording did not map into dist')
    const recordingByteLength = (await stat(recordingArtifactPath)).size
    const rangeProbes = createRecordingRangeProbes(recordingByteLength)

    await downloadCurrentRecording(page)
    const downloadedCache = await inspectRecordingCache(
      page,
      namespace,
      recordingUrl,
    )
    assert(
      downloadedCache.exactStored,
      'Offline Download completed without an exact cached recording',
    )
    assert(
      downloadedCache.byteLength === recordingByteLength,
      `Cached recording length ${downloadedCache.byteLength} did not match ${recordingByteLength}`,
    )

    await closeReaderSettings(page)
    await page.close()
    connectionPhase = 'offline'
    server.setOriginAvailable(false)
    await context.setOffline(true)
    const offlineOriginRequestBaseline = server.requests.length
    page = await context.newPage()
    attachDiagnostics(page)

    const offlineReaderUrl = `${previewPrefix}/reader/${DEFAULT_READER_HASH}`
    const offlineResponse = await page.goto(offlineReaderUrl, {
      waitUntil: 'domcontentloaded',
    })
    assert(
      offlineResponse?.ok(),
      `Offline Reader relaunch failed: ${offlineResponse?.status() ?? 'no response'}`,
    )
    await page.waitForSelector(
      '[data-target-id="tikkun-book"] [data-page-number]',
      { timeout: 15_000 },
    )
    await assertLocalDocumentUrls(
      page,
      server.origin,
      normalizedBase,
      'Offline Reader',
    )

    const offlinePlayButton = page
      .locator('.aliyah-audio-button[data-aliyah-index="1"]:visible')
      .first()
    await offlinePlayButton.click()
    const offlineRecordingUrl = await waitForSelectedRecording(page, {
      requirePlayback: true,
    })
    assert(
      offlineRecordingUrl === recordingUrl,
      `Offline relaunch selected a different recording: ${offlineRecordingUrl}`,
    )
    await pauseRecording(page)

    await openReaderSettings(page)
    await waitForOfflineRecordingButton(page, 'Remove offline recording')
    await closeReaderSettings(page)

    await page.setViewportSize({ width: 390, height: 844 })
    const playbackSeeks = await seekRecording(page, [0.05, 0.5, 0.95])
    const offlineRangeResponses = await fetchRecordingRanges(
      page,
      recordingUrl,
      rangeProbes,
    )
    for (let index = 0; index < rangeProbes.length; index += 1) {
      const probe = rangeProbes[index]
      const response = offlineRangeResponses[index]
      assert(
        response.status === 206,
        `Offline ${probe.label} range returned ${response.status}`,
      )
      assert(
        response.contentRange === probe.contentRange,
        `Offline ${probe.label} range returned ${response.contentRange}`,
      )
      assert(
        response.byteLength === probe.length,
        `Offline ${probe.label} range returned ${response.byteLength} bytes`,
      )
    }
    const offlineOriginAttempts = server.requests.slice(
      offlineOriginRequestBaseline,
    )
    assert(
      offlineOriginAttempts.every((request) => request.status === 0),
      'Offline relaunch received an origin response instead of using cached data',
    )

    await page.waitForTimeout(250)
    server.setOriginAvailable(true)
    await context.setOffline(false)
    connectionPhase = 'online'
    await page.setViewportSize({ width: 1280, height: 720 })
    await openReaderSettings(page)
    const removeButton = await waitForOfflineRecordingButton(
      page,
      'Remove offline recording',
    )
    await removeButton.click()
    await waitForOfflineRecordingButton(page, 'Download current recording')
    const removedCache = await inspectRecordingCache(
      page,
      namespace,
      recordingUrl,
    )
    assert(
      !removedCache.exactStored && removedCache.entryCount === 0,
      'Remove offline recording left the current recording cached',
    )
    await closeReaderSettings(page)

    const reconnectRequestBaseline = server.requests.length
    const reconnectRange = (
      await fetchRecordingRanges(page, recordingUrl, [rangeProbes[0]])
    )[0]
    assert(
      reconnectRange.status === 206 &&
        reconnectRange.contentRange === rangeProbes[0].contentRange,
      'Reconnected recording did not return the expected origin byte range',
    )
    assert(
      server.requests.length > reconnectRequestBaseline,
      'Reconnected playback proof did not reach the origin after removal',
    )

    await visitRoute(page, `${previewPrefix}/about/`, '#about-title', 'About')
    await assertLocalDocumentUrls(page, server.origin, normalizedBase, 'About')

    await page.waitForTimeout(250)
    const serverFailures = server.requests.filter(
      (request) => request.status >= 400,
    )
    const diagnostics = [
      ...pageErrors.map((error) => `page error: ${error}`),
      ...consoleErrors.map((error) => `console error: ${error}`),
      ...failures.map((error) => `request failure: ${error}`),
      ...badResponses.map((error) => `bad response: ${error}`),
      ...escapedRequests.map((url) => `escaped request: ${url}`),
      ...serverFailures.map(
        (request) =>
          `server failure: ${request.status} ${request.method} ${request.path}`,
      ),
    ]
    assert(
      diagnostics.length === 0,
      `Preview runtime diagnostics:\n- ${diagnostics.join('\n- ')}`,
    )

    return {
      basePath: normalizedBase,
      origin: server.origin,
      browserTarget,
      cacheNamespace: namespace,
      recordingUrl,
      requestCount: server.requests.length,
      serviceWorker,
      offlineRecording: {
        byteLength: recordingByteLength,
        cacheName: downloadedCache.cacheName,
        playbackSeeks,
        rangeProbes: offlineRangeResponses,
        offlineOriginAttemptCount: offlineOriginAttempts.length,
        removed: !removedCache.exactStored,
        expectedDiagnosticCount: expectedOfflineDiagnostics.length,
      },
    }
  } finally {
    await browser?.close()
    await server.close()
  }
}

export async function launchPreviewBrowser(channel) {
  if (!channel) {
    return {
      browser: await chromium.launch({ headless: true }),
      target: 'playwright-chromium',
    }
  }

  try {
    return {
      browser: await chromium.launch({ channel, headless: true }),
      target: channel,
    }
  } catch (error) {
    const missingDistribution =
      error instanceof Error &&
      error.message.includes(`Chromium distribution '${channel}' is not found`)
    if (!missingDistribution) throw error
    console.warn(
      `Preview browser channel '${channel}' is unavailable; using the installed Playwright Chromium instead.`,
    )
    return {
      browser: await chromium.launch({ headless: true }),
      target: 'playwright-chromium-fallback',
    }
  }
}

async function visitRoute(page, url, readySelector, label) {
  const response = await page.goto(url, { waitUntil: 'networkidle' })
  assert(
    response?.ok(),
    `${label} navigation failed: ${response?.status() ?? 'no response'}`,
  )
  await page.waitForSelector(readySelector, {
    state: 'visible',
    timeout: 15_000,
  })
  assert(
    (await page.locator('[data-vite-error-overlay]').count()) === 0,
    `${label} rendered a Vite error overlay`,
  )
}

async function assertLocalDocumentUrls(page, origin, basePath, label) {
  const escaped = await page.evaluate(
    ({ origin: expectedOrigin, basePath: expectedBase }) =>
      Array.from(document.querySelectorAll('[href], [src]'))
        .map(
          (element) =>
            element.getAttribute('href') ?? element.getAttribute('src') ?? '',
        )
        .filter(Boolean)
        .map((value) => new URL(value, document.baseURI))
        .filter(
          (url) =>
            url.origin === expectedOrigin &&
            url.pathname !== expectedBase &&
            !url.pathname.startsWith(`${expectedBase}/`),
        )
        .map((url) => url.href),
    { origin, basePath },
  )
  assert(
    escaped.length === 0,
    `${label} document URLs escaped preview base: ${escaped.join(', ')}`,
  )
}

async function waitForSelectedRecording(
  page,
  { requirePlayback = false } = {},
) {
  await page.waitForFunction(
    ({ requirePlayback: shouldRequirePlayback }) => {
      const audio = document.querySelector('[data-target-id="reader-audio"]')
      if (!(audio instanceof HTMLAudioElement) || !audio.src) return false
      if (!shouldRequirePlayback) return true
      return !audio.paused && audio.currentTime > 0.2
    },
    { requirePlayback },
    { timeout: 15_000 },
  )
  return page
    .locator('[data-target-id="reader-audio"]')
    .evaluate((audio) => audio.src)
}

async function pauseRecording(page) {
  const audio = page.locator('[data-target-id="reader-audio"]')
  if (await audio.evaluate((element) => element.paused)) return
  const pauseButton = page
    .locator('.aliyah-audio-button[aria-label^="Pause "]:visible')
    .first()
  await pauseButton.click()
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-target-id="reader-audio"]')
    return element instanceof HTMLAudioElement && element.paused
  })
}

async function openReaderSettings(page) {
  const pane = page.locator('[data-target-id="settings-pane"]')
  if (await pane.isVisible()) return
  await page.locator('[data-target-id="settings-toggle"]').click()
  await pane.waitFor({ state: 'visible', timeout: 15_000 })
}

async function closeReaderSettings(page) {
  const pane = page.locator('[data-target-id="settings-pane"]')
  if (!(await pane.isVisible())) return
  await page.locator('[data-target-id="settings-close"]').click()
  await pane.waitFor({ state: 'hidden' })
}

async function waitForOfflineRecordingButton(page, label) {
  const selector = '[data-target-id="settings-offline-recording-download"]'
  await page.waitForFunction(
    ({ selector: buttonSelector, label: expectedLabel }) => {
      const button = document.querySelector(buttonSelector)
      return (
        button instanceof HTMLButtonElement &&
        !button.disabled &&
        button.textContent?.trim() === expectedLabel
      )
    },
    { selector, label },
    { timeout: 120_000 },
  )
  return page.locator(selector)
}

async function downloadCurrentRecording(page) {
  await openReaderSettings(page)
  const button = await waitForOfflineRecordingButton(
    page,
    'Download current recording',
  )
  await button.click()
  await waitForOfflineRecordingButton(page, 'Remove offline recording')
  const status = await page
    .locator('[data-target-id="settings-offline-recording-status"]')
    .textContent()
  assert(
    status?.includes('is available offline in this browser.'),
    `Offline Download ended with an unexpected status: ${status?.trim() ?? ''}`,
  )
}

async function inspectRecordingCache(page, namespace, recordingUrl) {
  return page.evaluate(
    async ({ cacheName, url }) => {
      const cache = await caches.open(cacheName)
      const entries = await cache.keys()
      const response = await cache.match(url)
      return {
        cacheName,
        entryCount: entries.length,
        exactStored: Boolean(response),
        byteLength: Number(response?.headers.get('Content-Length') ?? 0),
      }
    },
    {
      cacheName: `tikkun-recordings-${namespace}`,
      url: recordingUrl,
    },
  )
}

async function seekRecording(page, ratios) {
  const slider = page.locator('[data-target-id="mobile-player-seek"]')
  await slider.waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForFunction(() => {
    const audio = document.querySelector('[data-target-id="reader-audio"]')
    const seek = document.querySelector('[data-target-id="mobile-player-seek"]')
    return (
      audio instanceof HTMLAudioElement &&
      Number.isFinite(audio.duration) &&
      seek instanceof HTMLInputElement &&
      !seek.disabled
    )
  })

  const outcomes = []
  for (const ratio of ratios) {
    const sliderValue = String(Math.round(ratio * 1000))
    await slider.fill(sliderValue)
    await page.waitForFunction(
      ({ ratio: expectedRatio, sliderValue: expectedValue }) => {
        const audio = document.querySelector('[data-target-id="reader-audio"]')
        const seek = document.querySelector(
          '[data-target-id="mobile-player-seek"]',
        )
        if (
          !(audio instanceof HTMLAudioElement) ||
          !(seek instanceof HTMLInputElement)
        ) {
          return false
        }
        return (
          seek.value === expectedValue &&
          audio.paused &&
          Math.abs(audio.currentTime - audio.duration * expectedRatio) <= 2
        )
      },
      { ratio, sliderValue },
      { timeout: 15_000 },
    )
    outcomes.push(
      await page.locator('[data-target-id="reader-audio"]').evaluate(
        (audio, expectedRatio) => ({
          ratio: expectedRatio,
          currentTime: audio.currentTime,
          duration: audio.duration,
        }),
        ratio,
      ),
    )
  }
  return outcomes
}

async function fetchRecordingRanges(page, recordingUrl, probes) {
  return page.evaluate(
    async ({ url, probes: requestedProbes }) => {
      const responses = []
      for (const probe of requestedProbes) {
        const response = await fetch(url, {
          cache: 'no-store',
          headers: { Range: probe.header },
        })
        const body = await response.arrayBuffer()
        responses.push({
          label: probe.label,
          status: response.status,
          contentRange: response.headers.get('Content-Range'),
          byteLength: body.byteLength,
        })
      }
      return responses
    },
    { url: recordingUrl, probes },
  )
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const report = await verifyPreviewArtifact()
  console.log(
    `Verified preview artifact at ${report.basePath}: 4 routes, ${report.requestCount} local requests, recording ${new URL(report.recordingUrl).pathname}, offline download/relaunch/playback/seeks/removal, service worker ${new URL(report.serviceWorker.scriptUrl).pathname}, cache namespace ${report.cacheNamespace}, browser ${report.browserTarget}`,
  )
}
