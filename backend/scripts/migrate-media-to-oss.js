/**
 * 将本地 MEDIA_STORAGE_DIR 存量文件迁入阿里云 OSS
 *
 * 用法：
 *   node scripts/migrate-media-to-oss.js --dry-run
 *   node scripts/migrate-media-to-oss.js
 *   node scripts/migrate-media-to-oss.js --delete-local
 *
 * 需 OSS_ENABLED=true 且凭证可用。objectKey = 相对 MEDIA_ROOT 的路径（正斜杠）。
 */
const fs = require('fs')
const path = require('path')

require('dotenv').config({ path: path.join(__dirname, '../.env') })

const { MEDIA_ROOT } = require('../src/lib/media-storage')
const { isOssEnabled, objectExists, putObject, contentTypeForKey, headObject } = require('../src/lib/oss-client')

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const deleteLocal = args.has('--delete-local')

function walkFiles(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    if (st.isDirectory()) {
      walkFiles(full, base, out)
    } else if (st.isFile()) {
      out.push(full)
    }
  }
  return out
}

function toObjectKey(filePath) {
  const rel = path.relative(MEDIA_ROOT, filePath).replace(/\\/g, '/')
  return rel.replace(/^\/+/, '')
}

async function main() {
  if (!isOssEnabled()) {
    console.error('请先设置 OSS_ENABLED=true 并配置 Bucket / 凭证')
    process.exit(1)
  }
  if (!fs.existsSync(MEDIA_ROOT)) {
    console.log('本地媒体目录不存在，无需迁移:', MEDIA_ROOT)
    return
  }

  const files = walkFiles(MEDIA_ROOT).filter((f) => {
    const key = toObjectKey(f)
    return key.startsWith('uploads/') && /\.(jpe?g|png|webp)$/i.test(key)
  })

  console.log(`[migrate-oss] root=${MEDIA_ROOT} files=${files.length} dryRun=${dryRun} deleteLocal=${deleteLocal}`)

  let uploaded = 0
  let skipped = 0
  let failed = 0

  for (const filePath of files) {
    const objectKey = toObjectKey(filePath)
    const localSize = fs.statSync(filePath).size
    try {
      let exists = false
      let remoteSize = null
      try {
        exists = await objectExists(objectKey)
        if (exists) {
          const meta = await headObject(objectKey)
          remoteSize = Number(meta.res && meta.res.headers && meta.res.headers['content-length'])
          if (!Number.isFinite(remoteSize) && meta.meta && meta.meta.size) {
            remoteSize = Number(meta.meta.size)
          }
        }
      } catch (e) {
        exists = false
      }

      if (exists && remoteSize === localSize) {
        skipped += 1
        if (deleteLocal && !dryRun) {
          fs.unlinkSync(filePath)
        }
        continue
      }

      if (dryRun) {
        console.log(`[dry-run] would upload ${objectKey} (${localSize} bytes)`)
        uploaded += 1
        continue
      }

      const buf = fs.readFileSync(filePath)
      await putObject(objectKey, buf, { contentType: contentTypeForKey(objectKey) })
      uploaded += 1
      console.log(`[ok] ${objectKey}`)
      if (deleteLocal) {
        fs.unlinkSync(filePath)
      }
    } catch (e) {
      failed += 1
      console.error(`[fail] ${objectKey}`, e && e.message)
    }
  }

  console.log(`[migrate-oss] done uploaded=${uploaded} skipped=${skipped} failed=${failed}`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
