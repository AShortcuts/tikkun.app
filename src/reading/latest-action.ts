export type LatestActionToken = number

export class LatestAction {
  private current = 0

  start(): LatestActionToken {
    this.current += 1
    return this.current
  }

  isCurrent(token: LatestActionToken) {
    return token === this.current
  }

  cancel() {
    this.current += 1
  }
}
