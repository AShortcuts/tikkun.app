import type { ClientInit, HandleClientError } from '@sveltejs/kit'
import { supportDiagnostics } from '../app/support/support-diagnostics.ts'
import { trackAnalytics } from '../app/analytics/client.ts'

export const init: ClientInit = () => {
  supportDiagnostics.start({ view: window })
}

export const handleError: HandleClientError = ({ error }) => {
  trackAnalytics('client_error', { kind: 'navigation' })
  supportDiagnostics.record('client-navigation-error', error)
}
