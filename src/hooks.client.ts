import type { ClientInit, HandleClientError } from '@sveltejs/kit'
import { supportDiagnostics } from '../app/support/support-diagnostics.ts'

export const init: ClientInit = () => {
  supportDiagnostics.start({ view: window })
}

export const handleError: HandleClientError = ({ error }) => {
  supportDiagnostics.record('client-navigation-error', error)
}
