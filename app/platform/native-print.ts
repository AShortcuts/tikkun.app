import { CapacitorException, ExceptionCode, registerPlugin } from '@capacitor/core'

export type NativePrintRequest = {
  html: string
  width: number
  height: number
  pages: number
  title: string
  anchor: { x: number; y: number; width: number; height: number }
}

interface NativePrintPlugin {
  printDocument(options: NativePrintRequest): Promise<{ completed: boolean }>
}

let plugin: NativePrintPlugin | undefined

export function printNatively(request: NativePrintRequest) {
  plugin ??= registerPlugin<NativePrintPlugin>('TikkunPrint')
  return plugin.printDocument(request)
}

export function nativePrintErrorMessage(error: unknown) {
  // Web updates can reach an older app binary that predates native printing.
  if (error instanceof CapacitorException && error.code === ExceptionCode.Unimplemented) {
    return 'Printing needs the latest version of the Tikkun app. Update the app and try again.'
  }
  return error instanceof Error && error.message ? error.message : 'Printing could not start. Try again.'
}
