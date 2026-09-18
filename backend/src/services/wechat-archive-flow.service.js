/**
 * 微信群聊 → 同一本服务相册（进料口）
 * 口径：docs/04_维修过程相册/24_微信转案例迁入小程序.md
 */

const { extractFacts, parseChat, maskChatText, CATEGORY_LABELS } = require('./wechat-archive.service')
const {
  createMerchantServiceAlbum,
  saveMerchantServiceAlbum,
  loadAlbum,
  mapNodesForView,
  assertMerchantAlbum,
  assertAlbumContentEditable,
  buildMerchantView,
} = require('./service-album.service')
const { writeFlowPackage } = require('./service-flow.service')
const { FINDING_RESULT, QUOTE_CONFIRM_COPY } = require('../../vendor/shared/constants/service-flow-nodes')

const VEHICLE_BRANDS = [
  '大众',
  '丰田',
  '本田',
  '别克',
  '日产',
  '奔驰',
  '宝马',
  '奥迪',
  '福特',
  '现代',
  '起亚',
  '雪佛兰',
  '比亚迪',
  '吉利',
  '哈弗',
  '长安',
  '荣威',
  '名爵',
  '马自达',
  '沃尔沃',
  '保时捷',
  '路虎',
  '特斯拉',
  '五菱',
  '理想',
  '问界',
  '蔚来',
  '小鹏',
  '零跑',
  '奇瑞',
  '传祺',
  '红旗',
  '奔腾',
  '斯柯达',
  '标致',
  '雪铁龙',
  '捷豹',
  '凯迪拉克',
  '林肯',
  '雷克萨斯',
  '英菲尼迪',
  '斯巴鲁',
  '三菱',
  '铃木',
  '江淮',
  '东风',
  '长城',
]

const CN_DIGIT = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}

const PHOTO_TARGET = {
  检查: 'intake',
  旧件: 'work',
  新件: 'work',
  施工: 'work',
  完工: 'delivery',
}

function clip(value, max) {
  return String(value == null ? '' : value).slice(0, max).trim()
}

function parseVehicleName(text) {
  const raw = clip(text, 40)
  if (!raw) return { brand: '', series: '' }
  const hit = VEHICLE_BRANDS.find((name) => raw.includes(name))
  if (!hit) return { brand: '', series: raw }
  const idx = raw.indexOf(hit)
  const rest = raw.slice(idx + hit.length).replace(/^[\s·\-/]+/, '')
  return { brand: hit, series: rest }
}

function parseLooseAmount(text) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  const western = raw.replace(/[^\d.]/g, '')
  if (western) {
    const n = Number(western)
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100
  }
  const chars = raw.replace(/[^一二三四五六七八九十百千万两零〇]/g, '')
  if (!chars) return ''
  let total = 0
  let buf = 0
  for (const ch of chars) {
    if (ch === '十') {
      total += (buf || 1) * 10
      buf = 0
    } else if (ch === '百') {
      total += (buf || 1) * 100
      buf = 0
    } else if (ch === '千') {
      total += (buf || 1) * 1000
      buf = 0
    } else if (ch === '万') {
      total = (total + buf) * 10000
      buf = 0
    } else if (CN_DIGIT[ch] != null) {
      buf = CN_DIGIT[ch]
    }
  }
  if (total >= 100 && buf > 0 && buf < 10) total += buf * 10
  else total += buf
  return total > 0 ? total : ''
}

function toIntakeFinding(text, result) {
  const advice = clip(text, 200)
  if (!advice) return null
  const matched = advice.match(/^(.{2,16}?)(松旷|松了|开裂|裂了|磨损|损坏|可[用换]|正常|不用换).*$/)
  const partName = clip(matched ? matched[1].replace(/[的了]$/, '') : advice.slice(0, 12), 20)
  return {
    partName: partName || advice.slice(0, 12),
    result: result || FINDING_RESULT.ACTION,
    advice,
    url: '',
    caption: '',
    imageId: '',
  }
}

function toWorkFinding(text) {
  const partName = clip(text, 40)
  if (!partName) return null
  return {
    partName,
    url: '',
    caption: '',
    imageId: '',
    images: [],
    result: '',
    advice: '',
  }
}

function hintTarget(node) {
  const key = clip(node, 8)
  return PHOTO_TARGET[key] || 'unassigned'
}

function hintLabel(node) {
  const key = clip(node, 8)
  if (key === '检查') return '检查'
  if (key === '旧件') return '旧件'
  if (key === '新件') return '新件'
  if (key === '完工') return '完工'
  return '施工'
}

function buildPhotoSlots(extracted) {
  const hints = Array.isArray(extracted?.facts?.photoHints) ? extracted.facts.photoHints : []
  const slots = []
  hints.forEach((hint, hintIndex) => {
    const count = Math.max(1, Math.min(8, Number(hint.count) || 1))
    const say = clip(hint.say, 40)
    const node = clip(hint.node, 8)
    for (let i = 0; i < count; i += 1) {
      slots.push({
        key: `${hintTarget(node)}-${hintIndex}-${i}`,
        label: hintLabel(node),
        target: hintTarget(node),
        say,
      })
    }
  })
  const imageCount = Number(extracted?.stats?.imageCount) || 0
  const n = Math.min(12, imageCount)
  while (slots.length < n) {
    slots.push({
      key: `unassigned-${slots.length}`,
      label: '未分类',
      target: 'unassigned',
      say: '',
    })
  }
  return slots
}

