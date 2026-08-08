const { uploadImage, normalizeStoredImageUrl } = require('../../../../utils/media-upload')
const { recognizeVehicleIntakeOcr } = require('../../../../services/merchant-service-album')

const MODE_META = {
  plate: {
    title: '识别车牌号',
    desc: '请拍摄车辆前部车牌区域，或从相册选择清晰照片。识别结果将回填到新建页，可再手工修改。',
  },
  vin: {
    title: '识别车架号',
    desc: '请拍摄车架号铭牌或前挡风玻璃 VIN 区域，或从相册选择清晰照片。识别后可用于解析车型。',
  },
}

Page({
  data: {
    mode: 'plate',
    pageTitle: MODE_META.plate.title,
    pageDesc: MODE_META.plate.desc,
    previewUrl: '',
    resultHint: '',
    busy: false,
  },

  onLoad(options) {
    const mode = options.mode === 'vin' ? 'vin' : 'plate'
    const meta = MODE_META[mode]
    this.mode = mode
    this.setData({
      mode,
      pageTitle: meta.title,
      pageDesc: meta.desc,
    })
    wx.setNavigationBarTitle({ title: meta.title })
  },

  onTakePhoto() {
    this.pickAndRecognize(['camera'])
  },

  onPickAlbum() {
    this.pickAndRecognize(['album'])
  },

  pickAndRecognize(sourceType) {
    if (this.data.busy) return
    const onFail = (err) => {
      const msg = String((err && err.errMsg) || '')
      if (/cancel/i.test(msg)) return
      wx.showToast({ title: '无法打开相机/相册', icon: 'none' })
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
    this.setData({ busy: true, previewUrl: tempPath, resultHint: '上传并识别中…' })
    try {
      const url = await uploadImage(tempPath)
      const persistent = normalizeStoredImageUrl(url)
      this.setData({ previewUrl: persistent || tempPath })
      const result = await recognizeVehicleIntakeOcr(persistent || url)
      const plate = String((result && result.plate) || '').trim()
      const vin = String((result && result.vin) || '').trim()

      if (this.mode === 'plate') {
        if (!plate) {
          this.setData({ resultHint: '未识别到车牌，请换一张更清晰的照片或返回手填' })
          wx.showToast({ title: '未识别到车牌', icon: 'none' })
          return
        }
        this.emitAndBack({ plate, vin })
        return
      }

      if (!vin) {
        this.setData({ resultHint: '未识别到车架号，请换一张更清晰的照片或返回手填' })
        wx.showToast({ title: '未识别到车架号', icon: 'none' })
        return
      }
      this.emitAndBack({ plate, vin })
    } catch (e) {
      this.setData({
        resultHint: (e && e.message) || '识别失败，请重试或返回手填',
      })
      wx.showToast({ title: (e && e.message) || '识别失败', icon: 'none' })
    } finally {
      this.setData({ busy: false })
    }
  },

  emitAndBack(payload) {
    const channel = typeof this.getOpenerEventChannel === 'function' ? this.getOpenerEventChannel() : null
    if (channel && typeof channel.emit === 'function') {
      channel.emit('vehicleScanResult', {
        mode: this.mode,
        plate: payload.plate || '',
        vin: payload.vin || '',
      })
    }
    wx.showToast({ title: '已识别', icon: 'success' })
    setTimeout(() => {
      wx.navigateBack()
    }, 320)
  },
})
