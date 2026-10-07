import UIKit
import WebKit

final class EngineViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private let host: EngineHost
    private var webView: WKWebView!
    private let status = UILabel()
    private var downloadFiles: [ObjectIdentifier: URL] = [:]

    init(host: EngineHost) { self.host = host; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("Use init(host:)") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let config = WKWebViewConfiguration()
        config.websiteDataStore = host.websiteDataStore
        config.applicationNameForUserAgent = "MarinaraIOS/1"
        config.allowsInlineMediaPlayback = true
        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        view.addSubview(webView)
        status.numberOfLines = 0
        status.textAlignment = .center
        status.text = "Marinara를 준비합니다…"
        status.backgroundColor = .systemBackground
        status.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(status)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor), webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            status.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            status.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            status.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24)
        ])
        host.statusChanged = { [weak self] message, _ in self?.status.text = message; self?.status.isHidden = false }
        host.ready = { [weak self] in self?.webView.load(URLRequest(url: EngineHost.origin)) }
        host.start()
    }

    private func isLocal(_ url: URL) -> Bool {
        url.scheme == "http" && url.host == "127.0.0.1" && url.port == 7860 && url.user == nil && url.password == nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        let localBlob = url.absoluteString.hasPrefix("blob:http://127.0.0.1:7860/")
        if isLocal(url) || localBlob {
            decisionHandler(action.shouldPerformDownload ? .download : .allow)
        } else if action.targetFrame?.isMainFrame == false {
            // Opaque-origin sandbox/Worker extension frames remain subject to WebKit and the engine CSP.
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            if action.navigationType == .linkActivated && ["https", "http"].contains(url.scheme ?? "") {
                UIApplication.shared.open(url)
            }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { status.isHidden = true }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        status.text = "화면을 열 수 없습니다: \(error.localizedDescription)"; status.isHidden = false
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { host.awaitReady() }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if isLocal(url) || url.absoluteString.hasPrefix("blob:http://127.0.0.1:7860/") { webView.load(action.request) }
            else if ["http", "https"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
        }
        return nil
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        do {
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let name = (suggestedFilename as NSString).lastPathComponent
            let file = folder.appendingPathComponent(name.isEmpty || name == "." || name == ".." ? "Marinara-export" : name)
            downloadFiles[ObjectIdentifier(download)] = file
            completionHandler(file)
        } catch { completionHandler(nil); showError(error.localizedDescription) }
    }
    func downloadDidFinish(_ download: WKDownload) {
        guard let file = downloadFiles.removeValue(forKey: ObjectIdentifier(download)) else { return }
        let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        share.popoverPresentationController?.sourceView = view
        share.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
        share.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        present(share, animated: true)
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let file = downloadFiles.removeValue(forKey: ObjectIdentifier(download)) { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        showError("내보내기에 실패했습니다: \(error.localizedDescription)")
    }
    private func showError(_ message: String) {
        let alert = UIAlertController(title: "Marinara", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "확인", style: .default))
        present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: "Marinara", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: "Marinara", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }
}
