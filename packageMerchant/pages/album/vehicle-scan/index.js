const { uploadImage, normalizeStoredImageUrl } = require('../../../../utils/media-upload')
const { recognizeVehicleIntakeOcr } = require('../../../../services/merchant-service-album')

const MODE_META = {
  plate: {
    title: '识别车牌号',
    desc: '将车牌对准取景框，点击下方「识别」；也可从相册选择照片。',
  },
  vin: {
    title: '识别车架号',
    desc: '将车辆铭牌上的「车辆识别代号」对准取景框，点击「识别」。',
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
    const sys = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {}
    this.setData({
      mode,
      pageTitle: meta.title,
      pageDesc: meta.desc,
      statusBarHeight: Number(sys.statusBarHeight) || 20,
    })
    this.ensureCameraAuth()
  },

  onUnload() {
    this._cameraCtx = null
  },

  noop() {},

  onClose() {
    if (this.data.busy) return
    wx.navigateBack({ fail: () => {} })
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
      this.setData({
        cameraReady: false,
        resultHint: '无法打开摄像头，可点右下角「相册」选择照片识别',
      })
    }
  },

  onCameraInit() {
    this._cameraCtx = wx.createCameraContext('vehicleScanCamera', this)
    this.setData({ cameraReady: true })
  },

  onCameraError(e) {
    const msg = String((e && e.detail && e.detail.errMsg) || '')
    console.warn('[vehicle-scan] camera error', msg)
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

  onCapture() {
    if (this.data.busy) return
    if (!this.data.cameraReady) {
      wx.showToast({ title: '摄像头未就绪，请用相册', icon: 'none' })
      return
    }
    const ctx = this._cameraCtx || wx.createCameraContext('vehicleScanCamera', this)
    this._cameraCtx = ctx
    this.setData({ busy: true, resultHint: '' })
    ctx.takePhoto({
      quality: 'high',
      success: (res) => {
        const path = res && res.tempImagePath
        if (!path) {
          this.setData({ busy: false, resultHint: '取景失败，请重试或改用相册' })
          return
        }
        this.runRecognize(path)
      },
      fail: (err) => {
        console.warn('[vehicle-scan] takePhoto failed', err && err.errMsg)
        this.setData({
          busy: false,
          resultHint: '取景失败，请重试或改用右下角相册',
        })
        wx.showToast({ title: '取景失败', icon: 'none' })
      },
    })
  },

  onPickAlbum() {
    if (this.data.busy) return
    this.pickAndRecognize(['album'])
  },

  pickAndRecognize(sourceType) {
    if (this.data.busy) return
    const onFail = (err) => {
      const msg = String((err && err.errMsg) || '')
      if (/cancel/i.test(msg)) return
      wx.showToast({ title: '无法打开相册', icon: 'none' })
    }
    const handlePaths = (paths) => {
      const temp = (paths || [])[0]
      if (!temp) return
      this.runRecognize(temp)
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
          if (/cancel/i.test(msg)) return
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

  async runRecognize(tempPath) {
    this.setData({ busy: true, resultHint: '' })
    try {
      const url = await uploadImage(tempPath)
      const persistent = normalizeStoredImageUrl(url)
      const result = await recognizeVehicleIntakeOcr(persistent || url, { mode: this.mode })
      const plate = String((result && result.plate) || '').trim()
      const vin = String((result && result.vin) || '').trim()

      if (this.mode === 'plate') {
        if (!plate) {
          this.setData({
            busy: false,
            resultHint: '未识别到车牌，请对准车牌后再点「识别」，或换一张清晰照片',
          })
          wx.showToast({ title: '未识别到车牌', icon: 'none' })
          return
        }
          this.emitAndBack({ plate, vin, vehicleHints: (result && result.vehicleHints) || {} })
        return
      }

      if (!vin) {
        this.setData({
          busy: false,
          resultHint: '未识别到车架号，请对准铭牌「车辆识别代号」后再识别',
        })
        wx.showToast({ title: '未识别到车架号', icon: 'none' })
        return
      }
      this.emitAndBack({
        plate,
        vin,
        vehicleHints: (result && result.vehicleHints) || {},
      })
    } catch (e) {
      this.setData({
        busy: false,
        resultHint: (e && e.message) || '识别失败，请重试或返回手填',
      })
      wx.showToast({ title: (e && e.message) || '识别失败', icon: 'none' })
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
