const { uploadImage, normalizeStoredImageUrl } = require('../../../../utils/media-upload')
const { recognizeVehicleIntakeOcr } = require('../../../../services/merchant-service-album')

/** 摄像头就绪后首次自动取景延迟 */
const AUTO_SCAN_FIRST_DELAY_MS = 700
/** 未识别成功时的重试间隔（控制 OCR 调用频率） */
const AUTO_SCAN_RETRY_DELAY_MS = 2200

const MODE_META = {
  plate: {
    title: '识别车牌号',
    desc: '将车牌对准取景框，系统将自动识别；也可从相册选择照片。',
  },
  vin: {
    title: '识别车架号',
    desc: '将车辆铭牌上的「车辆识别代号」对准取景框，系统将自动识别。',
  },
}

Page({
  data: {
    mode: 'plate',
    pageTitle: MODE_META.plate.title,
    pageDesc: MODE_META.plate.desc,
    statusBarHeight: 20,
    cameraReady: false,
    flash: 'off',
    resultHint: '',
    busy: false,
  },

  onLoad(options) {
    const mode = options.mode === 'vin' ? 'vin' : 'plate'
    const meta = MODE_META[mode]
    this.mode = mode
    this._alive = true
    this._autoScanEnabled = true
    this._scanTimer = null
    this._cameraCtx = null
    const sys = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {}
    this.setData({
      mode,
      pageTitle: meta.title,
      pageDesc: meta.desc,
      statusBarHeight: Number(sys.statusBarHeight) || 20,
    })
    this.ensureCameraAuth()
  },

  onShow() {
    this._alive = true
    if (this.data.cameraReady && this._autoScanEnabled && !this.data.busy) {
      this.scheduleAutoScan(AUTO_SCAN_FIRST_DELAY_MS)
    }
  },

  onHide() {
    this.stopAutoScan()
  },

  onUnload() {
    this._alive = false
    this.stopAutoScan()
    this._cameraCtx = null
  },

  noop() {},

  onClose() {
    this._alive = false
    this.stopAutoScan()
    wx.navigateBack({ fail: () => {} })
  },

  clearScanTimer() {
    if (this._scanTimer) {
      clearTimeout(this._scanTimer)
      this._scanTimer = null
    }
  },

  stopAutoScan() {
    this.clearScanTimer()
  },

  scheduleAutoScan(delayMs) {
    if (!this._alive || !this._autoScanEnabled) return
    this.clearScanTimer()
    this._scanTimer = setTimeout(() => {
      this._scanTimer = null
      this.runAutoCapture()
    }, Math.max(0, Number(delayMs) || 0))
  },

  async ensureCameraAuth() {
    try {
      const setting = await new Promise((resolve, reject) => {
        wx.getSetting({
          success: resolve,
          fail: reject,
        })
      })
      const authed = setting && setting.authSetting && setting.authSetting['scope.camera']
      if (authed === false) {
        this._autoScanEnabled = false
        this.setData({
          cameraReady: false,
          resultHint: '未获得摄像头权限，可点右下角「相册」识别，或在设置中开启摄像头',
        })
        return
      }
      if (authed) {
        this.setData({ cameraReady: true })
        return
      }
      await new Promise((resolve, reject) => {
        wx.authorize({
          scope: 'scope.camera',
          success: resolve,
          fail: reject,
        })
      })
      this.setData({ cameraReady: true })
    } catch (e) {
      this._autoScanEnabled = false
      this.setData({
        cameraReady: false,
        resultHint: '无法打开摄像头，可点右下角「相册」选择照片识别',
      })
    }
  },

  onCameraInit() {
    this._cameraCtx = wx.createCameraContext('vehicleScanCamera', this)
    this.setData({ cameraReady: true }, () => {
      if (this._autoScanEnabled) {
        this.scheduleAutoScan(AUTO_SCAN_FIRST_DELAY_MS)
      }
    })
  },

  onCameraError(e) {
    const msg = String((e && e.detail && e.detail.errMsg) || '')
    console.warn('[vehicle-scan] camera error', msg)
    this._autoScanEnabled = false
    this.stopAutoScan()
    this.setData({
      cameraReady: false,
      resultHint: '摄像头不可用，请使用右下角「相册」选择照片',
    })
  },

  onToggleFlash() {
    if (!this.data.cameraReady || this.data.busy) return
    this.setData({
      flash: this.data.flash === 'torch' ? 'off' : 'torch',
    })
  },

  takePhotoOnce() {
    return new Promise((resolve, reject) => {
      const ctx = this._cameraCtx || wx.createCameraContext('vehicleScanCamera', this)
      this._cameraCtx = ctx
      ctx.takePhoto({
        quality: 'normal',
        success: (res) => {
          const path = res && res.tempImagePath
          if (!path) {
            reject(new Error('取景失败'))
            return
          }
          resolve(path)
        },
        fail: (err) => {
          reject(err || new Error('取景失败'))
        },
      })
    })
  },

  async runAutoCapture() {
    if (!this._alive || !this._autoScanEnabled || this.data.busy) return
    if (!this.data.cameraReady) return

    this.setData({ busy: true, resultHint: this.data.resultHint || '正在自动识别…' })
    try {
      const path = await this.takePhotoOnce()
      if (!this._alive) return
      await this.runRecognize(path, { fromAuto: true })
    } catch (err) {
      console.warn('[vehicle-scan] auto takePhoto failed', err && err.errMsg)
      if (!this._alive) return
      this.setData({
        busy: false,
        resultHint: '取景不稳定，请稳住手机；也可改用右下角相册',
      })
      this.scheduleAutoScan(AUTO_SCAN_RETRY_DELAY_MS)
    }
  },

  onPickAlbum() {
    if (this.data.busy) return
    this.stopAutoScan()
    this.pickAndRecognize(['album'])
  },

  pickAndRecognize(sourceType) {
    if (this.data.busy) return
    const resumeAuto = () => {
      if (this._alive && this._autoScanEnabled && this.data.cameraReady) {
        this.scheduleAutoScan(AUTO_SCAN_FIRST_DELAY_MS)
      }
    }
    const onFail = (err) => {
      const msg = String((err && err.errMsg) || '')
      if (/cancel/i.test(msg)) {
        resumeAuto()
        return
      }
      wx.showToast({ title: '无法打开相册', icon: 'none' })
      resumeAuto()
    }
    const handlePaths = (paths) => {
      const temp = (paths || [])[0]
      if (!temp) {
        resumeAuto()
        return
      }
      this.runRecognize(temp, { fromAuto: false })
    }
    if (typeof wx.chooseMedia === 'function') {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType,
        success: (res) => handlePaths((res.tempFiles || []).map((f) => f.tempFilePath)),
        fail: (err) => {
          const msg = String((err && err.errMsg) || '')
          if (/cancel/i.test(msg)) {
            resumeAuto()
            return
          }
          wx.chooseImage({
            count: 1,
            sizeType: ['compressed'],
            sourceType,
            success: (res) => handlePaths(res.tempFilePaths || []),
            fail: onFail,
          })
        },
      })
      return
    }
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType,
      success: (res) => handlePaths(res.tempFilePaths || []),
      fail: onFail,
    })
  },

  async runRecognize(tempPath, options = {}) {
    const fromAuto = Boolean(options && options.fromAuto)
    this.setData({ busy: true, resultHint: fromAuto ? '正在自动识别…' : '' })
    try {
      const url = await uploadImage(tempPath)
      if (!this._alive) return
      const persistent = normalizeStoredImageUrl(url)
      const result = await recognizeVehicleIntakeOcr(persistent || url, { mode: this.mode })
      if (!this._alive) return

      const plate = String((result && result.plate) || '').trim()
      const vin = String((result && result.vin) || '').trim()

      if (this.mode === 'plate') {
        if (!plate) {
          this.setData({
            busy: false,
            resultHint: fromAuto
              ? '未识别到车牌，请对准车牌，将继续自动识别'
              : '未识别到车牌，请换一张更清晰的照片',
          })
          if (!fromAuto) {
            wx.showToast({ title: '未识别到车牌', icon: 'none' })
          }
          if (fromAuto) this.scheduleAutoScan(AUTO_SCAN_RETRY_DELAY_MS)
          else if (this._autoScanEnabled) this.scheduleAutoScan(AUTO_SCAN_RETRY_DELAY_MS)
          return
        }
        this._autoScanEnabled = false
        this.stopAutoScan()
        this.emitAndBack({ plate, vin, vehicleHints: (result && result.vehicleHints) || {} })
        return
      }

      if (!vin) {
        this.setData({
          busy: false,
          resultHint: fromAuto
            ? '未识别到车架号，请对准铭牌「车辆识别代号」，将继续自动识别'
            : '未识别到车架号，请换一张更清晰的铭牌照片',
        })
        if (!fromAuto) {
          wx.showToast({ title: '未识别到车架号', icon: 'none' })
        }
        if (fromAuto || this._autoScanEnabled) {
          this.scheduleAutoScan(AUTO_SCAN_RETRY_DELAY_MS)
        }
        return
      }
      this._autoScanEnabled = false
      this.stopAutoScan()
      this.emitAndBack({
        plate,
        vin,
        vehicleHints: (result && result.vehicleHints) || {},
      })
    } catch (e) {
      if (!this._alive) return
      this.setData({
        busy: false,
        resultHint: (e && e.message) || (fromAuto
          ? '识别暂未成功，请稳住取景，将继续自动识别'
          : '识别失败，请重试或返回手填'),
      })
      if (!fromAuto) {
        wx.showToast({ title: (e && e.message) || '识别失败', icon: 'none' })
      }
      if (fromAuto || this._autoScanEnabled) {
        this.scheduleAutoScan(AUTO_SCAN_RETRY_DELAY_MS)
      }
    }
  },

  emitAndBack(payload) {
    const channel = typeof this.getOpenerEventChannel === 'function' ? this.getOpenerEventChannel() : null
    if (channel && typeof channel.emit === 'function') {
      channel.emit('vehicleScanResult', {
        mode: this.mode,
        plate: payload.plate || '',
        vin: payload.vin || '',
        vehicleHints: payload.vehicleHints || {},
      })
    }
    wx.showToast({ title: '已识别', icon: 'success' })
    setTimeout(() => {
      wx.navigateBack({ fail: () => {} })
    }, 320)
  },
})
