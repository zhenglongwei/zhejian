/**
 * B-MEDIA：本地临时图 → 服务端持久 URL
 * OSS 开启时：upload-token → PostObject 直传 → upload-complete
 * 否则：wx.uploadFile 到 POST /media/upload
 */
const { ENV } = require('../services/config')
const { normalizePublicMediaUrl } = require('./desensitize-url')

function isPersistedRemoteUrl(url) {
  if (!url || typeof url !== 'string') return false
  const value = url.trim()
  if (!value) return false
  if (value.startsWith('https://')) return true
  if (value.includes('/api/v1/media/files/uploads/')) return true
  if (value.startsWith('/api/v1/media/files/')) return true
  if (value.includes('/media/files/uploads/')) return true
  const base = String(ENV.baseUrl || '').replace(/\/$/, '')
  if (base && value.startsWith(`${base}/api/v1/media/files/`)) return true
  return false
}

function isLocalTempImagePath(url) {
  if (!url || typeof url !== 'string') return false
  const value = url.trim()
  if (!value || value.startsWith('mock://')) return false
  if (isPersistedRemoteUrl(value)) return false
  if (value.startsWith('/media/uploads/')) return false
  if (value.startsWith('wxfile://')) return true
  if (value.includes('://tmp/')) return true
  if (value.includes('/__tmp__/')) return true
  if (value.startsWith('http://usr/')) return true
  if (value.startsWith('http://127.0.0.1')) return true
  if (value.startsWith('http://localhost')) return true
  if (value.startsWith('http://') && !value.includes('/media/uploads/')) return true
  return false
}

function normalizeStoredImageUrl(url) {
  if (typeof url !== 'string') return url
  const value = url.trim()
  if (!value) return value
  return normalizePublicMediaUrl(value)
}

function canAccessLocalFile(filePath) {
  return new Promise((resolve) => {
    if (!filePath) {
      resolve(false)
      return
    }
    try {
      wx.getFileSystemManager().access({
        path: filePath,
        success: () => resolve(true),
        fail: () => resolve(false),
      })
    } catch (e) {
      resolve(false)
    }
  })
}

function authHeaders() {
  const token = wx.getStorageSync('token') || ''
  return {
    Authorization: token ? `Bearer ${token}` : '',
    'X-Client-Type': ENV.clientType,
    'X-App-Version': ENV.appVersion,
  }
}

function requestJson(method, path, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${ENV.baseUrl}/api/${ENV.apiVersion}${path}`,
      method,
      data: data || {},
      header: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      success(res) {
        const body = res.data || {}
        if (res.statusCode === 401) {
          reject({ code: 401, message: body.message || '请先登录' })
          return
        }
        if (res.statusCode >= 400 || (body.code !== 0 && body.code !== undefined)) {
          reject({ code: body.code || res.statusCode, message: body.message || '请求失败' })
          return
        }
        resolve(body.data || {})
      },
      fail(err) {
        reject({
          code: 'NETWORK_ERROR',
          message: '网络异常，请稍后重试',
          detail: err,
        })
      },
    })
  })
}

function guessFileName(tempFilePath) {
  const raw = String(tempFilePath || '')
  const m = raw.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
  const ext = m ? `.${m[1].toLowerCase()}` : '.jpg'
  const safe = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg'
  return `upload${safe}`
}

function postObjectToOss(tempFilePath, token) {
  return new Promise((resolve, reject) => {
    const formData = {
      key: token.key || token.objectKey,
      policy: token.policy,
      OSSAccessKeyId: token.OSSAccessKeyId,
      signature: token.signature,
      success_action_status: token.success_action_status || '200',
    }
    if (token.securityToken) {
      formData['x-oss-security-token'] = token.securityToken
    }
    wx.uploadFile({
      url: token.host,
      filePath: tempFilePath,
      name: 'file',
      formData,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true)
          return
        }
        reject({
          code: res.statusCode,
          message: `OSS 上传失败(${res.statusCode})`,
        })
      },
      fail(err) {
        reject({
          code: 'NETWORK_ERROR',
          message: '图片上传失败，请检查网络后重试',
          detail: err,
        })
      },
    })
  })
}

function uploadViaServer(tempFilePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${ENV.baseUrl}/api/${ENV.apiVersion}/media/upload`,
      filePath: tempFilePath,
      name: 'file',
      header: authHeaders(),
      success(res) {
        let body = {}
        try {
          body = JSON.parse(res.data || '{}')
        } catch (e) {
          reject({ message: '上传响应解析失败' })
          return
        }
        if (res.statusCode === 401) {
          reject({ code: 401, message: body.message || '请先登录' })
          return
        }
        if (res.statusCode >= 400 || (body.code !== 0 && body.code !== undefined)) {
          reject({ code: body.code || res.statusCode, message: body.message || '上传失败' })
          return
        }
        const url = (body.data && (body.data.url || body.data.mediaUrl)) || ''
        if (!url) {
          reject({ message: '上传失败：未返回图片地址' })
          return
        }
        resolve(url)
      },
      fail(err) {
        reject({
          code: 'NETWORK_ERROR',
          message: '图片上传失败，请检查网络后重试',
          detail: err,
        })
      },
    })
  })
}

