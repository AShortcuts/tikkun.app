import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'
import { parseHttpByteRange } from '../app/audio/http-byte-range.ts'
import { AUDIO_DIRECTORY } from './audio-library.mjs'

const mediaTypes = new Map([['.m4a', 'audio/mp4'], ['.mp3', 'audio/mpeg']])

/** Serves the top-level audio/ library during development; builds copy it into dist/audio. */
export function audioAssetsPlugin(root: string): Plugin {
  const library = path.join(root, AUDIO_DIRECTORY)
  return {
    name: 'tikkun-audio-assets',
    configureServer(server) {
      const prefix = `${server.config.base.replace(/\/$/, '')}/${AUDIO_DIRECTORY}/`
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        const type = mediaTypes.get(path.extname(pathname).toLowerCase())
        if (!pathname.startsWith(prefix) || !type || !['GET', 'HEAD'].includes(request.method ?? '')) {
          next()
          return
        }
        const file = path.join(library, decodeURIComponent(pathname.slice(prefix.length)))
        if (!file.startsWith(library + path.sep)) {
          next()
          return
        }
        void stat(file).then(({ size }) => {
          response.setHeader('Content-Type', type)
          response.setHeader('Accept-Ranges', 'bytes')
          const rangeHeader = request.headers.range
          const range = rangeHeader ? parseHttpByteRange(rangeHeader, size) : null
          if (rangeHeader && !range) {
            response.statusCode = 416
            response.setHeader('Content-Range', `bytes */${size}`)
            response.end()
            return
          }
          const start = range?.start ?? 0
          const end = range?.end ?? size - 1
          response.statusCode = range ? 206 : 200
          if (range) response.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
          response.setHeader('Content-Length', String(end - start + 1))
          if (request.method === 'HEAD') response.end()
          else createReadStream(file, { start, end }).pipe(response)
        }, (error: NodeJS.ErrnoException) => (error.code === 'ENOENT' ? next() : next(error)))
      })
    },
  }
}