function mapFactsToFlowDraft(extracted) {
  const facts = (extracted && extracted.facts) || {}
  const vehicle = parseVehicleName(facts.vehicle)
  const mileageKm = String(facts.odo || '').replace(/[^\d]/g, '')
  const intakeFindings = []
  ;(facts.checkFindings || []).forEach((row) => {
    const item = toIntakeFinding(row, FINDING_RESULT.ACTION)
    if (item) intakeFindings.push(item)
  })
  ;(facts.excluded || []).forEach((row) => {
    const item = toIntakeFinding(row, FINDING_RESULT.OK)
    if (item) intakeFindings.push(item)
  })
  const workFindings = []
  const process = Array.isArray(facts.process) ? facts.process : []
  process.forEach((row) => {
    const item = toWorkFinding(row)
    if (item) workFindings.push(item)
  })
  if (!workFindings.length && facts.plan) {
    const item = toWorkFinding(facts.plan)
    if (item) workFindings.push(item)
  }
  const amount = parseLooseAmount(facts.amount)
  const quoteLines = facts.plan
    ? [
        {
          name: clip(facts.plan, 40),
          brand: clip((facts.parts || [])[0], 20),
          amount,
          note: clip(facts.planReason, 120),
        },
      ]
    : []
  const categoryLabel = extracted.categoryLabel || CATEGORY_LABELS[extracted.category] || '维修留档'
  const serviceName = clip(facts.plan || categoryLabel, 16) || '维修留档'
  return {
    serviceName,
    vehicle: {
      brand: vehicle.brand,
      series: vehicle.series,
      mileage: mileageKm ? Number(mileageKm) : undefined,
    },
    chiefComplaint: clip(facts.symptom, 200),
    mileageKm,
    vehicleBrand: vehicle.brand,
    vehicleSeries: vehicle.series,
    intakeFindings,
    quoteLines,
    workFindings,
    handover: clip(facts.handover || facts.finish, 300),
    finish: clip(facts.finish, 200),
    photoSlots: buildPhotoSlots(extracted),
    doubts: extracted.doubts || [],
    missing: extracted.missing || [],
    stats: extracted.stats || {},
  }
}

function applyDraftToNodes(nodes, draft) {
  return (nodes || []).map((node) => {
    if (node.kind === 'intake_inspection') {
      return {
        ...node,
        photoDraft: {
          ...(node.photoDraft || {}),
          chiefComplaint: draft.chiefComplaint,
          mileageKm: draft.mileageKm,
          vehicleBrand: draft.vehicleBrand,
          vehicleSeries: draft.vehicleSeries,
          findings: draft.intakeFindings,
        },
      }
    }
    if (node.kind === 'quote_confirm') {
      const prev = node.document || {}
      return {
        ...node,
        document: {
          ...prev,
          status: 'draft',
          payload: {
            ...(prev.payload || {}),
            lines: draft.quoteLines.length
              ? draft.quoteLines
              : [{ name: '', amount: '', note: '' }],
            confirmCopy: QUOTE_CONFIRM_COPY,
          },
        },
      }
    }
    if (node.kind === 'work') {
      return {
        ...node,
        photoDraft: {
          ...(node.photoDraft || {}),
          findings: draft.workFindings,
        },
      }
    }
    if (node.kind === 'delivery_photos') {
      return {
        ...node,
        photoDraft: {
          ...(node.photoDraft || {}),
          warrantyNotes: draft.handover,
        },
      }
    }
    return node
  })
}

function publicPreview(draft, extracted) {
  return {
    vehicleLabel: [draft.vehicleBrand, draft.vehicleSeries].filter(Boolean).join(' ') || '该车辆',
    chiefComplaint: draft.chiefComplaint,
    findings: draft.intakeFindings.map((row) => row.partName),
    plan: (draft.quoteLines[0] && draft.quoteLines[0].name) || '',
    amount: (draft.quoteLines[0] && draft.quoteLines[0].amount) || '',
    photoSlots: draft.photoSlots,
    doubts: (draft.doubts || []).map((row) => ({
      field: row.field,
      why: row.why,
    })),
    missing: draft.missing || [],
    voiceCount: Number(extracted?.stats?.voiceCount) || 0,
    imageCount: Number(extracted?.stats?.imageCount) || 0,
  }
}

