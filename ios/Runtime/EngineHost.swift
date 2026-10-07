import Foundation
import CryptoKit
import WebKit
import UIKit

@MainActor
final class EngineHost: NSObject, URLSessionTaskDelegate {
    static let origin = URL(string: "http://127.0.0.1:7860")!
    let websiteDataStore = WKWebsiteDataStore.default()
    var statusChanged: ((String, Bool) -> Void)?
    var ready: (() -> Void)?
    private var started = false
    private var authenticated = false
    private var hostToken = ""
    private var webToken = ""
    private var readinessTask: Task<Void, Never>?
    private lazy var session = URLSession(configuration: .ephemeral, delegate: self, delegateQueue: .main)

    func start() {
        guard !started else { return }
        started = true
        do {
            guard let bundleRoot = Bundle.main.resourceURL?.appendingPathComponent("engine"),
                  FileManager.default.fileExists(atPath: bundleRoot.appendingPathComponent("packages/server/dist/ios-entry.js").path) else {
                throw RuntimeKeys.failure("엔진 자산이 없습니다. Mac에서 scripts/build-ios.mjs를 실행하고 다시 빌드하세요.")
            }
            var data = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                                  appropriateFor: nil, create: true).appendingPathComponent("Marinara", isDirectory: true)
            try FileManager.default.createDirectory(at: data, withIntermediateDirectories: true,
                                                   attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
            // Includes third-party extension storage, which may contain API keys.
            var resourceValues = URLResourceValues()
            resourceValues.isExcludedFromBackup = true
            try data.setResourceValues(resourceValues)
            hostToken = try RuntimeKeys.randomHex()
            webToken = try RuntimeKeys.randomHex()
            let environment = [
                "MARINARA_IOS": "1", "NODE_ENV": "production", "HOST": "127.0.0.1", "PORT": "7860",
                "DATA_DIR": data.path, "FILE_STORAGE_DIR": data.appendingPathComponent("storage").path,
                "MARINARA_ENV_FILE": data.appendingPathComponent("runtime.env").path,
                "MARINARA_IOS_HOST_TOKEN": hostToken, "MARINARA_IOS_WEB_TOKEN": webToken,
                "ENCRYPTION_KEY": try RuntimeKeys.encryptionKey(), "LOG_LEVEL": "warn",
                "AUTO_CREATE_DEFAULT_CONNECTION": "false", "AUTO_OPEN_BROWSER": "false",
                "AUTO_UPDATE_ENABLED": "false", "UPDATES_APPLY_DISABLED": "true",
                "ENABLE_EXTERNAL_EXTENSIONS": "true", "MARINARA_LITE": "true"
            ]
            let arguments = ["node", "--max-old-space-size=384", bundleRoot.appendingPathComponent("packages/server/dist/ios-entry.js").path]
            statusChanged?("Marinara 엔진을 시작하고 있습니다…", false)
            let thread = Thread { [weak self] in
                let result = NodeBridge.start(withArguments: arguments, environment: environment, workingDirectory: bundleRoot.path)
                Task { @MainActor in
                    self?.authenticated = false
                    self?.readinessTask?.cancel()
                    self?.statusChanged?("엔진이 종료되었습니다 (\(result)). 앱을 완전히 종료한 뒤 다시 열어 주세요.", true)
                }
            }
            thread.name = "Marinara Node"
            thread.stackSize = 8 * 1024 * 1024
            thread.start()
            awaitReady()
        } catch { statusChanged?(error.localizedDescription, true) }
    }

    private func proofMatches(_ response: Data, challenge: String) -> Bool {
        guard let object = try? JSONSerialization.jsonObject(with: response) as? [String: Any],
              object["version"] as? String == "2.5.0", let proof = object["proof"] as? String else { return false }
        // The JS side uses the UTF-8 token as its HMAC key too.
        let expected = HMAC<SHA256>.authenticationCode(for: Data(challenge.utf8), using: SymmetricKey(data: Data(hostToken.utf8)))
        return proof == expected.map { String(format: "%02x", $0) }.joined()
    }

    func awaitReady() {
        readinessTask?.cancel()
        readinessTask = Task {
            for _ in 0..<360 {
                if Task.isCancelled { return }
                do {
                    let challenge = try RuntimeKeys.randomHex()
                    let url = Self.origin.appendingPathComponent("api/ios/ready").appending(queryItems: [URLQueryItem(name: "challenge", value: challenge)])
                    var request = URLRequest(url: url)
                    request.timeoutInterval = 2
                    let (body, response) = try await session.data(for: request)
                    if let http = response as? HTTPURLResponse, http.statusCode == 200, proofMatches(body, challenge: challenge) {
                        guard let cookie = HTTPCookie(properties: [
                            .name: "MarinaraIOSSession", .value: webToken, .domain: "127.0.0.1", .path: "/",
                            .expires: Date().addingTimeInterval(365 * 24 * 3600),
                            HTTPCookiePropertyKey("HttpOnly"): "TRUE", HTTPCookiePropertyKey("SameSite"): "Strict"
                        ]) else { throw RuntimeKeys.failure("앱 인증 쿠키를 만들 수 없습니다.") }
                        await websiteDataStore.httpCookieStore.setCookie(cookie)
                        authenticated = true
                        ready?()
                        return
                    }
                    // A listener exists but cannot prove it is this runtime. Never give it a token.
                    if let http = response as? HTTPURLResponse, http.statusCode != 503 {
                        statusChanged?("내부 서버의 신원을 확인할 수 없습니다. 다른 앱이 포트 7860을 사용 중인지 확인하고 앱을 다시 시작하세요.", true)
                        return
                    }
                } catch { /* Connection refused is expected while the engine loads. */ }
                try? await Task.sleep(nanoseconds: 500_000_000)
            }
            statusChanged?("엔진이 준비되지 않았습니다. Xcode 콘솔의 시작 오류를 확인하고 앱을 다시 시작하세요.", true)
        }
    }

    func lifecycle(active: Bool) {
        guard authenticated else { return }
        var backgroundTask: UIBackgroundTaskIdentifier = .invalid
        if !active {
            backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "Save Marinara") {
                if backgroundTask != .invalid { UIApplication.shared.endBackgroundTask(backgroundTask); backgroundTask = .invalid }
            }
        }
        Task {
            defer { if backgroundTask != .invalid { UIApplication.shared.endBackgroundTask(backgroundTask) } }
            var request = URLRequest(url: Self.origin.appendingPathComponent("api/ios/lifecycle"))
            request.httpMethod = "POST"
            request.setValue(hostToken, forHTTPHeaderField: "x-marinara-ios-host")
            request.setValue("1", forHTTPHeaderField: "x-marinara-csrf")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONSerialization.data(withJSONObject: ["active": active])
            request.timeoutInterval = 15
            do {
                let (_, response) = try await session.data(for: request)
                guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw RuntimeKeys.failure("저장 확인에 실패했습니다.") }
            } catch {
                statusChanged?("엔진 연결 또는 저장 확인에 실패했습니다. 응답은 자동 재전송하지 않습니다. 앱을 다시 열어 저장 상태를 확인하세요.", true)
            }
        }
    }

    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                               newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
