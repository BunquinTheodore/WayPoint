const { withMainApplication, withXcodeProject } = require('@expo/config-plugins');
function fixIosScripts(project) {
  for (const phase of Object.values(project.hash.project.objects.PBXShellScriptBuildPhase)) {
    if (typeof phase !== 'object' || !phase.shellScript) continue;
    let script = JSON.parse(phase.shellScript);
    script = script.replace(/^`("\$NODE_BINARY" --print .+)`$/m, (_, command) => `"$(${command})"`);
    phase.shellScript = JSON.stringify(script);
  }
  return project;
}
module.exports = (config) => {
  config = withMainApplication(config, (result) => {
    const line = 'add(ai.onnxruntime.reactnative.OnnxruntimePackage())';
    if (!result.modResults.contents.includes(line)) {
      result.modResults.contents = result.modResults.contents.replace(
        'PackageList(this).packages.apply {',
        `PackageList(this).packages.apply {\n          ${line}`,
      );
    }
    return result;
  });
  return withXcodeProject(config, (result) => {
    fixIosScripts(result.modResults);
    return result;
  });
};
module.exports.fixIosScripts = fixIosScripts;
