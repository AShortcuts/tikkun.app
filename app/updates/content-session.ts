import { contentCompatibility, digestText, object, parseContentSnapshot, type ContentSnapshot } from './content-schema.ts'

export interface SavedContent { digest: string; payload: string }
export interface ContentState {
  active: SavedContent | null
  pending: SavedContent | null
  trial: string | null
  rejected: string[]
}
export interface ContentStore {
  read(): Promise<string | null>
  write(state: string): Promise<void>
}
export const emptyContentState = (): ContentState => ({ active: null, pending: null, trial: null, rejected: [] })
export function parseContentState(raw: string | null): ContentState {
  if (raw === null) return emptyContentState()
  const value: unknown = JSON.parse(raw)
  const saved = (entry: unknown): entry is SavedContent | null => entry === null || (object(entry) && typeof entry.digest === 'string' && /^[a-f0-9]{64}$/.test(entry.digest) && typeof entry.payload === 'string')
  if (!object(value) || !saved(value.active) || !saved(value.pending) ||
      !(value.trial === null || typeof value.trial === 'string') || !Array.isArray(value.rejected) ||
      !value.rejected.every((id): id is string => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id))) throw new Error('Invalid saved content state')
  return { active: value.active, pending: value.pending, trial: value.trial, rejected: value.rejected.slice(-20) }
}

export class ContentSession {
  private state = emptyContentState()
  private selected: SavedContent | null = null
  snapshot: ContentSnapshot | null = null
  constructor(private store: ContentStore, private compatibility: string, private report: (error: unknown) => void) {}
  private save() { return this.store.write(JSON.stringify(this.state)) }
  async validate(saved: SavedContent) {
    if (await digestText(saved.payload) !== saved.digest) throw new Error('Content checksum mismatch')
    const snapshot = parseContentSnapshot(JSON.parse(saved.payload))
    if (await contentCompatibility(snapshot) !== this.compatibility) throw new Error('Content is incompatible with this Reader')
    return snapshot
  }
  async open() {
    const stored = await this.store.read()
    try { this.state = parseContentState(stored) }
    catch (error) {
      this.report(error)
      this.state = emptyContentState()
      await this.save()
    }
    if (this.state.trial) {
      this.state.rejected = [...this.state.rejected, this.state.trial].slice(-20)
      this.state.pending = null
      this.state.trial = null
      await this.save()
    }
    for (const saved of [this.state.pending, this.state.active]) {
      if (!saved || this.state.rejected.includes(saved.digest)) continue
      try {
        const snapshot = await this.validate(saved)
        if (saved === this.state.pending) { this.state.trial = saved.digest; await this.save() }
        this.selected = saved
        this.snapshot = snapshot
        return
      } catch (error) {
        this.report(error)
        this.state.rejected = [...this.state.rejected, saved.digest].slice(-20)
        if (saved === this.state.pending) this.state.pending = null
        else this.state.active = null
        this.state.trial = null
        await this.save()
      }
    }
  }
  async ready() {
    if (this.state.trial && this.selected?.digest === this.state.trial) {
      this.state.active = this.selected
      this.state.pending = null
      this.state.trial = null
      await this.save()
    }
  }
  has(digest: string) {
    return this.state.active?.digest === digest || this.state.pending?.digest === digest || this.state.rejected.includes(digest)
  }
  async stage(saved: SavedContent) {
    if (this.has(saved.digest)) return
    await this.validate(saved)
    const next = { ...this.state, pending: saved }
    await this.store.write(JSON.stringify(next))
    this.state = next
    // Never mutate this.snapshot: the entire open document uses one revision.
  }
}
