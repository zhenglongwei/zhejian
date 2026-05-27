/**
 * SVG → PNG（@2x），Windows/macOS/Linux 均可用，不依赖 Cairo。
 * 用法（在 scripts 目录）：
 *   npm install
 *   node export-home-entry-icons.mjs
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Resvg } from '@resvg/resvg-js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(SCRIPT_DIR, '..')
const SRC_DIR = join(ROOT, 'assets', 'home', 'entries-src')
const OUT_DIR = join(ROOT, 'assets', 'home', 'entries')
const SIZE = 96 * 2

mkdirSync(OUT_DIR, { recursive: true })

const svgs = readdirSync(SRC_DIR)
  .filter((name) => name.startsWith('entry_') && name.endsWith('.svg'))
  .sort()

if (!svgs.length) {
  console.error(`未找到 SVG：${SRC_DIR}`)
  process.exit(1)
}

for (const name of svgs) {
  const svg = readFileSync(join(SRC_DIR, name), 'utf8')
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: SIZE },
    background: 'transparent',
  })
  const pngName = name.replace(/\.svg$/i, '.png')
  writeFileSync(join(OUT_DIR, pngName), resvg.render().asPng())
  console.log(`[ok] ${pngName}`)
}

console.log(`[export-home-entry-icons] ${svgs.length} icons -> ${OUT_DIR}`)
