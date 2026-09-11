import process from 'node:process'

export function nativeBuildConfig(environment = process.env) {
  const enabled = environment.TIKKUN_NATIVE === '1'
  if (!enabled) return { enabled: false, mediaOrigin: '' }
  if (environment.TIKKUN_BASE_PATH && environment.TIKKUN_BASE_PATH !== '/') {
    throw new Error('Native builds require an empty TIKKUN_BASE_PATH')
  }
  const configuredOrigin = environment.TIKKUN_NATIVE_MEDIA_ORIGIN
  if (!configuredOrigin) {
    throw new Error('TIKKUN_NATIVE_MEDIA_ORIGIN must name the HTTPS audio host')
  }
  const url = new URL(configuredOrigin)
  if (
    url.protocol !== 'https:' || url.username || url.password ||
    url.pathname !== '/' || url.search || url.hash
  ) {
    throw new Error('TIKKUN_NATIVE_MEDIA_ORIGIN must be an HTTPS origin without a path or credentials')
  }
  return { enabled: true, mediaOrigin: url.origin }
}

export function includeNativeAsset(relativePath) {
  const parts = relativePath.replaceAll('\\', '/').split('/')
  return !parts.some((part) => part.startsWith('.') || part === 'prototypes') &&
    parts[0] !== 'audio' &&
    !['_headers', '_redirects', 'service-worker.js'].includes(parts[0]) &&
    !/\.(?:mp3|m4a|mp4|wav|webm|mov|aac|ogg|flac)$/i.test(relativePath)
}

export function nativeContentFiles(manifest, sources, outputFiles, sourceChunks = {}) {
  const available = new Set(outputFiles)
  const sourceForFile = new Map(Object.entries(manifest).map(([key, entry]) => [entry.file, key]))
  return sources.map((source) => {
    const visited = new Set()
    const files = new Set()
    const visit = (key) => {
      if (visited.has(key)) return
      visited.add(key)
      const entry = manifest[key]
      if (!entry || typeof entry.file !== 'string') throw new Error(`Native content has no compiled module: ${key}`)
      for (const file of [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])]) {
        if (!available.has(file)) throw new Error(`Native content is missing a bundled dependency: ${file}`)
        files.add(file)
      }
      for (const dependency of entry.imports ?? []) visit(dependency)
    }
    // Some dynamic JSON modules merge with statically imported raw text. The
    // bundler's module map retains their identity when Vite's manifest does not.
    visit(manifest[source] ? source : sourceForFile.get(sourceChunks[source]) ?? source)
    return { source, files: [...files].sort() }
  })
}
