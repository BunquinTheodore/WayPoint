// Windows limits native build paths to 260 characters. The autolinked C++ build mirrors each
// dependency's absolute source path under the app's CMake staging directory, so a repository in
// a deep folder (OneDrive, for example) fails the release build with "Filename longer than 260
// characters". Two mitigations: ask CMake to hash object paths beyond 180 characters, and let a
// build set WAYPOINT_CXX_DIR to a short staging directory such as C:\w\cxx. Combine the latter
// with a short drive mapping of the repository (`subst W: <repo>`) when the path is very deep.
const { withAppBuildGradle } = require('@expo/config-plugins');

const OBJECT_PATH = 'externalNativeBuild { cmake { arguments "-DCMAKE_OBJECT_PATH_MAX=180" } }';
const STAGING =
  "externalNativeBuild { cmake { buildStagingDirectory System.getenv('WAYPOINT_CXX_DIR') ? new File(System.getenv('WAYPOINT_CXX_DIR')) : file('.cxx') } }";

module.exports = (config) =>
  withAppBuildGradle(config, (result) => {
    let { contents } = result.modResults;
    if (!contents.includes('CMAKE_OBJECT_PATH_MAX'))
      contents = contents.replace(/(\n(\s*)versionName "[^"]*"\n)/, `$1$2${OBJECT_PATH}\n`);
    if (!contents.includes('WAYPOINT_CXX_DIR'))
      contents = contents.replace(/\nandroid \{\n/, `\nandroid {\n    ${STAGING}\n`);
    result.modResults.contents = contents;
    return result;
  });
