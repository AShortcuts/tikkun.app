import { digestText, object } from './content-schema.ts'
import {
  isContentDigest,
  parsePublishedCatalog,
  publishedCueFileName,
  type BuiltInContent,
  type PublishedCatalog,
} from './published-content.ts'

export const CONTENT_STATE_FILE = 'state.json'

export interface SavedCatalog {
  digest: string
  catalog: string
  // The built-in content this was saved against; an app update replaces both.
  builtIn: string
}
export interface ContentState {
  active: SavedCatalog | null
  pending: SavedCatalog | null
  trial: string | null
  rejected: string[]
}
export interface ContentStore {
  read(name: string): Promise<string | null>
  write(name: string, value: string): Promise<void>
  // Deletes saved cue files that are not listed.
  prune(keep: readonly string[]): Promise<void>
}

export const emptyContentState = (): ContentState => ({ active: null, pending: null, trial: null, rejected: [] })

export function parseContentState(raw: string | null): ContentState {
  if (raw === null) return emptyContentState()
  const value: unknown = JSON.parse(raw)
  const saved = (entry: unknown): entry is SavedCatalog | null => entry === null || (object(entry) &&
    isContentDigest(entry.digest) && typeof entry.catalog === 'string' && isContentDigest(entry.builtIn))
  if (!object(value) || !saved(value.active) || !saved(value.pending) ||
      !(value.trial === null || isContentDigest(value.trial)) ||
      !Array.isArray(value.rejected) || !value.rejected.every(isContentDigest)) throw new Error('Invalid saved content state')
  return { active: value.active, pending: value.pending, trial: value.trial, rejected: value.rejected.slice(-20) }
}

// Cue files a catalog needs from device storage; unchanged ones load from the app itself.
export function storedCueFiles(catalog: PublishedCatalog, builtIn: BuiltInContent) {
  return [...new Set(Object.entries(catalog.cues)
    .filter(([path, digest]) => builtIn.cues[path] !== digest)
    .map(([, digest]) => publishedCueFileName(digest)))]
}

export class ContentSession {
  private state = emptyContentState()
  private selected: SavedCatalog | null = null
  // Chosen once per launch, so every screen in a session sees the same recordings and cues.
  catalog: PublishedCatalog | null = null

  constructor(
    private readonly store: ContentStore,
    private readonly builtIn: BuiltInContent,
    private readonly report: (error: unknown) => void
  ) {}

  private save(state = this.state) {
    return this.store.write(CONTENT_STATE_FILE, JSON.stringify(state))
  }

  async validate(saved: SavedCatalog) {
    if (saved.builtIn !== this.builtIn.digest) throw new Error('Saved content belongs to a different app version')
    if (await digestText(saved.catalog) !== saved.digest) throw new Error('Saved content checksum mismatch')
    const catalog = parsePublishedCatalog(JSON.parse(saved.catalog))
    if (catalog.textLayout !== this.builtIn.textLayout) throw new Error('Saved content was made for a different Torah text')
    return catalog
  }

  async open() {
    let changed = false
    // Storage failures propagate; only an unreadable saved state starts over.
    const stored = await this.store.read(CONTENT_STATE_FILE)
    try {
      this.state = parseContentState(stored)
    } catch (error) {
      this.report(error)
      this.state = emptyContentState()
      changed = true
    }
    // After an app update its own copy is at least as new; the next check fetches anything newer.
    for (const key of ['active', 'pending'] as const) {
      if (this.state[key] && this.state[key].builtIn !== this.builtIn.digest) {
        this.state[key] = null
        changed = true
      }
    }
    // The previous launch with this content never finished starting the Reader.
    if (this.state.trial) {
      this.state.rejected = [...this.state.rejected, this.state.trial].slice(-20)
      if (this.state.pending?.digest === this.state.trial) this.state.pending = null
      this.state.trial = null
      changed = true
    }
    for (const key of ['pending', 'active'] as const) {
      const saved = this.state[key]
      if (!saved || this.state.rejected.includes(saved.digest)) continue
      try {
        this.catalog = await this.validate(saved)
        this.selected = saved
        if (key === 'pending') {
          this.state.trial = saved.digest
          changed = true
        }
        break
      } catch (error) {
        this.report(error)
        this.state.rejected = [...this.state.rejected, saved.digest].slice(-20)
        this.state[key] = null
        changed = true
      }
    }
    if (changed) await this.save()
  }

  // The Reader started with this launch's content, so it becomes the working copy.
  async ready() {
    if (this.state.trial && this.selected?.digest === this.state.trial) {
      this.state = { ...this.state, active: this.selected, pending: null, trial: null }
      await this.save()
    }
    await this.prune()
  }

  get usingDigest() {
    return this.selected?.digest ?? this.builtIn.digest
  }
  get pendingDigest() {
    return this.state.pending?.digest ?? null
  }
  get pending() {
    return this.state.pending !== null
  }

  async heldFiles() {
    const names = new Set<string>()
    for (const saved of [this.state.active, this.state.pending]) {
      if (!saved) continue
      let catalog = this.catalog
      if (saved !== this.selected) {
        try {
          catalog = await this.validate(saved)
        } catch (error) {
          // Its files can go; the next launch rejects this saved catalog.
          this.report(error)
          continue
        }
      }
      for (const name of catalog ? storedCueFiles(catalog, this.builtIn) : []) names.add(name)
    }
    return names
  }

  async prune() {
    await this.store.prune([...await this.heldFiles()])
  }

  // Call only after every cue file the catalog needs is saved.
  async stage(saved: SavedCatalog) {
    if (this.state.rejected.includes(saved.digest)) throw new Error('This content failed to start the Reader on this device before')
    await this.validate(saved)
    const next = { ...this.state, pending: saved }
    await this.save(next)
    this.state = next
  }

  // The website returned to the content this launch already uses.
  async discardPending() {
    if (!this.state.pending) return
    const next = { ...this.state, pending: null }
    await this.save(next)
    this.state = next
  }
}
