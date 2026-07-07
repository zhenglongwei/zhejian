'use strict'

const path = require('path')
const fs = require('fs')

const VENDOR_ROOT = path.join(__dirname, '../../vendor/shared')
const REPO_ROOT = path.join(__dirname, '../../..')

function resolveShared(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/')
  const vendorPath = path.join(VENDOR_ROOT, normalized)
  const repoPath = path.join(REPO_ROOT, normalized)
  if (fs.existsSync(vendorPath)) return require(vendorPath)
  if (fs.existsSync(repoPath)) return require(repoPath)
  throw new Error(
    `Missing shared module: ${normalized}. Run: cd backend && npm run sync:shared-utils`,
  )
}

module.exports = {
  resolveShared,
}
