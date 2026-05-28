/**
 * B-MEDIA：本地临时图 → 服务端持久 URL
 */
const { ENV } = require('../services/config')

function isLocalTempImagePath(url) {
  if (!url || typeof url !== 'string') return false
  const value = url.trim()
  if (!value || value.startsWith('mock://')) return false
  if (value.startsWith('https://')) return false
  if (value.startsWith('/media/uploads/')) return false
  if (value.startsWith('wxfile://')) return true
  if (value.includes('://tmp/')) return true
  if (value.startsWith('http://127.0.0.1')) return true
  if (value.startsWith('http://localhost')) return true
  if (value.startsWith('http://') && !value.includes('/media/uploads/')) return true
  return false
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

async function persistLocalImages(urls) {
  const result = []
  for (const url of urls || []) {
    if (isLocalTempImagePath(url)) {
      result.push(await uploadImage(url))
    } else {
      result.push(url)
    }
  }
  return result
}

async function persistAlbumNodeImages(nodes) {
  const next = []
  for (const node of nodes || []) {
    const images = await persistLocalImages(node.images || [])
    next.push({ ...node, images })
  }
  return next
}

module.exports = {
  isLocalTempImagePath,
  uploadImage,
  persistLocalImages,
  persistAlbumNodeImages,
}
