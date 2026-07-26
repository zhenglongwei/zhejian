/**
 * 车主下载服务相册原图压缩包
 */
const { ENV } = require('../services/config')

function sanitizeFileName(name) {
  return String(name || '服务相册-原图档案')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || '服务相册-原图档案'
}

function buildArchiveLocalPath(albumId, fileName) {
  const safeId = String(albumId || 'album').replace(/[^\w-]/g, '_')
  const base = sanitizeFileName(fileName).replace(/\.zip$/i, '')
  return `${wx.env.USER_DATA_PATH}/${base}-${safeId}.zip`
}

/**
 * 下载压缩包到本地用户目录
 * @returns {Promise<{ filePath: string, fileName: string }>}
 */
function downloadAlbumArchiveFile(albumId, options = {}) {
  const id = String(albumId || '').trim()
  if (!id) {
    return Promise.reject({ code: 'INVALID', message: '缺少相册' })
  }
  if (ENV.mode === 'mock') {
    return Promise.reject({
      code: 'MOCK_MODE',
      message: '演示模式不支持下载档案，请切换联调环境',
    })
  }

  const token = wx.getStorageSync('token') || ''
  if (!token) {
    return Promise.reject({ code: 401, message: '请先登录' })
  }

  const fileName = sanitizeFileName(options.fileName || '服务相册-原图档案') + '.zip'
  const filePath = buildArchiveLocalPath(id, fileName)
  const url = `${ENV.baseUrl}/api/${ENV.apiVersion}/user/service-albums/${encodeURIComponent(id)}/archive`

  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      filePath,
      timeout: options.timeout || 120000,
      header: {
        Authorization: `Bearer ${token}`,
        'X-Client-Type': ENV.clientType,
        'X-App-Version': ENV.appVersion,
      },
      success(res) {
        if (res.statusCode === 200) {
          resolve({
            filePath: res.filePath || filePath,
            fileName,
          })
          return
        }
        if (res.statusCode === 401) {
          reject({ code: 401, message: '请先登录' })
          return
        }
        if (res.statusCode === 403) {
          reject({ code: 403, message: '仅关联车主可下载档案' })
          return
        }
        if (res.statusCode === 400) {
          reject({ code: 400, message: '该相册暂无照片可下载' })
          return
        }
        reject({
          code: res.statusCode || 'DOWNLOAD_FAILED',
          message: '下载失败，请稍后重试',
        })
      },
      fail(err) {
        reject({
          code: 'NETWORK_ERROR',
          message: '网络异常，请检查网络后重试',
          detail: err,
        })
      },
    })
  })
}

/**
 * 引导用户保存压缩包（转发到微信文件/文件传输助手）
 */
function shareArchiveFile(filePath, fileName) {
  return new Promise((resolve, reject) => {
    if (typeof wx.shareFileMessage !== 'function') {
      reject({
        code: 'UNSUPPORTED',
        message: '当前微信版本不支持转发文件，请升级微信后重试',
      })
      return
    }
    wx.shareFileMessage({
      filePath,
      fileName: fileName || '服务相册-原图档案.zip',
      success: () => resolve(true),
      fail: (err) => {
        const msg = (err && (err.errMsg || err.message)) || ''
        if (/cancel|取消/i.test(msg)) {
          resolve(false)
          return
        }
        reject({
          code: 'SHARE_FAILED',
          message: '未能打开转发，请稍后重试',
          detail: err,
        })
      },
    })
  })
}

module.exports = {
  downloadAlbumArchiveFile,
  shareArchiveFile,
  sanitizeFileName,
}
