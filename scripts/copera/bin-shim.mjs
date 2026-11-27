#!/usr/bin/env node
// The `copera-code` bin of the generated @copera.ai/code package; scripts/copera/pack-npm.ts copies it to bin/copera-code.mjs.
// The Node.js check below uses only syntax and APIs every Node.js release parses and runs, and comes before the
// first module load, so an unsupported Node.js prints one line instead of a syntax or module error. The range equals
// the package's engines.node (scripts/copera/bin-shim.spec.ts).
var REQUIRED_NODE = '^24.22.3 || >=26.13.1'
var version = process.versions.node.split('.')
var major = Number(version[0])
var minor = Number(version[1])
var patch = Number(version[2])
var supported = major === 24 ? minor > 22 || (minor === 22 && patch >= 3)
  : major === 26 ? minor > 13 || (minor === 13 && patch >= 1)
    : major > 26
if (!supported) {
  process.stderr.write('copera-code: Node.js ' + REQUIRED_NODE + ' is required; this is Node.js ' + process.versions.node + '.\n')
  process.exit(1)
} else {
  Promise.all([import('node:fs'), import('@deepseek-ai/dsh-copera-launch')]).then(function (modules) {
    var manifest = JSON.parse(modules[0].readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    return modules[1].runCoperaCode({ productVersion: manifest.version })
  }).catch(function (error) {
    process.stderr.write(String(error && error.stack ? error.stack : error) + '\n')
    process.exitCode = 1
  })
}
