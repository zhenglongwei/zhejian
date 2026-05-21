const { ENV } = require('./config')

const CODE_MESSAGE = {
  400: '请求参数有误',
  401: '请先登录',
  403: '暂无权限',
  404: '内容不存在',
  409: '状态已变更，请刷新',
  429: '操作过于频繁，请稍后再试',
  500: '服务繁忙，请稍后再试',
}

/**
 * 统一请求（MVP：mock 模式直接拒绝，由 services 层走 mock）
 * @param {object} options
 * @param {string} options.url 相对路径，如 /orders/1
 * @param {'GET'|'POST'|'PUT'|'DELETE'} [options.method]
 * @param {object} [options.data]
 * @param {boolean} [options.showLoading]
 * @param {string} [options.loadingText]
 */
function request(options) {
  const {
    url,
    method = 'GET',
    data = {},
    showLoading = false,
    loadingText = '加载中',
  } = options

  if (ENV.mode === 'mock') {
    return Promise.reject({
      code: 'MOCK_MODE',
      message: '当前为 mock 模式，请通过 services 层调用 mock 数据',
      url,
    })
  }

  const token = wx.getStorageSync('token') || ''

  if (showLoading) {
    wx.showLoading({ title: loadingText, mask: true })
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${ENV.baseUrl}/api/${ENV.apiVersion}${url}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
        'X-Client-Type': ENV.clientType,
        'X-App-Version': ENV.appVersion,
      },
      success(res) {
        const body = res.data || {}
        if (res.statusCode === 401) {
          handleUnauthorized()
          reject(normalizeError(401, body))
          return
        }
        if (res.statusCode >= 400) {
          reject(normalizeError(res.statusCode, body))
          return
        }
        if (body.code !== 0 && body.code !== undefined) {
          reject(normalizeError(body.code, body))
          return
        }
        resolve(body.data !== undefined ? body.data : body)
      },
      fail(err) {
        reject({
          code: 'NETWORK_ERROR',
          message: '网络异常，请检查网络后重试',
          detail: err,
        })
      },
      complete() {
        if (showLoading) wx.hideLoading()
      },
    })
  })
}

function normalizeError(code, body) {
  const message =
    (body && (body.message || body.msg)) ||
    CODE_MESSAGE[code] ||
    '请求失败'
  return { code, message, requestId: body && body.requestId }
}

function handleUnauthorized() {
  const { clearSession } = require('../utils/auth')
  clearSession()
}

function get(url, data, opts) {
  return request({ url, method: 'GET', data, ...opts })
}

function post(url, data, opts) {
  return request({ url, method: 'POST', data, ...opts })
}

module.exports = {
  request,
  get,
  post,
}
