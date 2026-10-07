import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    private let host = EngineHost()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = EngineViewController(host: host)
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
    func applicationDidEnterBackground(_ application: UIApplication) { host.lifecycle(active: false) }
    func applicationDidBecomeActive(_ application: UIApplication) { host.lifecycle(active: true) }
}
