/**
 * 图片脱敏工具 — 任务与单张状态（对齐 08_图片脱敏工具PRD §4）
 */
const BIZ_TYPE = {
  MERCHANT_HISTORY: 'merchant_history',
  ORDER_PRE_MASK: 'order_pre_mask',
  ORDER_AUTHORIZE: 'order_authorize',
  SERVICE_PRE_MASK: 'service_pre_mask',
  SERVICE_AUTHORIZE: 'service_authorize',
  STANDALONE_TOOL: 'standalone_tool',
}

const OPERATOR_ROLE = {
  MERCHANT: 'merchant',
  USER: 'user',
  OPS: 'ops',
  SYSTEM: 'system',
}

const PRE_MASK_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  READY: 'ready',
  PARTIAL_FAILED: 'partial_failed',
  FAILED: 'failed',
}

const ASSET_STATUS = {
  RAW_UPLOADED: 'raw_uploaded',
  MASKING: 'masking',
  MASKED_READY: 'masked_ready',
  MASK_FAILED: 'mask_failed',
  MANUAL_MASKED: 'manual_masked',
  CONFIRMED: 'confirmed',
}

const LIABILITY_COPY = {
  [BIZ_TYPE.MERCHANT_HISTORY]: {
    body:
      '你上传的内容用于服务相册公开案例展示。请确认已取得必要授权，或确保不会暴露客户车牌、人脸、手机号、证件等信息。请在本页完成脱敏确认；平台将进行审核，商家对上传内容的合法性与真实性承担责任。',
    confirmLabel: '确认脱敏结果并提交审核',
  },
  [BIZ_TYPE.ORDER_AUTHORIZE]: {
    body: '本人已逐张核对脱敏效果，同意授权公示。',
    confirmLabel: '确认并公开',
  },
  [BIZ_TYPE.SERVICE_AUTHORIZE]: {
    body: '本人已逐张核对脱敏效果，同意授权公示。',
    confirmLabel: '确认并公开',
  },
  [BIZ_TYPE.STANDALONE_TOOL]: {
    body:
      '本工具仅用于隐私打码预览。请勿上传违法或侵权内容。脱敏结果仅供参考，重要场景请人工复核。',
    confirmLabel: '确认脱敏结果',
  },
}

module.exports = {
  BIZ_TYPE,
  OPERATOR_ROLE,
  ASSET_STATUS,
  PRE_MASK_STATUS,
  LIABILITY_COPY,
}
