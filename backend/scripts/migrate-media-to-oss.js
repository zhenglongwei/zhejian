/**
 * 将本地 MEDIA_STORAGE_DIR 存量文件迁入阿里云 OSS
 *
 * 用法：
 *   node scripts/migrate-media-to-oss.js --dry-run          # 只扫本地，不连 OSS
 *   node scripts/migrate-media-to-oss.js --probe            # 仅测连通性
 *   node scripts/migrate-media-to-oss.js                    # 正式上传
 *   node scripts/migrate-media-to-oss.js --delete-local
 *
 * 若卡住/超时：在 .env 设 OSS_USE_INTERNAL_ENDPOINT=false 改走外网 endpoint 再试。
 */
const fs = require('fs')
const path = require('path')

require('dotenv').config({ path: path.join(__dirname, '../.env') })

const { MEDIA_ROOT } = require('../src/lib/media-storage')
const {
  isOssEnabled,
  objectExists,
  putObject,
  contentTypeForKey,
  headObject,
  probeOssConnectivity,
  activeEndpointHost,
  preferInternal,
  ossConfig,
} = require('../src/lib/oss-client')

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const deleteLocal = args.has('--delete-local')
const probeOnly = args.has('--probe')

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    if (st.isDirectory()) {
      walkFiles(full, out)
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

  const cfg = ossConfig()
  console.log(
    `[migrate-oss] bucket=${cfg.bucket} endpoint=${activeEndpointHost()} internal=${preferInternal()}`,
  )

  if (probeOnly || !dryRun) {
    console.log('[migrate-oss] probing OSS connectivity…')
    try {
      const info = await probeOssConnectivity()
      console.log(`[migrate-oss] probe ok bucket=${info.bucket} endpoint=${info.endpoint}`)
    } catch (e) {
      console.error('[migrate-oss] probe failed:', e && e.message)
      console.error(
        '提示：若使用内网 endpoint 卡住，在 .env 增加 OSS_USE_INTERNAL_ENDPOINT=false 后重试',
      )
      process.exit(1)
    }
    if (probeOnly) return
  }

  if (!fs.existsSync(MEDIA_ROOT)) {
    console.log('本地媒体目录不存在，无需迁移:', MEDIA_ROOT)
    return
  }

  const files = walkFiles(MEDIA_ROOT).filter((f) => {
    const key = toObjectKey(f)
    return key.startsWith('uploads/') && /\.(jpe?g|png|webp)$/i.test(key)
  })

  console.log(
    `[migrate-oss] root=${MEDIA_ROOT} files=${files.length} dryRun=${dryRun} deleteLocal=${deleteLocal}`,
  )

  let uploaded = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < files.length; i += 1) {
    const filePath = files[i]
    const objectKey = toObjectKey(filePath)
    const localSize = fs.statSync(filePath).size
    const progress = `[${i + 1}/${files.length}]`

    if (dryRun) {
      console.log(`${progress} [dry-run] would upload ${objectKey} (${localSize} bytes)`)
      uploaded += 1
      continue
    }

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
        if (e && e.code === 'OSS_TIMEOUT') throw e
        exists = false
      }

      if (exists && remoteSize === localSize) {
        skipped += 1
        if (i === 0 || (i + 1) % 25 === 0 || i + 1 === files.length) {
          console.log(`${progress} skip ${objectKey}`)
        }
        if (deleteLocal) {
          fs.unlinkSync(filePath)
        }
        continue
      }

      const buf = fs.readFileSync(filePath)
      await putObject(objectKey, buf, { contentType: contentTypeForKey(objectKey) })
      uploaded += 1
      console.log(`${progress} [ok] ${objectKey}`)
      if (deleteLocal) {
        fs.unlinkSync(filePath)
      }
    } catch (e) {
      failed += 1
      console.error(`${progress} [fail] ${objectKey}`, e && e.message)
      if (e && e.code === 'OSS_TIMEOUT') {
        console.error('连续超时，中止。请检查网络 / OSS_USE_INTERNAL_ENDPOINT')
        break
      }
    }
  }

  console.log(`[migrate-oss] done uploaded=${uploaded} skipped=${skipped} failed=${failed}`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
