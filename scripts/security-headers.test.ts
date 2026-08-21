import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, test } from 'vitest'
import {
  CLOUDFLARE_HEADER_LINE_LIMIT_BYTES,
  applyInlineScriptHashes,
  inlineScriptHashSources,
  inlineScriptSources,
} from './finalize-security-headers.mjs'

const headers = readFileSync('site/_headers', 'utf8')
const appTemplate = readFileSync('src/app.html', 'utf8')

function createThemeRoot() {
  return {
    dataset: { readerTheme: 'automatic' },
    style: {
      colorScheme: '',
      setProperty(...args: [string, string]) {
        void args
      },
    },
  }
}

test('ships core browser security headers without disabling local authoring', () => {
  expect(headers).toContain('Content-Security-Policy-Report-Only:')
  expect(headers).toContain("default-src 'self'")
  expect(headers).toContain("object-src 'none'")
  expect(headers).toContain("frame-ancestors 'self'")
  expect(headers).toContain('Strict-Transport-Security: max-age=31536000')
  expect(headers).toContain('X-Content-Type-Options: nosniff')
  expect(headers).toContain('microphone=(self)')
})

test('allows only the current early-theme inline script', () => {
  const inlineScripts = [
    ...appTemplate.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi),
  ].filter(([, attributes]) => !/\bsrc\s*=/i.test(attributes))
  expect(inlineScripts).toHaveLength(1)

  for (const [, , source] of inlineScripts) {
    const digest = createHash('sha256').update(source).digest('base64')
    expect(headers).toContain(`'sha256-${digest}'`)
  }
  expect(headers).not.toContain("script-src 'self' 'unsafe-inline'")
})

test('keeps early theme setup non-fatal when browser storage is unavailable', () => {
  const source = [
    ...appTemplate.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi),
  ].find(([, attributes]) => !/\bsrc\s*=/i.test(attributes))?.[2]
  if (!source) throw new Error('Expected the early-theme inline script')

  const root = createThemeRoot()
  expect(() =>
    runInNewContext(source, {
      document: { documentElement: root },
      window: {
        localStorage: {
          getItem() {
            throw new DOMException('Storage unavailable', 'SecurityError')
          },
        },
      },
    })
  ).not.toThrow()
  expect(root.dataset.readerTheme).toBe('automatic')
})

test('applies the saved theme before hydration', () => {
  const source = [
    ...appTemplate.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi),
  ].find(([, attributes]) => !/\bsrc\s*=/i.test(attributes))?.[2]
  if (!source) throw new Error('Expected the early-theme inline script')

  const root = createThemeRoot()
  runInNewContext(source, {
    document: { documentElement: root },
    window: {
      localStorage: {
        getItem: () => JSON.stringify({ themeMode: 'sepia' }),
      },
    },
  })

  expect(root.dataset.readerTheme).toBe('sepia')
})

test('applies saved custom colors before hydration', () => {
  const source = [
    ...appTemplate.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi),
  ].find(([, attributes]) => !/\bsrc\s*=/i.test(attributes))?.[2]
  if (!source) throw new Error('Expected the early-theme inline script')

  const properties = new Map<string, string>()
  const root = createThemeRoot()
  root.style.setProperty = (name: string, value: string) => {
    properties.set(name, value)
  }
  runInNewContext(source, {
    document: { documentElement: root },
    window: {
      localStorage: {
        getItem: () => JSON.stringify({
          themeMode: 'custom',
          customBackgroundColor: '#112233',
          customTextColor: '#f4f1e8',
        }),
      },
    },
  })

  expect(root.dataset.readerTheme).toBe('custom')
  expect(properties.get('--reader-custom-background-color')).toBe('#112233')
  expect(properties.get('--reader-custom-text-color')).toBe('#f4f1e8')
  expect(root.style.colorScheme).toBe('dark')
})

test.each([
  JSON.stringify({ themeMode: 'chartreuse' }),
  JSON.stringify([]),
  JSON.stringify(null),
  '{not json',
])('keeps the default early theme for invalid state %s', (savedPreferences) => {
  const source = [
    ...appTemplate.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi),
  ].find(([, attributes]) => !/\bsrc\s*=/i.test(attributes))?.[2]
  if (!source) throw new Error('Expected the early-theme inline script')

  const root = createThemeRoot()
  runInNewContext(source, {
    document: { documentElement: root },
    window: {
      localStorage: { getItem: () => savedPreferences },
    },
  })

  expect(root.dataset.readerTheme).toBe('automatic')
})

test('postbuild CSP authorizes every built inline script and excludes external scripts', () => {
  const documents = [
    '<script>shared()</script><script type="module">home()</script>',
    '<script>shared()</script><script nonce="ignored">reader()</script><script src="/app.js"></script>',
  ]
  expect(inlineScriptSources(documents[1])).toEqual(['shared()', 'reader()'])

  const hashes = inlineScriptHashSources(documents)
  const finalized = applyInlineScriptHashes(headers, hashes)
  expect(hashes).toHaveLength(3)
  for (const hash of hashes) expect(finalized).toContain(hash)
  expect(finalized).not.toContain("'sha256-B62cMPfBDu49Fs0nuz4lCkoKCt154KRpdV61IaK2GFc='")
  const policyLine = finalized
    .split('\n')
    .find((line: string) => line.includes('Content-Security-Policy'))
  expect(Buffer.byteLength(policyLine ?? '', 'utf8')).toBeLessThanOrEqual(
    CLOUDFLARE_HEADER_LINE_LIMIT_BYTES
  )
})

test('postbuild CSP fails closed when the host line limit would be exceeded', () => {
  const tooManyHashes = Array.from(
    { length: 40 },
    (_, index) => `'sha256-${String(index).padStart(44, 'A')}'`
  )
  expect(() => applyInlineScriptHashes(headers, tooManyHashes)).toThrow(
    'Cloudflare Pages permits 2000'
  )
})
