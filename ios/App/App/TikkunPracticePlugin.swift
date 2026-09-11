import Capacitor
import TikkunSystem
import WidgetKit

@objc(TikkunPracticePlugin)
public class TikkunPracticePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TikkunPracticePlugin"
    public let jsName = "TikkunPractice"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise)]

    @objc func update(_ call: CAPPluginCall) {
        do {
            var reading: PracticeReading?
            if let value = call.getObject("reading") {
                guard let hash = value["hash"] as? String, let name = value["parshaName"] as? String else {
                    throw ScheduleError.invalidPractice
                }
                reading = PracticeReading(hash: hash, parshaName: name, aliyahLabel: value["aliyahLabel"] as? String)
            }
            if try PracticeStore.shared().update(israel: call.getBool("israel"), reading: reading) {
                DispatchQueue.main.async { PracticeWidgetReload.changed() }
            }
            call.resolve()
        } catch { call.reject(error.localizedDescription) }
    }
}

enum PracticeWidgetReload {
    private static var pending: DispatchWorkItem?
    static func changed() {
        pending?.cancel()
        let work = DispatchWorkItem { flush() }
        pending = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 2, execute: work)
    }
    static func flush() {
        guard pending != nil else { return }
        pending?.cancel()
        pending = nil
        WidgetCenter.shared.reloadTimelines(ofKind: SystemIntegration.widgetKind)
    }
}
