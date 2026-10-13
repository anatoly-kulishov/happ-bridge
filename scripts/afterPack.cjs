/** Prune Electron Framework *.lproj — electronLanguages only clears Contents/Resources. */
const fs = require('node:fs')
const path = require('node:path')

/** Chromium always needs Base + English regional variants alongside electronLanguages. */
const ALWAYS_KEEP = ['Base', 'en_GB', 'en_US']

function keepSet(projectDir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'))
  const langs = pkg.build?.electronLanguages ?? pkg.build?.mac?.electronLanguages ?? []
  return new Set([...ALWAYS_KEEP, ...langs])
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const keep = keepSet(context.packager.projectDir)
  const resources = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'Frameworks',
    'Electron Framework.framework',
    'Versions',
    'A',
    'Resources',
  )
  if (!fs.existsSync(resources)) return

  for (const name of fs.readdirSync(resources)) {
    if (!name.endsWith('.lproj')) continue
    const lang = name.slice(0, -'.lproj'.length)
    if (keep.has(lang)) continue
    fs.rmSync(path.join(resources, name), { recursive: true, force: true })
  }
}
