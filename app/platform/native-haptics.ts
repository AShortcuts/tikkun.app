import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

export function nativeControlHaptic(pointerType: string) {
  if (pointerType !== 'touch' || !Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('Haptics')) return
  void Haptics.impact({ style: ImpactStyle.Light }).catch((error) => {
    console.error('Could not play reader control haptic', error)
  })
}
