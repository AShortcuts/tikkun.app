export async function readBoundedResponse(response: Response, limit: number): Promise<string> {
  if (!response.ok || !response.body) throw new Error(`Update download failed (${response.status})`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let result = ''
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > limit) { await reader.cancel(); throw new Error('Update exceeds download limit') }
      result += decoder.decode(chunk.value, { stream: true })
    }
    return result + decoder.decode()
  } finally { reader.releaseLock() }
}
