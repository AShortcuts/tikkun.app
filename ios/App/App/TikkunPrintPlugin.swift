import Capacitor
import OSLog
import UIKit
import WebKit

/// WKWebView ignores window.print(), so the web print dialog hands its
/// prepared, self-contained pages here and iOS presents the system print sheet.
@objc(TikkunPrintPlugin)
public class TikkunPrintPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TikkunPrintPlugin"
    public let jsName = "TikkunPrint"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "printDocument", returnType: CAPPluginReturnPromise)]
    private var job: PrintJob?

    @objc func printDocument(_ call: CAPPluginCall) {
        guard let html = call.getString("html"), !html.isEmpty,
              let width = call.getDouble("width"), let height = call.getDouble("height"), width > 0, height > 0,
              let pages = call.getInt("pages"), pages > 0 else {
            call.reject("The prepared pages were incomplete. Close Print and try again.")
            return
        }
        let title = call.getString("title") ?? "Tikkun Reader"
        let anchor = call.getObject("anchor").flatMap { value -> CGRect? in
            guard let x = value["x"] as? Double, let y = value["y"] as? Double,
                  let w = value["width"] as? Double, let h = value["height"] as? Double else { return nil }
            return CGRect(x: x, y: y, width: w, height: h)
        }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard self.job == nil else { call.reject("Printing is already in progress."); return }
            guard UIPrintInteractionController.isPrintingAvailable else { call.reject("Printing is not available on this device."); return }
            guard let host = self.bridge?.viewController?.view else { call.reject("Printing is unavailable right now. Try again."); return }
            // CSS pixels are 1/96 inch; PDF points are 1/72 inch.
            let job = PrintJob(html: html, cssSize: CGSize(width: width, height: height), expectedPages: pages, title: title, host: host, anchor: anchor) { [weak self] result in
                self?.job = nil
                switch result {
                case .success(let completed): call.resolve(["completed": completed])
                case .failure(let error): call.reject(error.message)
                }
            }
            self.job = job
            job.start()
        }
    }
}

struct PrintFailure: Error {
    let message: String
}

private final class LetterPageRenderer: UIPrintPageRenderer {
    private let paper: CGRect
    init(paper: CGRect) {
        self.paper = paper
        super.init()
    }
    // Sheets already carry their own margins; print each one edge to edge.
    override var paperRect: CGRect { paper }
    override var printableRect: CGRect { paper }
}

private final class PrintJob: NSObject, WKNavigationDelegate {
    private static let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.adamn.tikkunreader", category: "print")
    private let html: String
    private let cssSize: CGSize
    private let expectedPages: Int
    private let title: String
    private weak var host: UIView?
    private let anchor: CGRect?
    private let completion: (Result<Bool, PrintFailure>) -> Void
    private var webView: WKWebView?
    private var finished = false

    init(html: String, cssSize: CGSize, expectedPages: Int, title: String, host: UIView, anchor: CGRect?, completion: @escaping (Result<Bool, PrintFailure>) -> Void) {
        self.html = html
        self.cssSize = cssSize
        self.expectedPages = expectedPages
        self.title = title
        self.host = host
        self.anchor = anchor
        self.completion = completion
    }

    func start() {
        guard let host else { return finish(.failure(PrintFailure(message: "Printing is unavailable right now. Try again."))) }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let webView = WKWebView(frame: CGRect(origin: .zero, size: cssSize), configuration: configuration)
        webView.navigationDelegate = self
        webView.isUserInteractionEnabled = false
        webView.alpha = 0
        // Keep the renderer attached to a window so WebKit lays it out normally.
        host.insertSubview(webView, at: 0)
        self.webView = webView
        webView.loadHTMLString(html, baseURL: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.callAsyncJavaScript("await document.fonts.ready; return document.querySelectorAll('.paper-sheet').length", arguments: [:], in: nil, in: .defaultClient) { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let count):
                guard (count as? Int) == self.expectedPages else {
                    Self.log.error("Print snapshot has \(String(describing: count), privacy: .public) sheets; expected \(self.expectedPages)")
                    return self.finish(.failure(PrintFailure(message: "The prepared pages could not be copied for printing. Close Print and try again.")))
                }
                self.present(self.makePDF(webView))
            case .failure(let error):
                Self.log.error("Print snapshot fonts failed: \(error.localizedDescription, privacy: .public)")
                self.finish(.failure(PrintFailure(message: "The print fonts could not load. Close Print and try again.")))
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { loadFailed(error) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { loadFailed(error) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        Self.log.error("Print renderer process terminated")
        finish(.failure(PrintFailure(message: "The pages were too large to prepare for printing. Try printing a shorter passage.")))
    }

    private func loadFailed(_ error: Error) {
        Self.log.error("Print snapshot failed to load: \(error.localizedDescription, privacy: .public)")
        finish(.failure(PrintFailure(message: "The prepared pages could not load for printing. Close Print and try again.")))
    }

    private func makePDF(_ webView: WKWebView) -> Data {
        let paper = CGRect(x: 0, y: 0, width: cssSize.width * 0.75, height: cssSize.height * 0.75)
        let renderer = LetterPageRenderer(paper: paper)
        renderer.addPrintFormatter(webView.viewPrintFormatter(), startingAtPageAt: 0)
        let pageCount = renderer.numberOfPages
        if pageCount != expectedPages {
            Self.log.error("Print pagination produced \(pageCount) pages; expected \(self.expectedPages)")
        }
        let format = UIGraphicsPDFRendererFormat()
        format.documentInfo = [kCGPDFContextTitle as String: title, kCGPDFContextCreator as String: "Tikkun Reader"]
        return UIGraphicsPDFRenderer(bounds: paper, format: format).pdfData { context in
            renderer.prepare(forDrawingPages: NSRange(location: 0, length: pageCount))
            for page in 0..<pageCount {
                context.beginPage()
                renderer.drawPage(at: page, in: context.pdfContextBounds)
            }
        }
    }

    private func present(_ pdf: Data) {
        guard let host else { return finish(.failure(PrintFailure(message: "Printing is unavailable right now. Try again."))) }
        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .general
        info.jobName = title
        info.orientation = cssSize.width > cssSize.height ? .landscape : .portrait
        let controller = UIPrintInteractionController.shared
        controller.printInfo = info
        controller.printingItem = pdf
        let done: UIPrintInteractionController.CompletionHandler = { [weak self] _, completed, error in
            if let error {
                Self.log.error("Print job failed: \(error.localizedDescription, privacy: .public)")
                self?.finish(.failure(PrintFailure(message: error.localizedDescription)))
            } else {
                self?.finish(.success(completed))
            }
        }
        let shown: Bool
        if host.traitCollection.userInterfaceIdiom == .pad {
            let source = anchor ?? CGRect(x: host.bounds.midX, y: host.bounds.maxY - 1, width: 1, height: 1)
            shown = controller.present(from: source, in: host, animated: true, completionHandler: done)
        } else {
            shown = controller.present(animated: true, completionHandler: done)
        }
        if !shown { finish(.failure(PrintFailure(message: "The print sheet could not open. Try again."))) }
    }

    private func finish(_ result: Result<Bool, PrintFailure>) {
        guard !finished else { return }
        finished = true
        webView?.navigationDelegate = nil
        webView?.removeFromSuperview()
        webView = nil
        completion(result)
    }
}
