import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const defaultDistRoot = path.join(repoRoot, 'dist')
export const CLOUDFLARE_HEADER_LINE_LIMIT_BYTES = 2_000

async function walkHtml(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return walkHtml(entryPath)
      return entry.isFile() && entry.name.endsWith('.html') ? [entryPath] : []
    })
  )
  return files.flat()
}

export function inlineScriptSources(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes]) => !/\bsrc\s*=/i.test(attributes))
    .map(([, , source]) => source)
}

export function inlineScriptHashSources(htmlDocuments) {
  return [
    ...new Set(
      htmlDocuments.flatMap((html) =>
        inlineScriptSources(html).map((source) => {
          const digest = createHash('sha256').update(source).digest('base64')
          return `'sha256-${digest}'`
        })
      )
    ),
  ].sort()
}

export function applyInlineScriptHashes(headers, hashSources) {
  if (!hashSources.length) {
    throw new Error('Built pages did not contain any inline scripts to authorize')
  }
  const policyLinePattern = /^(\s*Content-Security-Policy(?:-Report-Only)?:\s*)(.+)$/m
  const policyMatch = headers.match(policyLinePattern)
  if (!policyMatch) throw new Error('Static headers do not contain a CSP policy')

  const scriptDirectivePattern = /script-src\s+([^;]+);/
  const scriptMatch = policyMatch[2].match(scriptDirectivePattern)
  if (!scriptMatch) throw new Error('Static CSP does not contain script-src')
  const stableSources = scriptMatch[1]
    .trim()
    .split(/\s+/)
    .filter((source) => !/^'sha256-[A-Za-z0-9+/]+=*'$/.test(source))
  const scriptDirective = `script-src ${[
    ...stableSources,
    ...hashSources,
  ].join(' ')};`
  const nextPolicy = policyMatch[2].replace(
    scriptDirectivePattern,
    scriptDirective
  )
  const nextLine = `${policyMatch[1]}${nextPolicy}`
  if (Buffer.byteLength(nextLine, 'utf8') > CLOUDFLARE_HEADER_LINE_LIMIT_BYTES) {
    throw new Error(
      `Generated CSP header is ${Buffer.byteLength(nextLine, 'utf8')} bytes; ` +
        `Cloudflare Pages permits ${CLOUDFLARE_HEADER_LINE_LIMIT_BYTES}`
    )
  }
  return headers.replace(policyLinePattern, nextLine)
}

export async function finalizeSecurityHeaders(distRoot = defaultDistRoot) {
  const headerPath = path.join(distRoot, '_headers')
  const htmlPaths = (await walkHtml(distRoot)).sort()
  if (!htmlPaths.length) throw new Error('Build output does not contain HTML')
  const [headers, ...htmlDocuments] = await Promise.all([
    readFile(headerPath, 'utf8'),
    ...htmlPaths.map((htmlPath) => readFile(htmlPath, 'utf8')),
  ])
  const hashSources = inlineScriptHashSources(htmlDocuments)
  const finalized = applyInlineScriptHashes(headers, hashSources)
  const stagedPath = `${headerPath}.stage-${process.pid}-${Date.now()}`
  try {
    await writeFile(stagedPath, finalized)
    await rename(stagedPath, headerPath)
  } finally {
    await rm(stagedPath, { force: true })
  }
  console.log(
    `Authorized ${hashSources.length} unique inline scripts across ${htmlPaths.length} built pages`
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await finalizeSecurityHeaders()
}
