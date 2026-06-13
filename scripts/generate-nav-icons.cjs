/**
 * One-off: generate line-style nav icon PNGs for assets/nav/
 * Run: node scripts/generate-nav-icons.cjs
 */
const fs = require('fs')
const path = require('path')

let sharp
try {
  sharp = require(path.join(__dirname, '../backend/node_modules/sharp'))
} catch (e) {
  console.error('Run from repo root after backend npm install (needs sharp).')
  process.exit(1)
}

const OUT_DIR = path.join(__dirname, '../assets/nav')
const SIZE = 81
const STROKE = '#4e5969'

const ICONS = {
  album: `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 81 81" fill="none">
    <rect x="18" y="22" width="45" height="38" rx="4" stroke="${STROKE}" stroke-width="3"/>
    <path d="M28 22V18a4 4 0 0 1 4-4h17a4 4 0 0 1 4 4v4" stroke="${STROKE}" stroke-width="3"/>
    <circle cx="40.5" cy="41" r="6" stroke="${STROKE}" stroke-width="3"/>
  </svg>`,
  authorize: `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 81 81" fill="none">
    <path d="M40.5 14L18 24v18c0 14 10 26.5 22.5 31 12.5-4.5 22.5-17 22.5-31V24L40.5 14z" stroke="${STROKE}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M32 41l6 6 12-14" stroke="${STROKE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  message: `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 81 81" fill="none">
    <path d="M40.5 16c-12 0-22 8-22 18 0 6 3.5 11.5 9 15v9l10-5.5c1 .1 2 .2 3 .2 12 0 22-8 22-18s-10-18-22-18z" stroke="${STROKE}" stroke-width="3" stroke-linejoin="round"/>
  </svg>`,
  vehicle: `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 81 81" fill="none">
    <path d="M18 44h45l-4-14H22l-4 14z" stroke="${STROKE}" stroke-width="3" stroke-linejoin="round"/>
    <rect x="14" y="44" width="53" height="14" rx="3" stroke="${STROKE}" stroke-width="3"/>
    <circle cx="26" cy="58" r="5" stroke="${STROKE}" stroke-width="3"/>
    <circle cx="55" cy="58" r="5" stroke="${STROKE}" stroke-width="3"/>
  </svg>`,
  settings: `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 81 81" fill="none">
    <circle cx="40.5" cy="40.5" r="10" stroke="${STROKE}" stroke-width="3"/>
    <path d="M40.5 14v8M40.5 59v8M14 40.5h8M59 40.5h8M22 22l5.5 5.5M53.5 53.5L59 59M22 59l5.5-5.5M53.5 27.5L59 22" stroke="${STROKE}" stroke-width="3" stroke-linecap="round"/>
  </svg>`,
  help: `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 81 81" fill="none">
    <circle cx="40.5" cy="40.5" r="24" stroke="${STROKE}" stroke-width="3"/>
    <path d="M34 34c0-4 3-7 7-7s7 3 7 7c0 5-7 5-7 12" stroke="${STROKE}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="40.5" cy="56" r="2.5" fill="${STROKE}"/>
  </svg>`,
  support: `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 81 81" fill="none">
    <path d="M24 36v-4a16 16 0 0 1 32 0v4" stroke="${STROKE}" stroke-width="3"/>
    <rect x="18" y="36" width="10" height="18" rx="3" stroke="${STROKE}" stroke-width="3"/>
    <rect x="53" y="36" width="10" height="18" rx="3" stroke="${STROKE}" stroke-width="3"/>
    <path d="M28 54c0 8 6 14 12.5 14S53 62 53 54" stroke="${STROKE}" stroke-width="3" stroke-linecap="round"/>
  </svg>`,
  merchant: `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 81 81" fill="none">
    <path d="M16 32l8-14h33l8 14" stroke="${STROKE}" stroke-width="3" stroke-linejoin="round"/>
    <rect x="20" y="32" width="41" height="28" rx="2" stroke="${STROKE}" stroke-width="3"/>
    <path d="M32 60v6h17v-6" stroke="${STROKE}" stroke-width="3"/>
    <rect x="36" y="42" width="9" height="12" stroke="${STROKE}" stroke-width="3"/>
  </svg>`,
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  await Promise.all(
    Object.entries(ICONS).map(async ([name, svg]) => {
      const outPath = path.join(OUT_DIR, `${name}.png`)
      await sharp(Buffer.from(svg)).png().toFile(outPath)
      console.log('wrote', outPath)
    })
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
