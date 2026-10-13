// ONNX Runtime 1.24.3's React Native package references removed Gradle APIs and
// nightly native artifacts. Keep the native runtime aligned with its JS package.
import { readFile, writeFile } from 'node:fs/promises';
const path = new URL(
  '../node_modules/onnxruntime-react-native/android/build.gradle',
  import.meta.url,
);
let source = await readFile(path, 'utf8');
source = source.replace(
  'VersionNumber.parse(REACT_NATIVE_VERSION) < VersionNumber.parse("0.71")',
  'REACT_NATIVE_MINOR_VERSION < 71',
);
source = source.replaceAll(
  'onnxruntime-android:latest.integration@aar',
  'onnxruntime-android:1.24.3@aar',
);
await writeFile(path, source);
const androidModule = new URL(
  '../node_modules/onnxruntime-react-native/android/src/main/java/ai/onnxruntime/reactnative/OnnxruntimeModule.java',
  import.meta.url,
);
await writeFile(
  androidModule,
  (await readFile(androidModule, 'utf8')).replace(
    'getReactApplicationContext().getCatalystInstance().getJSCallInvokerHolder()',
    'getReactApplicationContext().getJSCallInvokerHolder()',
  ),
);
const podspec = new URL(
  '../node_modules/onnxruntime-react-native/onnxruntime-react-native.podspec',
  import.meta.url,
);
await writeFile(
  podspec,
  (await readFile(podspec, 'utf8')).replace(
    'spec.dependency "onnxruntime-c"',
    'spec.dependency "onnxruntime-c", "1.24.3"',
  ),
);
const iosModule = new URL(
  '../node_modules/onnxruntime-react-native/ios/OnnxruntimeModule.mm',
  import.meta.url,
);
let ios = await readFile(iosModule, 'utf8');
if (!ios.includes('installJSIBindingsWithRuntime:')) {
  ios = ios.replace(
    '@implementation OnnxruntimeModule',
    '#import <ReactCommon/RCTTurboModuleWithJSIBindings.h>\n\n@interface OnnxruntimeModule () <RCTTurboModuleWithJSIBindings>\n@end\n\n@implementation OnnxruntimeModule',
  );
  ios = ios.replace(
    'RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(install) {',
    '- (void)installJSIBindingsWithRuntime:(facebook::jsi::Runtime &)runtime callInvoker:(const std::shared_ptr<facebook::react::CallInvoker> &)callInvoker {\n  env = onnxruntimejsi::install(runtime, callInvoker);\n}\n\nRCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(install) {\n  if (env) return @true;',
  );
  await writeFile(iosModule, ios);
}
ios = await readFile(iosModule, 'utf8');
if (!ios.includes('getTurboModule:')) {
  ios = ios.replace(
    '#import <ReactCommon/RCTTurboModuleWithJSIBindings.h>',
    '#import <ReactCommon/RCTTurboModuleWithJSIBindings.h>\n#import <ReactCommon/RCTInteropTurboModule.h>',
  );
  ios = ios.replace(
    '() <RCTTurboModuleWithJSIBindings>',
    '() <RCTTurboModuleWithJSIBindings, RCTTurboModule>',
  );
  ios = ios.replace(
    '- (void)installJSIBindingsWithRuntime:',
    '- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {\n  return std::make_shared<facebook::react::ObjCInteropTurboModule>(params);\n}\n\n- (void)installJSIBindingsWithRuntime:',
  );
  await writeFile(iosModule, ios);
}
// Expo Constants invokes a path through bash -c without quoting that path.
// Invoke the same script directly so project folders with spaces remain supported.
const constantsSpec = new URL(
  '../node_modules/expo-constants/ios/EXConstants.podspec',
  import.meta.url,
);
let constants = await readFile(constantsSpec, 'utf8');
constants = constants.replace(
  /    :script => .*get-app-config-ios\.sh.*\n/,
  '    :script => "#{env_vars}bash -l \\\"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\\"",\n',
);
await writeFile(constantsSpec, constants);
const configScript = new URL(
  '../node_modules/expo-constants/scripts/get-app-config-ios.sh',
  import.meta.url,
);
await writeFile(
  configScript,
  (await readFile(configScript, 'utf8')).replace(
    'basename $PROJECT_DIR',
    'basename "$PROJECT_DIR"',
  ),
);
console.log('Applied reproducible native compatibility fixes.');
