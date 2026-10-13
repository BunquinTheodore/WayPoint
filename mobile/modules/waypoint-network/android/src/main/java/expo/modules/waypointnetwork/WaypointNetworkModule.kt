package expo.modules.waypointnetwork

import android.content.Context
import android.net.*
import android.net.wifi.WifiNetworkSpecifier
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.URL
import java.security.KeyStore
import java.security.cert.CertificateFactory
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory

class WaypointNetworkModule: Module() {
  private var connection: Network? = null
  private var callback: ConnectivityManager.NetworkCallback? = null
  private val manager get() = appContext.reactContext!!.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

  override fun definition() = ModuleDefinition {
    Name("WaypointNetwork")
    AsyncFunction("join") { ssid: String, password: String, promise: Promise ->
      if (Build.VERSION.SDK_INT < 29) { promise.reject("UNSUPPORTED", "Join the building Wi-Fi in Settings on this device.", null); return@AsyncFunction }
      if (ssid.isBlank() || ssid.length > 32 || password.length !in 8..63) { promise.reject("INVALID_WIFI", "Invalid visitor Wi-Fi details.", null); return@AsyncFunction }
      release()
      val specifier = WifiNetworkSpecifier.Builder().setSsid(ssid).setWpa2Passphrase(password).build()
      val request = NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).setNetworkSpecifier(specifier).build()
      var settled = false
      val handler = Handler(Looper.getMainLooper())
      val timeout = Runnable { if (!settled) { settled = true; release(); promise.reject("WIFI_TIMEOUT", "The building Wi-Fi could not be joined. Check that it is in range and try again.", null) } }
      callback = object: ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) { if (settled) return; settled = true; handler.removeCallbacks(timeout); connection = network; promise.resolve(null) }
        override fun onUnavailable() { if (settled) return; settled = true; handler.removeCallbacks(timeout); release(); promise.reject("WIFI_DENIED", "Wi-Fi connection was declined or unavailable. You can join Building-Maps in Settings and retry.", null) }
        override fun onLost(network: Network) { if (connection == network) connection = null }
      }
      try { manager.requestNetwork(request, callback!!); handler.postDelayed(timeout, 60000) }
      catch (error: Exception) { release(); promise.reject("WIFI_PERMISSION", "Allow nearby Wi-Fi access, or join the building Wi-Fi in Settings.", error) }
    }
    AsyncFunction("download") { url: String, certificatePem: String ->
      val target = URL(url)
      require(target.protocol == "https" && target.port == 8443) { "Only the configured HTTPS package server is allowed." }
      require(target.path.matches(Regex("/buildings/demo-001/(manifest|packages/[0-9.]+\\.zip)"))) { "Unsupported package endpoint." }
      val cert = CertificateFactory.getInstance("X.509").generateCertificate(certificatePem.byteInputStream())
      val store = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null); setCertificateEntry("waypoint-building", cert) }
      val trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(store) }
      val ssl = SSLContext.getInstance("TLS").apply { init(null, trust.trustManagers, null) }
      // Use this specific local-only Wi-Fi Network. Do not route package requests over cellular.
      val wifi = connection ?: manager.allNetworks.firstOrNull { manager.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true }
      require(wifi != null) { "Connect to the building Wi-Fi before downloading." }
      val request = wifi.openConnection(target) as HttpsURLConnection
      request.sslSocketFactory = ssl.socketFactory
      request.instanceFollowRedirects = false
      request.connectTimeout = 15000; request.readTimeout = 30000
      try {
        require(request.responseCode == 200) { "Package server returned ${request.responseCode}." }
        require(request.contentLengthLong <= 50L*1024*1024) { "Package is too large." }
        val data = request.inputStream.use { input ->
          val output = java.io.ByteArrayOutputStream(); val buffer = ByteArray(32768)
          while (true) { val count = input.read(buffer); if (count < 0) break; require(output.size()+count <= 50*1024*1024) { "Package is too large." }; output.write(buffer,0,count) }
          output.toByteArray()
        }
        Base64.encodeToString(data, Base64.NO_WRAP)
      } finally { request.disconnect() }
    }
    AsyncFunction("disconnect") { release() }
    OnDestroy { release() }
  }
  private fun release() { callback?.let { try { manager.unregisterNetworkCallback(it) } catch (_: Exception) {} }; callback = null; connection = null }
}