async function createAlbumFromWechatChat({ merchantId, storeId, text, category }) {
  const raw = String(text || '').trim()
  if (!raw) {
    const err = new Error('请先粘贴群聊文字')
    err.status = 400
    err.code = 'EMPTY_INPUT'
    throw err
  }
  const parsed = parseChat(raw)
  const masked = maskChatText(raw, { senders: parsed.senders })
  const extracted = await extractFacts({
    text: masked.text,
    category: category || 'chassis_noise',
  })
  const draft = mapFactsToFlowDraft(extracted)
  const album = await createMerchantServiceAlbum(merchantId, storeId, {
    serviceName: draft.serviceName,
    vehicle: draft.vehicle,
    complexityLevel: 'L2',
  })
  await writeFlowPackage(album.id, (pkg) => {
    const nodes = Array.isArray(pkg.flowNodes) ? pkg.flowNodes : []
    return {
      ...pkg,
      flowNodes: applyDraftToNodes(nodes, draft),
      wechatArchive: {
        maskedText: extracted.maskedText || masked.text,
        stats: extracted.stats || parsed.stats,
        doubts: extracted.doubts || [],
        missing: extracted.missing || [],
        photoHints: extracted.facts && extracted.facts.photoHints,
      },
    }
  })
  const preview = publicPreview(draft, extracted)
  return {
    albumId: album.id,
    ...preview,
  }
}

function appendImagesToStage(nodes, stageId, images) {
  return (nodes || []).map((node) => {
    if (node.id !== stageId) return node
    const next = (node.images || []).concat(images)
    return { ...node, images: next }
  })
}

function fillFindingUrls(findings, images, asWork) {
  const list = Array.isArray(findings) ? findings.slice() : []
  const queue = (images || []).filter((row) => row && row.url)
  list.forEach((row, index) => {
    const img = queue[index]
    if (!img) return
    list[index] = asWork
      ? {
          ...row,
          url: img.url,
          caption: img.caption || row.caption || '',
          images: [{ url: img.url, imageId: img.id || '' }],
        }
      : {
          ...row,
          url: img.url,
          caption: img.caption || row.caption || '',
          imageId: img.id || '',
        }
  })
  for (let i = list.length; i < queue.length; i += 1) {
    const img = queue[i]
    if (asWork) {
      list.push({
        partName: img.caption || '施工',
        url: img.url,
        caption: img.caption || '',
        images: [{ url: img.url, imageId: img.id || '' }],
      })
    } else {
      list.push({
        partName: img.caption || '检查',
        result: FINDING_RESULT.ACTION,
        advice: img.caption || '',
        url: img.url,
        caption: img.caption || '',
        imageId: img.id || '',
      })
    }
  }
  return list
}

async function attachWechatPhotos({ merchantId, storeId, albumId, assignments }) {
  const album = await loadAlbum(albumId)
  assertMerchantAlbum(album, storeId, merchantId)
  assertAlbumContentEditable(album)

  const groups = { intake: [], work: [], delivery: [] }
  ;(Array.isArray(assignments) ? assignments : []).forEach((row) => {
    const target = row && row.target
    const url = clip(row && row.url, 512)
    if (!url) return
    if (target === 'intake' || target === 'work' || target === 'delivery') {
      groups[target].push({
        url,
        caption: clip(row.caption, 80),
      })
    }
  })

  let nodes = mapNodesForView(album)
  if (groups.intake.length) nodes = appendImagesToStage(nodes, 'stage_2', groups.intake)
  if (groups.work.length) nodes = appendImagesToStage(nodes, 'stage_5', groups.work)
  if (groups.delivery.length) nodes = appendImagesToStage(nodes, 'stage_6', groups.delivery)

  if (groups.intake.length || groups.work.length || groups.delivery.length) {
    await saveMerchantServiceAlbum(albumId, storeId, { nodes }, merchantId)
  }

  await writeFlowPackage(albumId, (pkg) => {
    const flowNodes = Array.isArray(pkg.flowNodes) ? pkg.flowNodes : []
    const next = flowNodes.map((node) => {
      if (node.kind === 'intake_inspection' && groups.intake.length) {
        const photoDraft = node.photoDraft || {}
        return {
          ...node,
          photoDraft: {
            ...photoDraft,
            findings: fillFindingUrls(photoDraft.findings, groups.intake, false),
          },
        }
      }
      if (node.kind === 'work' && groups.work.length) {
        const photoDraft = node.photoDraft || {}
        return {
          ...node,
          photoDraft: {
            ...photoDraft,
            findings: fillFindingUrls(photoDraft.findings, groups.work, true),
          },
        }
      }
      if (node.kind === 'delivery_photos' && groups.delivery.length) {
        const photoDraft = node.photoDraft || {}
        const urls = groups.delivery.map((row) => row.url)
        return {
          ...node,
          photoDraft: {
            ...photoDraft,
            deliveryExteriorUrl: photoDraft.deliveryExteriorUrl || urls[0] || '',
            selectedDeliveryUrls: Array.from(
              new Set([].concat(photoDraft.selectedDeliveryUrls || [], urls.slice(1))),
            ),
          },
        }
      }
      return node
    })
    return { ...pkg, flowNodes: next }
  })

  const refreshed = await loadAlbum(albumId)
  return { albumId, album: buildMerchantView(refreshed) }
}

module.exports = {
  parseVehicleName,
  parseLooseAmount,
  mapFactsToFlowDraft,
  buildPhotoSlots,
  createAlbumFromWechatChat,
  attachWechatPhotos,
}
