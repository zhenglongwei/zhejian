/**
 * B-MEDIA：本地临时图 → 服务端持久 URL
 */
const { ENV } = require('../services/config')
const { normalizePublicMediaUrl } = require('./desensitize-url')

function isPersistedRemoteUrl(url) {
  if (!url || typeof url !== 'string') return false
  const value = url.trim()
  if (!value) return false
  if (value.startsWith('https://')) return true
  if (value.startsWith('/api/v1/media/files/')) return true
  if (value.includes('/media/files/uploads/')) return true
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

function uploadImage(tempFilePath) {
  if (ENV.mode === 'mock') {
    return Promise.resolve(tempFilePath)
  }
  const token = wx.getStorageSync('token') || ''
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${ENV.baseUrl}/api/${ENV.apiVersion}/media/upload`,
      filePath: tempFilePath,
      name: 'file',
      header: {
        Authorization: token ? `Bearer ${token}` : '',
        'X-Client-Type': ENV.clientType,
        'X-App-Version': ENV.appVersion,
      },
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

/**
 * @returns {{ images: string[], droppedStaleCount: number }}
 */
async function persistLocalImages(urls) {
  const result = []
  let droppedStaleCount = 0

  for (const raw of urls || []) {
    const url = typeof raw === 'string' ? raw.trim() : ''
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
 * @returns {{ nodes: object[], droppedStaleCount: number }}
 */
async function persistAlbumNodeImages(nodes) {
  const next = []
  let droppedStaleCount = 0

  for (const node of nodes || []) {
    const { images, droppedStaleCount: dropped } = await persistLocalImages(node.images || [])
    droppedStaleCount += dropped
    next.push({ ...node, images })
  }

  return { nodes: next, droppedStaleCount }
}

module.exports = {
  isPersistedRemoteUrl,
  isLocalTempImagePath,
  normalizeStoredImageUrl,
  uploadImage,
  persistLocalImages,
  persistAlbumNodeImages,
}
