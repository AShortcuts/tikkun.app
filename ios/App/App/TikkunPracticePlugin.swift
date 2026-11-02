import Capacitor
import TikkunSystem
import UIKit
import WidgetKit

@objc(TikkunPracticePlugin)
public class TikkunPracticePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TikkunPracticePlugin"
    public let jsName = "TikkunPractice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deviceInfo", returnType: CAPPluginReturnPromise),
    ]

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

    /// Anonymous device facts for the daily analytics check-in. iPhone and iPad apps on a Mac report "mac".
    @objc func deviceInfo(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let process = ProcessInfo.processInfo
            let device: String
            if process.isiOSAppOnMac || process.isMacCatalystApp {
                device = "mac"
            } else {
                switch UIDevice.current.userInterfaceIdiom {
                case .phone: device = "iphone"
                case .pad: device = "ipad"
                case .mac: device = "mac"
                case .vision: device = "apple_vision"
                case .tv: device = "apple_tv"
                default: device = "other"
                }
            }
            let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
            call.resolve(["device": device, "os": process.operatingSystemVersion.majorVersion, "appVersion": version])
        }
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
