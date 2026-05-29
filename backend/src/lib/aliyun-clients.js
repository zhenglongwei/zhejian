/**
 * 阿里云 OCR / 人脸客户端（ECS RAM 角色优先，本地 AccessKey 兜底）
 */
const fs = require('fs')
const { Readable } = require('stream')
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
      const roleName =
        process.env.ALIBABA_CLOUD_ECS_METADATA_ROLE_NAME || process.env.ECS_RAM_ROLE_NAME || ''
      // 必须显式 ecs_ram_role；裸 new Credential() 会先读 ~/.aliyun/config.json 导致 ECS 上 ENOENT
      credential = new Credential({
        type: 'ecs_ram_role',
        ...(roleName ? { roleName } : {}),
      })
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

/** OCR SDK 要求 body 为 Readable；用 Buffer 包装避免 createReadStream 在部分环境报错 */
function openImageReadable(filePath) {
  return Readable.from(readImageBody(filePath))
}

function openImageStream(filePath) {
  return openImageReadable(filePath)
}

module.exports = {
  getOcrClient,
  getFaceClient,
  readImageBody,
  openImageStream,
  openImageReadable,
}
