import { parseCueExportPayload } from '../../app/audio/cue-validation.ts'

const chunks: Buffer[] = []
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
const payload: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
if (!parseCueExportPayload(payload)) throw new Error('Draft fails the current Tikkun cue validator')
console.log('Current Tikkun cue validator passed')
