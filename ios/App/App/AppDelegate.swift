import UIKit
import Capacitor
import AVFAudio
import OSLog

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        } catch {
            Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.adamn.tikkunreader", category: "audio")
                .error("Could not configure playback audio session: \(error.localizedDescription, privacy: .public)")
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

class TikkunHostViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let reader = TikkunBridgeViewController()
        addChild(reader)
        reader.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(reader.view)
        NSLayoutConstraint.activate([
            reader.view.topAnchor.constraint(equalTo: view.topAnchor),
            reader.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            reader.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            reader.view.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        reader.didMove(toParent: self)
    }

    override var childForStatusBarStyle: UIViewController? { children.first }
}

class TikkunBridgeViewController: CAPBridgeViewController {
    override func router() -> Router { TikkunStaticRouter() }

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(TikkunPracticePlugin())
        bridge?.registerPluginInstance(TikkunPlaybackPlugin())
        bridge?.registerPluginInstance(TikkunMediaPlugin())
    }
}

// SvelteKit prerenders one index.html per route; Capacitor's default router
// sends all extensionless paths to the root document instead.
struct TikkunStaticRouter: Router {
    var basePath = ""

    func route(for path: String) -> String {
        let root = URL(fileURLWithPath: basePath).standardizedFileURL
        let relative = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let resource = root.appendingPathComponent(relative).standardizedFileURL
        guard resource.path == root.path || resource.path.hasPrefix(root.path + "/") else {
            return root.appendingPathComponent("index.html").path
        }
        if resource.pathExtension.isEmpty {
            let index = resource.appendingPathComponent("index.html")
            if FileManager.default.fileExists(atPath: index.path) { return index.path }
            return root.appendingPathComponent("index.html").path
        }
        return resource.path
    }
}
