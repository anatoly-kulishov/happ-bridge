/**
 * Optimization scorecard for Happ Bridge.
 * Run: npx tsx scripts/metrics.ts   (after npm run build)
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

type Row = { path: string; raw: number; gz: number }

function gzipSize(file: string): number {
  return execFileSync('gzip', ['-c', file]).length
}

function listBuilt(): Row[] {
  const rows: Row[] = []
  for (const dir of ['dist/assets', 'dist-electron']) {
    const abs = path.join(root, dir)
    if (!fs.existsSync(abs)) continue
    for (const name of fs.readdirSync(abs)) {
      if (!/\.(js|css|html)$/.test(name)) continue
      const p = path.join(abs, name)
      rows.push({ path: path.relative(root, p), raw: fs.statSync(p).size, gz: gzipSize(p) })
    }
  }
  return rows.sort((a, b) => b.raw - a.raw)
}

function loc(dir: string): { files: number; lines: number } {
  let files = 0
  let lines = 0
  const walk = (d: string) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name)
      const st = fs.statSync(p)
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === 'dist' || name === 'dist-electron') continue
        walk(p)
        continue
      }
      if (!/\.(ts|tsx|css)$/.test(name)) continue
      files += 1
      lines += fs.readFileSync(p, 'utf8').split('\n').length
    }
  }
  walk(path.join(root, dir))
  return { files, lines }
}

function pkgDeps(): { runtime: string[]; hasLucide: boolean } {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  const runtime = Object.keys(pkg.dependencies ?? {})
  return { runtime, hasLucide: runtime.includes('lucide-react') }
}

/** 0–100: higher = leaner for a menu-bar Electron utility. */
function score(opts: {
  initialJsGz: number
  cssGz: number
  mainGz: number
  hasLucide: boolean
  runtimeDeps: number
  lazyChunks: number
}): { total: number; parts: Record<string, number> } {
  // Targets for a dark Preact utility panel (hand CSS, no Tailwind/lucide).
  const jsScore = clamp(100 - (opts.initialJsGz - 40_000) / 800, 0, 100)
  const cssScore = clamp(100 - (opts.cssGz - 3_000) / 80, 0, 100)
  const mainScore = clamp(100 - (opts.mainGz - 15_000) / 200, 0, 100)
  const depScore = opts.hasLucide ? 40 : clamp(100 - (opts.runtimeDeps - 2) * 15, 50, 100)
  const splitScore = opts.lazyChunks >= 2 ? 90 : opts.lazyChunks === 1 ? 70 : 40

  const parts = {
    initialJsGzip: Math.round(jsScore),
    cssGzip: Math.round(cssScore),
    mainGzip: Math.round(mainScore),
    dependencies: Math.round(depScore),
    codeSplit: Math.round(splitScore),
  }
  const total = Math.round(
    parts.initialJsGzip * 0.35 +
      parts.cssGzip * 0.2 +
      parts.mainGzip * 0.2 +
      parts.dependencies * 0.15 +
      parts.codeSplit * 0.1,
  )
  return { total, parts }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Resolve packaged .app under release/ (any arch folder). */
function findPackagedApp(): string | null {
  const release = path.join(root, 'release')
  if (!fs.existsSync(release)) return null
  const preferred = path.join(release, 'mac-arm64', 'Happ Bridge.app')
  if (fs.existsSync(preferred)) return preferred
  for (const name of fs.readdirSync(release)) {
    const candidate = path.join(release, name, 'Happ Bridge.app')
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

/** Disk footprint of the packaged .app (not part of score — separate from JS/CSS). */
function appBundleMetrics(): {
  built: boolean
  appPath?: string
  appBytes?: number
  asarBytes?: number
  lprojCount?: number
} {
  const appPath = findPackagedApp()
  if (!appPath) return { built: false }

  const appBytes = Number(
    execFileSync('du', ['-sk', appPath], { encoding: 'utf8' }).trim().split(/\s+/)[0],
  ) * 1024

  const asarPath = path.join(appPath, 'Contents', 'Resources', 'app.asar')
  const asarBytes = fs.existsSync(asarPath) ? fs.statSync(asarPath).size : undefined

  // Count unique realpaths so framework Resources symlinks are not double-counted.
  const found = execFileSync('find', [appPath, '-name', '*.lproj'], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
  const unique = new Set(found.map((p) => {
    try {
      return fs.realpathSync(p)
    } catch {
      return p
    }
  }))
  const lprojCount = unique.size

  return { built: true, appPath: path.relative(root, appPath), appBytes, asarBytes, lprojCount }
}

function main(): void {
  const distJs = path.join(root, 'dist/assets')
  if (!fs.existsSync(distJs)) {
    console.error('No dist/ — run: npm run build')
    process.exit(1)
  }

  const rows = listBuilt()
  const initialJs = rows.find((r) => /index-.*\.js$/.test(r.path) && r.path.includes('assets'))
  const css = rows.find((r) => r.path.endsWith('.css'))
  // vite-plugin-electron may emit main.js stub that require()'s main-HASH.js.
  let mainJs = rows.find((r) => r.path.endsWith(`${path.sep}dist-electron${path.sep}main.js`))
  const stubPath = path.join(root, 'dist-electron', 'main.js')
  if (fs.existsSync(stubPath)) {
    const stub = fs.readFileSync(stubPath, 'utf8')
    const m = stub.match(/require\(["']\.\/(main-[^"']+\.js)["']\)/)
    if (m) {
      const chunk = rows.find((r) => r.path.endsWith(m[1]))
      if (chunk) mainJs = chunk
    }
  }
  const lazy = rows.filter(
    (r) => r.path.includes(`${path.sep}assets${path.sep}`) && r.path.endsWith('.js') && !r.path.includes(`${path.sep}index-`),
  )

  const deps = pkgDeps()
  const src = loc('src')
  const electron = loc('electron')

  const sc = score({
    initialJsGz: initialJs?.gz ?? 999_999,
    cssGz: css?.gz ?? 999_999,
    mainGz: mainJs?.gz ?? 999_999,
    hasLucide: deps.hasLucide,
    runtimeDeps: deps.runtime.length,
    lazyChunks: lazy.length,
  })

  console.log('Happ Bridge — optimization metrics\n')
  console.log('Bundle')
  for (const r of rows) {
    console.log(
      `  ${String(r.raw).padStart(8)} raw  ${String(r.gz).padStart(7)} gz  ${r.path}`,
    )
  }
  console.log(
    `  initial JS gzip: ${initialJs?.gz ?? '?'}  |  CSS gzip: ${css?.gz ?? '?'}  |  main gzip: ${mainJs?.gz ?? '?'}`,
  )
  console.log(`  lazy chunks: ${lazy.map((r) => path.basename(r.path)).join(', ') || '(none)'}`)

  console.log('\nSource')
  console.log(`  src:      ${src.lines} lines / ${src.files} files`)
  console.log(`  electron: ${electron.lines} lines / ${electron.files} files`)
  console.log(`  runtime deps: ${deps.runtime.join(', ') || '(none)'}`)

  const appBundle = appBundleMetrics()
  console.log('\nApp bundle')
  if (!appBundle.built) {
    console.log('  not built — run: npm run dist (or electron-builder --mac)')
  } else {
    console.log(`  .app:   ${formatBytes(appBundle.appBytes ?? 0)}  (${appBundle.appPath})`)
    console.log(
      `  asar:   ${appBundle.asarBytes != null ? formatBytes(appBundle.asarBytes) : 'missing'}`,
    )
    console.log(`  lproj:  ${appBundle.lprojCount}`)
  }

  console.log('\nScore (0–100, higher = leaner)')
  for (const [k, v] of Object.entries(sc.parts)) {
    console.log(`  ${k.padEnd(16)} ${v}`)
  }
  console.log(`  TOTAL            ${sc.total}`)

  console.log('\nHotspots / next cuts')
  const tips: string[] = []
  if ((initialJs?.gz ?? 0) > 40_000) {
    tips.push('Initial JS still heavy — next tier is no virtual DOM (vanilla).')
  } else if ((initialJs?.gz ?? 0) > 20_000) {
    tips.push('Initial JS OK with Preact; further cuts need fewer UI strings/icons.')
  }
  if ((css?.gz ?? 0) > 5_000) {
    tips.push('CSS >5KB gz — collapse remaining utilities into semantic tokens (.badge, .btn-*, .surface).')
  }
  if (deps.hasLucide) tips.push('lucide-react still in dependencies — remove it.')
  if (lazy.length < 2) tips.push('Add lazy routes/panels so cold UI stays smaller.')
  if ((mainJs?.gz ?? 0) > 25_000) {
    tips.push('Electron main >25KB gz — session/inject/discover dominate; keep rarely-used IPC lazy.')
  }
  if (appBundle.built && (appBundle.lprojCount ?? 0) > 10) {
    tips.push(`Packaged .app still has ${appBundle.lprojCount} *.lproj — check afterPack / electronLanguages.`)
  }
  tips.push(
    'Already: Preact, hand CSS + semantic badges, lazy Wizard/Inject/diagnostics, locale prune, heap cap, deferred updater, log.debug in packaged builds.',
  )
  for (const t of tips) console.log(`  - ${t}`)

  // Machine-readable for CI / agents
  const out = {
    score: sc.total,
    parts: sc.parts,
    bundle: rows,
    deps: deps.runtime,
    loc: { src, electron },
    appBundle,
  }
  const outPath = path.join(root, 'dist/metrics.json')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`)
  console.log(`\nWrote ${path.relative(root, outPath)}`)
}

main()
