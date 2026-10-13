import ExpoModulesCore
import NetworkExtension
import Security

public class WaypointNetworkModule: Module {
  private var joinedSSID: String?
  public func definition() -> ModuleDefinition {
    Name("WaypointNetwork")
    AsyncFunction("join") { (ssid: String, password: String, promise: Promise) in
      guard !ssid.isEmpty, ssid.utf8.count <= 32, (8...63).contains(password.count) else { promise.reject("INVALID_WIFI", "Invalid visitor Wi-Fi details."); return }
      let configuration = NEHotspotConfiguration(ssid: ssid, passphrase: password, isWEP: false)
      configuration.joinOnce = true
      NEHotspotConfigurationManager.shared.apply(configuration) { error in
        if let error = error as NSError?, error.code != NEHotspotConfigurationError.alreadyAssociated.rawValue {
          promise.reject("WIFI_JOIN", "Wi-Fi connection was declined or unavailable. Join Building-Maps in Settings and retry.")
        } else { self.joinedSSID = ssid; promise.resolve(nil) }
      }
    }
    AsyncFunction("download") { (url: String, certificatePem: String, promise: Promise) in
      guard let target = URL(string: url), target.scheme == "https", target.port == 8443,
        target.path.range(of: "^/buildings/demo-001/(manifest|packages/[0-9.]+\\.zip)$", options: .regularExpression) != nil else {
        promise.reject("ENDPOINT", "Only the configured building package endpoint is allowed."); return
      }
      let delegate = BuildingTrustDelegate(pem: certificatePem)
      let config = URLSessionConfiguration.ephemeral
      config.timeoutIntervalForRequest = 30; config.timeoutIntervalForResource = 90
      config.allowsCellularAccess = false; config.waitsForConnectivity = false
      let session = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
      delegate.promise = promise; delegate.session = session
      session.dataTask(with: target).resume()
    }
    AsyncFunction("disconnect") {
      if let ssid = self.joinedSSID { NEHotspotConfigurationManager.shared.removeConfiguration(forSSID: ssid) }
      self.joinedSSID = nil
    }
  }
}

private final class BuildingTrustDelegate: NSObject, URLSessionDataDelegate {
  let certificate: SecCertificate?
  var promise: Promise?
  var session: URLSession?
  private var data = Data()
  private var failed = false
  init(pem: String) {
    let base64 = pem.components(separatedBy: .newlines).filter { !$0.hasPrefix("-----") }.joined()
    if let data = Data(base64Encoded: base64) { certificate = SecCertificateCreateWithData(nil, data as CFData) } else { certificate = nil }
  }
  func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
      let trust = challenge.protectionSpace.serverTrust, let certificate = certificate else {
      completionHandler(.cancelAuthenticationChallenge, nil); return
    }
    // Trust only this pre-provisioned building certificate; preserve hostname/date checks.
    SecTrustSetAnchorCertificates(trust, [certificate] as CFArray)
    SecTrustSetAnchorCertificatesOnly(trust, true)
    SecTrustSetNetworkFetchAllowed(trust, false)
    var error: CFError?
    if SecTrustEvaluateWithError(trust, &error) { completionHandler(.useCredential, URLCredential(trust: trust)) }
    else { completionHandler(.cancelAuthenticationChallenge, nil) }
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    guard let response = response as? HTTPURLResponse, response.statusCode == 200, response.expectedContentLength <= 50*1024*1024 else {
      failed = true; promise?.reject("PACKAGE", "Invalid or oversized building response."); completionHandler(.cancel); return
    }
    completionHandler(.allow)
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive chunk: Data) {
    guard !failed else { return }
    if data.count + chunk.count > 50*1024*1024 { failed = true; promise?.reject("PACKAGE", "The building response exceeds 50 MB."); dataTask.cancel(); data.removeAll(); return }
    data.append(chunk)
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    defer { session.finishTasksAndInvalidate(); self.session = nil; promise = nil }
    guard !failed else { return }
    if let error = error { promise?.reject("TRANSFER", "The trusted building server could not be reached: \(error.localizedDescription)") }
    else { promise?.resolve(data.base64EncodedString()) }
  }
}
