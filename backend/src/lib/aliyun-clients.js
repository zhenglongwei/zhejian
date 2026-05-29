/**
 * 阿里云 OCR / 人脸客户端（ECS RAM 角色优先，本地 AccessKey 兜底）
 */
const fs = require('fs')
const Credential = require('@alicloud/credentials').default
const { Config } = require('@alicloud/openapi-client')
const OcrClient = require('@alicloud/ocr-api20210707').default
const FacebodyClient = require('@alicloud/facebody20191230').default
const { config } = require('../config')

let credential
let ocrClient
let faceClient

function getCredential() {
  if (!credential) {
    const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || process.env.ALIYUN_ACCESS_KEY_ID
    const accessKeySecret =
      process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || process.env.ALIYUN_ACCESS_KEY_SECRET
    if (accessKeyId && accessKeySecret) {
      credential = new Credential({
        type: 'access_key',
        accessKeyId,
        accessKeySecret,
      })
    } else {
      credential = new Credential()
    }
  }
  return credential
}

function ocrEndpoint() {
  const region = config.aliyun.region || 'cn-shanghai'
  return `ocr-api.${region}.aliyuncs.com`
}

function faceEndpoint() {
  const region = config.aliyun.region || 'cn-shanghai'
  return `facebody.${region}.aliyuncs.com`
}

function getOcrClient() {
  if (!ocrClient) {
    ocrClient = new OcrClient(
      new Config({
        credential: getCredential(),
        endpoint: ocrEndpoint(),
        regionId: config.aliyun.region,
      })
    )
  }
  return ocrClient
}

function getFaceClient() {
  if (!faceClient) {
    faceClient = new FacebodyClient(
      new Config({
        credential: getCredential(),
        endpoint: faceEndpoint(),
        regionId: config.aliyun.region,
      })
    )
  }
  return faceClient
}

function readImageBody(filePath) {
  return fs.readFileSync(filePath)
}

function openImageStream(filePath) {
  return fs.createReadStream(filePath)
}

module.exports = {
  getOcrClient,
  getFaceClient,
  readImageBody,
  openImageStream,
}
