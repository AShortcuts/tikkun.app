export interface ReaderRuntimeLifetime {
  readonly generation: number
  readonly signal: AbortSignal
  isCurrent(): boolean
}

export class ReaderRuntimeLifecycle {
  private generation = 0
  private activeController: AbortController | null = null

  begin(): ReaderRuntimeLifetime {
    this.activeController?.abort()
    const generation = ++this.generation
    const controller = new AbortController()
    this.activeController = controller

    return {
      generation,
      signal: controller.signal,
      isCurrent: () =>
        this.generation === generation &&
        this.activeController === controller &&
        !controller.signal.aborted,
    }
  }

  cancel() {
    this.generation += 1
    this.activeController?.abort()
    this.activeController = null
  }
}