async function uploadViaOss(tempFilePath) {
  const fileName = guessFileName(tempFilePath)
  let token
  try {
    token = await requestJson('POST', '/media/upload-token', {
      fileName,
      fileSize: 0,
    })
  } catch (e) {
    if (e && (e.code === 100001 || e.code === 503 || String(e.message || '').includes('OSS'))) {
      return uploadViaServer(tempFilePath)
    }
    throw e
  }
  await postObjectToOss(tempFilePath, token)
  const done = await requestJson('POST', '/media/upload-complete', {
    objectKey: token.objectKey || token.key,
  })
  const url = done.url || done.mediaUrl || ''
  if (!url) {
    throw { message: '上传失败：未返回图片地址' }
  }
  return url
}

function uploadImage(tempFilePath) {
  if (ENV.mode === 'mock') {
    return Promise.resolve(tempFilePath)
  }
  // 优先 OSS 直传；服务端未开 OSS 时 upload-token 失败再降级 multipart
  return uploadViaOss(tempFilePath).catch((err) => {
    const msg = String((err && err.message) || '')
    if (
      msg.includes('OSS 未开启') ||
      msg.includes('请使用直传') ||
      (err && Number(err.code) === 503)
    ) {
      return uploadViaServer(tempFilePath)
    }
    return Promise.reject(err)
  })
}

/**
 * @returns {{ images: string[], droppedStaleCount: number }}
 */
async function persistLocalImages(urls) {
  const result = []
  let droppedStaleCount = 0

  for (const raw of urls || []) {
    const url =
      typeof raw === 'string'
        ? raw.trim()
        : String((raw && (raw.url || raw.rawUrl || raw.src)) || '').trim()
    if (!url) continue

    if (!isLocalTempImagePath(url)) {
      result.push(normalizeStoredImageUrl(url))
      continue
    }

    const reachable = await canAccessLocalFile(url)
    if (!reachable) {
      droppedStaleCount += 1
      continue
    }

    result.push(await uploadImage(url))
  }

  return { images: result, droppedStaleCount }
}

/**
 * ALB-UX · 过程图保留 caption
 * @returns {{ images: { url: string, caption: string }[], droppedStaleCount: number }}
 */
async function persistLocalImageEntries(entries) {
  const result = []
  let droppedStaleCount = 0

  for (const raw of entries || []) {
    const caption =
      typeof raw === 'object' && raw
        ? String(raw.caption || '').trim().slice(0, 500)
        : ''
    const url =
      typeof raw === 'string'
        ? raw.trim()
        : String((raw && (raw.url || raw.rawUrl || raw.src)) || '').trim()
    if (!url) continue

    if (!isLocalTempImagePath(url)) {
      result.push({ url: normalizeStoredImageUrl(url), caption })
      continue
    }

    const reachable = await canAccessLocalFile(url)
    if (!reachable) {
      droppedStaleCount += 1
      continue
    }

    result.push({ url: await uploadImage(url), caption })
  }

  return { images: result, droppedStaleCount }
}

/**
 * @returns {{ rows: { before: string, after: string }[], droppedStaleCount: number }}
 */
async function persistComparePairRows(rows = []) {
  const next = []
  let droppedStaleCount = 0

  for (const row of rows || []) {
    let before = String((row && row.before) || '').trim()
    let after = String((row && row.after) || '').trim()

    if (before) {
      const persisted = await persistLocalImages([before])
      droppedStaleCount += persisted.droppedStaleCount
      before = persisted.images[0] || ''
    }
    if (after) {
      const persisted = await persistLocalImages([after])
      droppedStaleCount += persisted.droppedStaleCount
      after = persisted.images[0] || ''
    }

    if (before || after) {
      next.push({ before, after })
    }
  }

  return { rows: next, droppedStaleCount }
}

/**
 * @returns {{ nodes: object[], droppedStaleCount: number }}
 */
async function persistAlbumNodeImages(nodes) {
  const next = []
  let droppedStaleCount = 0

  for (const node of nodes || []) {
    let comparePairRows = Array.isArray(node.comparePairRows) ? node.comparePairRows : []
    let images = node.images || []

    if (comparePairRows.length) {
      const persisted = await persistComparePairRows(comparePairRows)
      droppedStaleCount += persisted.droppedStaleCount
      comparePairRows = persisted.rows
      images = comparePairRows
        .map((row) => row.after)
        .filter(Boolean)
        .map((url) => ({ url, caption: '' }))
    } else {
      const persistedImages = await persistLocalImageEntries(images)
      droppedStaleCount += persistedImages.droppedStaleCount
      images = persistedImages.images
    }

    next.push({ ...node, images, comparePairRows })
  }

  return { nodes: next, droppedStaleCount }
}

module.exports = {
  isPersistedRemoteUrl,
  isLocalTempImagePath,
  normalizeStoredImageUrl,
  uploadImage,
  persistLocalImages,
  persistLocalImageEntries,
  persistComparePairRows,
  persistAlbumNodeImages,
}
