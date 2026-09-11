import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildContentRelease } from './build-content-release.ts'
import { emptyContentState, parseContentState } from '../app/updates/content-session.ts'

const [mode, container] = process.argv.slice(2)
if (!container || !container.includes('/CoreSimulator/Devices/') || !container.includes('/Containers/Data/Application/')) throw new Error('Supply a dedicated test Simulator app data container')
const release = await buildContentRelease()
const file = path.join(container, 'Library/Application Support/TikkunContent/state.json')
if (mode === 'seed') {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ ...emptyContentState(), pending: { digest: release.manifest.digest, payload: release.payload } }))
  console.log('Staged real content in the dedicated test Simulator. Cold-launch the app, then run check.')
} else if (mode === 'check') {
  const state = parseContentState(await readFile(file, 'utf8'))
  if (state.active?.digest !== release.manifest.digest || state.pending !== null || state.trial !== null || state.rejected.length) throw new Error('Native Reader did not accept and commit the staged content')
  console.log(JSON.stringify({ nativeColdLaunch: 'passed', digest: state.active.digest, bytes: release.manifest.bytes }))
} else throw new Error('Use seed or check with the dedicated test Simulator container')
