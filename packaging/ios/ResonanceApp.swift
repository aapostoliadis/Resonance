import Network
import SwiftUI
import UIKit
import WebKit

@main
struct ResonanceApp: App {
    var body: some Scene {
        WindowGroup {
            ResonanceView().ignoresSafeArea(edges: .bottom)
                .preferredColorScheme(.dark)
        }
    }
}

struct ResonanceView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let view = WKWebView()
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        view.isOpaque = false
        view.backgroundColor = UIColor(red: 0.035, green: 0.043, blue: 0.043, alpha: 1)
        context.coordinator.start(view)
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        private let queue = DispatchQueue(label: "local.resonance.http")
        private var listener: NWListener?
        private var origin: URL?
        private let files: [String: String] = [
            "/index.html": "text/html", "/app.js": "text/javascript",
            "/apple-music.js": "text/javascript", "/style.css": "text/css",
            "/player.css": "text/css", "/player.js": "text/javascript",
            "/reactivity.js": "text/javascript", "/graphics.bundle.js": "text/javascript"
        ]

        func start(_ view: WKWebView) {
            do {
                let parameters = NWParameters.tcp
                parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: 4391)
                let listener = try NWListener(using: parameters)
                self.listener = listener
                listener.newConnectionHandler = { [weak self] connection in
                    guard let self = self else { connection.cancel(); return }
                    connection.start(queue: self.queue)
                    self.read(connection)
                }
                listener.stateUpdateHandler = { [weak self, weak view, weak listener] state in
                    switch state {
                    case .ready:
                        guard let port = listener?.port,
                              let url = URL(string: "http://127.0.0.1:\(port.rawValue)") else { return }
                        DispatchQueue.main.async {
                            self?.origin = url
                            view?.load(URLRequest(url: url.appendingPathComponent("index.html")
                                .withQuery("mobile=1")))
                        }
                    case .failed:
                        DispatchQueue.main.async {
                            view?.loadHTMLString("Unable to start Resonance. Reopen the app to try again.", baseURL: nil)
                        }
                    default: break
                    }
                }
                listener.start(queue: queue)
            } catch {
                view.loadHTMLString("Unable to start Resonance.", baseURL: nil)
            }
        }

        private func read(_ connection: NWConnection, buffered: Data = Data()) {
            connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] data, _, complete, error in
                guard let self = self, let data = data, error == nil else { connection.cancel(); return }
                var request = buffered
                request.append(data)
                guard request.count <= 16384 else { connection.cancel(); return }
                guard request.range(of: Data("\r\n\r\n".utf8)) != nil else {
                    if complete { connection.cancel() } else { self.read(connection, buffered: request) }
                    return
                }
                let line = String(decoding: request, as: UTF8.self).components(separatedBy: "\r\n").first
                let parts = line?.split(separator: " ") ?? []
                guard parts.count == 3, parts[0] == "GET" else { connection.cancel(); return }
                let requested = String(parts[1]).components(separatedBy: "?")[0]
                let path = requested == "/" ? "/index.html" : requested
                let mime: String
                let body: Data
                let status: String
                if let fileType = self.files[path],
                   let root = Bundle.main.resourceURL,
                   let asset = try? Data(contentsOf: root.appendingPathComponent("web").appendingPathComponent(String(path.dropFirst()))) {
                    mime = fileType; body = asset; status = "200 OK"
                } else if path == "/api/spotify" || path == "/api/apple-music" {
                    mime = "application/json"
                    body = Data("{\"available\":false,\"reason\":\"Control playback in your music app\"}".utf8)
                    status = "200 OK"
                } else {
                    mime = "text/plain"; body = Data("Not Found".utf8); status = "404 Not Found"
                }
                var response = Data("HTTP/1.1 \(status)\r\nContent-Type: \(mime); charset=utf-8\r\nContent-Length: \(body.count)\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n\r\n".utf8)
                response.append(body)
                connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
            }
        }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url else { decisionHandler(.cancel); return }
            if url.scheme == "http", url.host == origin?.host, url.port == origin?.port {
                decisionHandler(.allow)
                return
            }
            if action.navigationType == .linkActivated,
               (url.scheme == "spotify" || (url.scheme == "https" &&
                ["open.spotify.com", "music.apple.com"].contains(url.host ?? ""))) {
                UIApplication.shared.open(url)
            }
            decisionHandler(.cancel)
        }

        func webView(_ webView: WKWebView, requestMediaCapturePermissionFor securityOrigin: WKSecurityOrigin,
                     initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                     decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            let local = securityOrigin.protocol == "http" && securityOrigin.host == origin?.host
                && securityOrigin.port == origin?.port
            decisionHandler(local && frame.isMainFrame && type == .microphone ? .prompt : .deny)
        }

        deinit { listener?.cancel() }
    }
}

private extension URL {
    func withQuery(_ query: String) -> URL {
        var components = URLComponents(url: self, resolvingAgainstBaseURL: false)!
        components.query = query
        return components.url!
    }
}
