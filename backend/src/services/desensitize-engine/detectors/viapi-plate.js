const { RuntimeOptions } = require('@darabonba/typescript')
const ViapiOcr = require('@alicloud/ocr20191230')
const { config } = require('../../../config')
const { getViapiOcrClient, openImageReadable, viapiOcrEndpoint } = require('../../../lib/aliyun-clients')
const { boxFromLtwh, boxFromPoints } = require('../bbox')

const { RecognizeLicensePlateAdvanceRequest } = ViapiOcr

function runtimeOptions() {
  return new RuntimeOptions({
    connectTimeout: config.desensitize.apiTimeoutMs,
    readTimeout: config.desensitize.apiTimeoutMs,
  })
}

function parseViapiPlateBoxes(data) {
  const plates = data?.plates || data?.Plates || []
  const boxes = []
  plates.forEach((plate) => {
    const roi = plate?.roi || plate?.Roi
    if (roi) {
      const box = boxFromLtwh(
        roi.x ?? roi.X ?? roi.left,
        roi.y ?? roi.Y ?? roi.top,
        roi.w ?? roi.W ?? roi.width,
        roi.h ?? roi.H ?? roi.height,
        'plate',
        'viapi_roi'
      )
      if (box) boxes.push(box)
    }
    const positions = plate?.positions || plate?.Positions
    const posBox = boxFromPoints(positions, 'plate', 'viapi_pos')
    if (posBox) boxes.push(posBox)
  })
  return boxes
}

function hasViapiPlateText(data) {
  const plates = data?.plates || data?.Plates || []
  return plates.some((p) => String(p.plateNumber || p.PlateNumber || '').trim())
}

/**
 * VIAPI 车牌识别（ocr.cn-shanghai.aliyuncs.com），需 AliyunVIAPIFullAccess
 */
async function detectPlateViaViapi(imagePath) {
  const client = getViapiOcrClient()
  const runtime = runtimeOptions()
  const request = new RecognizeLicensePlateAdvanceRequest()
  request.imageURLObject = openImageReadable(imagePath)
  const resp = await client.recognizeLicensePlateAdvance(request, runtime)
  const data = resp?.body?.data || resp?.body?.Data
  const boxes = parseViapiPlateBoxes(data)
  console.info('[desensitize-engine] viapi plate ok', {
    endpoint: viapiOcrEndpoint(),
    count: boxes.length,
  })
  return {
    boxes,
    plateTextFound: hasViapiPlateText(data),
    orgWidth: 0,
    orgHeight: 0,
  }
}

module.exports = {
  detectPlateViaViapi,
  parseViapiPlateBoxes,
}
