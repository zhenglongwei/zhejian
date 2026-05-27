const {
  PUBLIC_AUTH_TIER,
  PUBLIC_AUTH_TIER_LABEL,
} = require('../constants/case-authorization')
const { buildCaseFaq } = require('./case-faq')
const { buildPublicCasePrice } = require('./album-price')

function buildVehicleTitle(vehicle) {
  if (!vehicle) return '该车辆'
  const parts = [vehicle.brand, vehicle.series].filter(Boolean)
  return parts.join(' ') || '该车辆'
}

function buildCaseTitle({ city = '杭州', vehicle, serviceName = '维修服务' }) {
  const vehicleTitle = buildVehicleTitle(vehicle)
  const cityPart = city ? `${city}` : ''
  return `${cityPart}${vehicleTitle} · ${serviceName}`.trim()
}

function buildCaseSummary({ vehicle, serviceName = '维修服务', authorizationTier }) {
  const vehicleTitle = buildVehicleTitle(vehicle)
  const tierLabel = PUBLIC_AUTH_TIER_LABEL[authorizationTier] || '已授权'
  if (authorizationTier === PUBLIC_AUTH_TIER.ANONYMOUS) {
    return `该案例经车主${tierLabel}，记录了${vehicleTitle}进行${serviceName}的维修过程摘要。内容由门店上传，平台已完成隐私脱敏与展示审核。`
  }
  return `该案例经车主${tierLabel}，记录了${vehicleTitle}进行${serviceName}的维修过程。图片已脱敏并通过平台审核，展示门店本次方案参考报价。`
}

function buildCaseAiSummary({ city = '杭州', vehicle, serviceName = '维修服务' }) {
  const vehicleTitle = buildVehicleTitle(vehicle)
  return `本页展示${city}${vehicleTitle}${serviceName}维修案例，包含故障表现、检查结果、维修方案与脱敏过程图片。页面不展示车牌、VIN、手机号等隐私信息，实际费用需以门店检测结果为准。`
}

function buildCaseKeyInfo({ city = '杭州', serviceName, authorizationTier }) {
  const tierLabel = PUBLIC_AUTH_TIER_LABEL[authorizationTier] || '已授权'
  return [
    { label: '城市', value: city },
    { label: '服务项目', value: serviceName || '—' },
    { label: '公开方式', value: tierLabel },
  ]
}

function buildCaseDraftFromServiceAlbum({
  album,
  task,
  authorizationTier = PUBLIC_AUTH_TIER.NAMED,
}) {
  const albumId = album.albumId
  const caseId = `case_${albumId.replace(/^alb_/, '')}`
  const vehicle = album.vehicle || {}
  const serviceName = album.serviceName || '维修服务'
  const city = album.city || album.store?.city || '杭州'
  const storeName = album.store?.name || album.storeName || '—'
  const storeId = album.store?.id || album.storeId || ''

  const nodesWithMask = buildNodesFromTask(album.nodes, task, albumId)
  const coverImageDesensitized = pickCover(nodesWithMask)
  const publicPrice = buildPublicCasePrice(
    {
      ...album,
      authorizationTier,
    },
    { hasUserAuthorization: true }
  )

  return {
    id: caseId,
    albumId,
    authorizationTier,
    coverImage: coverImageDesensitized,
    coverImageDesensitized,
    title: buildCaseTitle({ city, vehicle, serviceName }),
    vehicleText: `${buildVehicleTitle(vehicle)}（已脱敏）`,
    serviceName,
    summary:
      album.storeNote ||
      buildCaseSummary({ vehicle, serviceName, authorizationTier }),
    priceMode: publicPrice.priceMode,
    amount: publicPrice.amount,
    minAmount: publicPrice.minAmount,
    maxAmount: publicPrice.maxAmount,
    planAmount: publicPrice.planAmount,
    storeId,
    storeName,
    city,
    viewCount: 0,
    publishedAt: new Date().toISOString().slice(0, 10),
    tags: ['authorized', 'desensitized', 'audited'],
    aiSummary: buildCaseAiSummary({ city, vehicle, serviceName }),
    keyInfo: buildCaseKeyInfo({ city, serviceName, authorizationTier }),
    faultDesc:
      album.faultDesc ||
      '用户到店反映车辆需进行相关检查与维修，门店按流程完成服务。',
    inspectResult:
      album.inspectResult || '门店完成相关部位检查，并按方案施工。',
    repairPlan:
      album.repairPlan || '按标准流程完成检测、施工、试车与交车确认。',
    priceFactors: album.priceFactors || [
      '车型与年款',
      '配件品牌',
      '损伤程度',
      '是否需要额外拆装',
    ],
    nodes: nodesWithMask,
    faq: buildCaseFaq(serviceName),
    maskingConfirmed: true,
  }
}

function buildNodesFromTask(albumNodes, task, albumId) {
  const { mockDesensitizedUrl } = require('./desensitize-mock')
  const assetMap = {}
  ;(task && task.rawAssets ? task.rawAssets : []).forEach((asset) => {
    const nodeId = asset.nodeId || 'node'
    if (!assetMap[nodeId]) assetMap[nodeId] = []
    const masked =
      asset.maskedUrl ||
      asset.preMaskedUrl ||
      mockDesensitizedUrl(asset.url, albumId, nodeId, asset.index || 0)
    if (masked) assetMap[nodeId].push(masked)
  })

  return (albumNodes || []).map((node) => {
    const fromTask = assetMap[node.id] || []
    const fallback = (node.images || []).map((url, index) =>
      mockDesensitizedUrl(url, albumId, node.id || 'node', index)
    )
    const imagesDesensitized = fromTask.length ? fromTask : fallback
    return {
      id: node.id,
      title: node.title,
      note: node.note || '',
      imagesDesensitized,
    }
  })
}

function pickCover(nodes) {
  const { pickDesensitizedCover } = require('./desensitize-mock')
  return pickDesensitizedCover(
    (nodes || []).map((n) => ({ imagesDesensitized: n.imagesDesensitized }))
  )
}

module.exports = {
  buildCaseTitle,
  buildCaseSummary,
  buildCaseAiSummary,
  buildCaseKeyInfo,
  buildCaseDraftFromServiceAlbum,
}
