import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Alert,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import * as Location from 'expo-location';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import Network from './modules/waypoint-network';
import profile from './assets/building-profile.json';
import { viewerRevision } from './assets/version';
import { demoPackages } from './assets/demo-packages';
import { tokenize, meanPool } from '../src/tokenizer';
import { interpretNavigation, cancelChat, releaseChat, prepareChatModel } from './chat';

type PendingScan = { resolve: (value: string) => void; reject: (error: Error) => void };
let aiSession: Promise<InferenceSession> | undefined;
let vocabulary: Promise<string[]> | undefined;
function buildingId(payload: { buildingId?: unknown }) {
  const id = payload?.buildingId;
  if (typeof id !== 'string' || !profile.buildingIds.includes(id))
    throw new Error('This app does not trust that building.');
  return id;
}
const packageFile = (id: string) => new File(Paths.document, id + '.zip');
async function assetUri(module: number) {
  const asset = Asset.fromModule(module);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error('A bundled asset is missing. Rebuild the installed app.');
  return asset.localUri;
}
async function embed(text: string) {
  aiSession ??= assetUri(require('./assets/model.onnx')).then((uri) =>
    InferenceSession.create(uri, { executionProviders: ['cpu'] }),
  );
  vocabulary ??= assetUri(require('./assets/vocab.txt'))
    .then((uri) => new File(uri).text())
    .then((text) => text.split('\n'));
  const session = await aiSession;
  const tokens = tokenize(text, await vocabulary);
  const feeds: Record<string, Tensor> = {};
  for (const key of session.inputNames)
    feeds[key] = new Tensor(
      'int64',
      tokens[key as 'input_ids' | 'attention_mask' | 'token_type_ids'],
      [1, tokens.length],
    );
  const output = await session.run(feeds);
  return meanPool(output[session.outputNames[0]].data as Float32Array, tokens.attention_mask);
}
function WaypointApp() {
  const webview = useRef<WebView>(null);
  const [html, setHtml] = useState<string>();
  const [startupError, setStartupError] = useState<string>();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const pendingScan = useRef<PendingScan | undefined>(undefined);
  const scanLock = useRef(false);
  const busy = useRef(new Set<string>());
  useEffect(() => {
    const background = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void releaseChat();
    });
    const memoryWarning = AppState.addEventListener('memoryWarning', () => void releaseChat());
    assetUri(require('./assets/viewer.html'))
      .then((uri) => new File(uri).text())
      .then((text) => {
        setHtml(text);
        // Stage the bundled interpreter weights while the visitor explores the map. This only
        // resolves the file; the model itself loads lazily on the first chat request.
        void prepareChatModel().catch((error: Error) =>
          console.info('Waypoint chat model not staged:', error.message),
        );
      })
      .catch((e) => setStartupError(e.message));
    return () => {
      background.remove();
      memoryWarning.remove();
      void releaseChat();
      pendingScan.current?.reject(new Error('Scanner closed.'));
      void Network.disconnect();
    };
  }, []);
  async function scan() {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) throw new Error('Camera permission is needed to scan a checkpoint.');
    }
    scanLock.current = false;
    setScanning(true);
    return new Promise<string>((resolve, reject) => {
      pendingScan.current = { resolve, reject };
    });
  }
  function closeScanner() {
    setScanning(false);
    pendingScan.current?.reject(new Error('Scanning cancelled.'));
    pendingScan.current = undefined;
  }
  async function wifiPermission() {
    if (Platform.OS === 'android') {
      if (Number(Platform.Version) >= 33) {
        const permission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES,
        );
        if (permission !== PermissionsAndroid.RESULTS.GRANTED)
          throw new Error('Allow nearby Wi-Fi access to join the building network.');
      } else {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted)
          throw new Error('Android needs location permission to connect to Wi-Fi on this version.');
      }
    }
  }
  function respond(id: number, value?: unknown, error?: string) {
    const payload = JSON.stringify({ id, value, error }).replace(/</g, '\\u003c');
    webview.current?.injectJavaScript(
      `window.dispatchEvent(new CustomEvent('native-response',{detail:${payload}}));true;`,
    );
  }
  async function handleMessage(event: WebViewMessageEvent) {
    let message;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    const { id, type, payload } = message;
    if (!Number.isInteger(id) || typeof type !== 'string') return;
    if (busy.current.has(type)) {
      respond(id, undefined, 'This operation is already running.');
      return;
    }
    busy.current.add(type);
    try {
      let value: unknown;
      if (type === 'scan') value = await scan();
      else if (type === 'chat') value = await interpretNavigation(payload);
      else if (type === 'chatCancel') {
        await cancelChat();
        value = { cancelled: true };
      } else if (type === 'embed') {
        if (typeof payload.text !== 'string') throw new Error('Invalid destination query.');
        value = await embed(payload.text.slice(0, 500));
      } else if (type === 'loadPackage') {
        const id = buildingId(payload);
        const file = packageFile(id);
        const backup = new File(Paths.document, id + '.previous.zip');
        if (!file.exists && backup.exists) backup.move(file);
        const bundled = demoPackages[id];
        value = {
          archive: file.exists
            ? await file.base64()
            : bundled
              ? await new File(await assetUri(bundled)).base64()
              : undefined,
        };
      } else if (type === 'savePackage') {
        const id = buildingId(payload);
        if (typeof payload.archive !== 'string' || payload.archive.length > 70 * 1024 * 1024)
          throw new Error('Invalid building archive.');
        const destination = packageFile(id);
        const temporary = new File(Paths.document, id + '.pending.zip');
        temporary.write(Uint8Array.from(atob(payload.archive), (c) => c.charCodeAt(0)));
        const backup = new File(Paths.document, id + '.previous.zip');
        if (backup.exists) backup.delete();
        if (destination.exists) destination.move(backup);
        try {
          temporary.move(destination);
          if (backup.exists) backup.delete();
        } catch (e) {
          if (backup.exists && !destination.exists) backup.move(destination);
          throw e;
        }
        value = { saved: true };
        void Network.disconnect();
      } else if (type === 'removePackage') {
        const id = buildingId(payload);
        const file = packageFile(id);
        if (file.exists) file.delete();
        for (const suffix of ['.previous.zip', '.pending.zip']) {
          const copy = new File(Paths.document, id + suffix);
          if (copy.exists) copy.delete();
        }
        value = { removed: true };
      } else if (type === 'download') {
        const checkpoint = payload.checkpoint;
        if (!profile.buildingIds.includes(checkpoint?.building))
          throw new Error('This app does not trust that building.');
        if (
          checkpoint.wifi &&
          (checkpoint.wifi.ssid !== profile.ssid || checkpoint.wifi.password !== profile.password)
        )
          throw new Error('Entrance QR Wi-Fi details do not match this building profile.');
        await wifiPermission();
        try {
          await Network.join(profile.ssid, profile.password);
        } catch (error) {
          const proceed = await new Promise<boolean>((resolve) =>
            Alert.alert(
              'Join building Wi-Fi',
              'If you have already joined ' +
                profile.ssid +
                ' in Settings, continue to try the trusted local server.',
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Already connected', onPress: () => resolve(true) },
              ],
              { cancelable: false },
            ),
          );
          if (!proceed) throw error;
        }
        const certificate = new File(
          await assetUri(require('./assets/server-cert.pem')),
        ).textSync();
        const manifestBase64 = await Network.download(
          `${profile.server}/buildings/${checkpoint.building}/manifest`,
          certificate,
        );
        const manifest = JSON.parse(
          new TextDecoder().decode(Uint8Array.from(atob(manifestBase64), (c) => c.charCodeAt(0))),
        );
        if (
          manifest.buildingId !== checkpoint.building ||
          typeof manifest.version !== 'string' ||
          !/^\d+\.\d+\.\d+$/.test(manifest.version)
        )
          throw new Error('Invalid building manifest.');
        value = {
          archive: await Network.download(
            `${profile.server}/buildings/${checkpoint.building}/packages/${manifest.version}.zip`,
            certificate,
          ),
        };
      } else throw new Error('Unsupported app operation.');
      respond(id, value);
    } catch (e) {
      respond(id, undefined, (e as Error).message);
    } finally {
      busy.current.delete(type);
    }
  }
  if (!html)
    return (
      <View style={styles.loading}>
        {startupError ? (
          <Text style={styles.error}>{startupError}</Text>
        ) : (
          <>
            <ActivityIndicator color="#111111" />
            <Text style={styles.loadingText}>Opening Waypoint…</Text>
          </>
        )}
      </View>
    );
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <WebView
        ref={webview}
        style={styles.webview}
        source={{ html, baseUrl: `https://waypoint.invalid/${viewerRevision}/` }}
        originWhitelist={['https://waypoint.invalid']}
        androidLayerType="hardware"
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess={false}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={(request) =>
          request.url === 'about:blank' || request.url.startsWith('https://waypoint.invalid/')
        }
        setSupportMultipleWindows={false}
        bounces={false}
        scrollEnabled={false}
        mixedContentMode="never"
      />
      <Modal visible={scanning} animationType="slide" onRequestClose={closeScanner}>
        <SafeAreaView style={styles.scanner}>
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>Scan your checkpoint</Text>
            <Pressable onPress={closeScanner}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          <Text style={styles.scannerHint}>Point the camera at an entrance or corridor QR.</Text>
          <View style={styles.cameraBox}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                if (scanLock.current || !pendingScan.current) return;
                scanLock.current = true;
                pendingScan.current.resolve(data);
                pendingScan.current = undefined;
                setScanning(false);
              }}
            />
            <View style={styles.frame} />
          </View>
          <Text style={styles.scannerHint}>
            Your location updates only when you scan a checkpoint.
          </Text>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <WaypointApp />
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  webview: { flex: 1, backgroundColor: '#ffffff' },
  loading: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 25,
  },
  loadingText: { marginTop: 15, color: '#111111' },
  error: { color: '#111111', textAlign: 'center' },
  scanner: { flex: 1, backgroundColor: '#111111', padding: 22 },
  scannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
  },
  scannerTitle: { fontSize: 23, fontWeight: '500', color: '#ffffff' },
  close: { color: '#ffffff', padding: 10 },
  scannerHint: { color: '#cccccc', fontSize: 13, lineHeight: 21, marginVertical: 22 },
  cameraBox: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: { width: 230, height: 230, borderWidth: 2, borderColor: '#ffffff', borderRadius: 15 },
});
