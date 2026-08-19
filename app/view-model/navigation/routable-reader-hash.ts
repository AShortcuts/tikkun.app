import { LeiningGenerator } from '../../calendar-model/generator.ts'
import type { UserSettings } from '../../calendar-model/user-settings.ts'
import { isReaderHash } from './reader-hash.ts'
import { parseUrl } from './url-parser.ts'

const supportedSettings: UserSettings[] = [true, false].flatMap((israel) =>
  [true, false].flatMap((ashkenazi) =>
    [true, false].map((includeModernHolidays) => ({
      israel,
      ashkenazi,
      includeModernHolidays,
    }))
  )
)
const routeValidationGenerators = supportedSettings.map(
  (settings) => new LeiningGenerator(settings)
)

/** Validates a persisted route against every supported calendar mode. */
export function isSemanticallyRoutableReaderHash(hash: string) {
  if (!isReaderHash(hash)) return false
  const path = hash.replace(/^#/, '')
  return routeValidationGenerators.some(
    (generator) => parseUrl(generator, path)?.view === 'reader'
  )
}
