/**
 * 同步小程序根目录 utils/constants 到 backend/vendor/shared（生产部署用）
 * 运行：cd backend && npm run sync:shared-utils
 */
const fs = require('fs')
const path = require('path')

const BACKEND_ROOT = path.join(__dirname, '..')
const REPO_ROOT = path.join(BACKEND_ROOT, '..')
const VENDOR_ROOT = path.join(BACKEND_ROOT, 'vendor/shared')

const FILES = [
  'constants/part-type.js',
  'constants/album-evidence-guide.js',
  'constants/service-album-stages.js',
  'utils/album-inspection-advice.js',
  'utils/album-inspection-context.js',
  'utils/album-inspection-content-fingerprint.js',
  'utils/album-inspection-view.js',
  'utils/album-inspection-matrix.js',
  'utils/album-inspection-method-guide.js',
  'utils/album-inspection-resolutions.js',
  'utils/album-part-pairs.js',
  'utils/album-compare-pairs.js',
  'utils/album-compare-stage-images.js',
  'utils/album-evidence-items.js',
  'utils/album-summary.js',
  'utils/album-ai-summary.js',
  'utils/desensitize-url.js',
]

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function copyFile(relativePath) {
  const src = path.join(REPO_ROOT, relativePath)
  const dest = path.join(VENDOR_ROOT, relativePath)
  if (!fs.existsSync(src)) {
    throw new Error(`Missing source file: ${src}`)
  }
  ensureDir(path.dirname(dest))
  let content = fs.readFileSync(src, 'utf8')
  if (relativePath === 'utils/desensitize-url.js') {
    content = content.replace(
      "require('../services/config')",
      "require('../services/config-stub')",
    )
  }
  fs.writeFileSync(dest, content, 'utf8')
}

function writeConfigStub() {
  const dest = path.join(VENDOR_ROOT, 'services/config-stub.js')
  ensureDir(path.dirname(dest))
  fs.writeFileSync(
    dest,
    `'use strict'
/** backend vendor stub for shared desensitize-url */
module.exports = {
  ENV: { mode: 'prod', baseUrl: '' },
}
`,
    'utf8',
  )
}

function main() {
  FILES.forEach(copyFile)
  writeConfigStub()
  console.log(`[sync-shared-utils] synced ${FILES.length} files to ${VENDOR_ROOT}`)
}

main()
