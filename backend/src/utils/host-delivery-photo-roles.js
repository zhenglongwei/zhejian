/**
 * 交车节点图片归属（托管生成时由模型判定）
 * 真源：docs/changes/20261117-交车确认与交车施工图.md
 *
 * 交车节点只有一个「整车外观照」上传入口（外观行，最多 4 张）。
 * 有的门店会把施工验收照片也传到这里。托管生成时交给模型逐张判断归属：
 * - work：施工/验收证据 → 公开预览与公开页并入施工章
 * - exterior：整车外观 → 仍留在交车留档，不进施工章
 * - other：其他 → 不并
 * 判定结果落在 hostMeta（geoDraft / geoLayer），商家流程与节点 AI 分析均不变。
 */
const { stripUrlQuery } = require('../lib/media-signed-url')
const { resolveShared } = require('./resolve-shared')

const { contentOfFlowNode } = resolveShared('utils/service-flow-docs.js')

const DELIVERY_PHOTO_ROLE = {
  WORK: 'work',
  EXTERIOR: 'exterior',
  OTHER: 'other',
}

const ROLE_LABEL_MAP = {
  施工: DELIVERY_PHOTO_ROLE.WORK,
  施工证据: DELIVERY_PHOTO_ROLE.WORK,
  验收: DELIVERY_PHOTO_ROLE.WORK,
  验收照片: DELIVERY_PHOTO_ROLE.WORK,
  外观: DELIVERY_PHOTO_ROLE.EXTERIOR,
  整车外观: DELIVERY_PHOTO_ROLE.EXTERIOR,
  整车照: DELIVERY_PHOTO_ROLE.EXTERIOR,
  其他: DELIVERY_PHOTO_ROLE.OTHER,
  work: DELIVERY_PHOTO_ROLE.WORK,
  exterior: DELIVERY_PHOTO_ROLE.EXTERIOR,
  other: DELIVERY_PHOTO_ROLE.OTHER,
}

function text(value) {
  return String(value || '').trim()
}

function urlKey(url) {
  return stripUrlQuery(text(url))
}

function nameKey(value) {
  return text(value).replace(/\s+/g, '')
}

/**
 * 交车节点整车照入口的图片：外观行（旧 deliveryPhotos 已由 contentOfFlowNode 并入外观行）。
 * 保留原始槽位对象（含 maskedUrl / maskOutcome），供公开侧解析展示图。
 */
function collectDeliveryEntryPhotos(flowNodes) {
  const rows = []
  const seen = new Set()
  const push = (slot) => {
    if (!slot) return
    const rawUrl = typeof slot === 'string' ? slot : slot.url || slot.rawUrl || slot.src
    const url = text(rawUrl)
    if (!url) return
    const key = urlKey(url)
    if (!key || seen.has(key)) return
    seen.add(key)
    rows.push(typeof slot === 'object' ? { ...slot, url } : { url })
  }
  ;(Array.isArray(flowNodes) ? flowNodes : []).forEach((node) => {
    if (!node || text(node.kind) !== 'delivery_photos') return
    const payload = contentOfFlowNode(node)
    ;(Array.isArray(payload.acceptanceItems) ? payload.acceptanceItems : []).forEach((row) => {
      if (!row || typeof row !== 'object' || row.kind !== 'exterior') return
      ;(Array.isArray(row.images) ? row.images : []).forEach(push)
    })
  })
  return rows
}

/** 角色表 → Map(urlKey → { role, item }) */
function deliveryPhotoRoleMap(roles) {
  const map = new Map()
  const list = Array.isArray(roles)
    ? roles
    : roles && typeof roles === 'object'
      ? Object.entries(roles).map(([url, value]) => ({
          url,
          role: value && typeof value === 'object' ? value.role : value,
          item: value && typeof value === 'object' ? value.item : '',
        }))
      : []
  list.forEach((row) => {
    if (!row || typeof row !== 'object') return
    const key = urlKey(row.url)
    const role = text(row.role)
    if (!key || !Object.values(DELIVERY_PHOTO_ROLE).includes(role)) return
    map.set(key, { role, item: text(row.item) })
  })
  return map
}

/**
 * 模型原始输出 → 落库角色表。
 * raw：`[{ 图: 1, 归属: '施工', 项目: '更换刹车片' }, …]`
 * photos：候选图（顺序即「图N」）
 * allowedItems：模型可选的项目名（施工章项目 + 报价行）；不在名单内的项目名丢弃
 */
function normalizeDeliveryPhotoRoles(raw, photos, allowedItems) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw && raw.photos) ? raw.photos : []
  const candidates = (Array.isArray(photos) ? photos : []).filter(Boolean)
  const allowed = new Set(
    (Array.isArray(allowedItems) ? allowedItems : []).map((name) => nameKey(name)).filter(Boolean),
  )
  const out = []
  const seen = new Set()
  list.forEach((row) => {
    if (!row || typeof row !== 'object') return
    const index = Number(row['图'] || row.index || row.slot || row.n)
    const photo = Number.isFinite(index) && index > 0 ? candidates[index - 1] : null
    if (!photo) return
    const key = urlKey(photo.url)
    if (!key || seen.has(key)) return
    const roleLabel = text(row['归属'] || row.role || row.kind)
    const role = ROLE_LABEL_MAP[roleLabel] || ''
    if (!role) return
    const rawItem = text(row['项目'] || row.item || row.partName)
    const item = rawItem && allowed.has(nameKey(rawItem)) ? rawItem : ''
    seen.add(key)
    out.push({ url: text(photo.url), role, item })
  })
  return out
}

/** 从相册 hostMeta 读判定结果（已公开优先，其次托管草稿） */
function readHostDeliveryPhotoRoles(album) {
  const pkg =
    album && album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? album.contentPackageJson
      : {}
  const meta = pkg.hostMeta && typeof pkg.hostMeta === 'object' ? pkg.hostMeta : {}
  const layers = [meta.geoLayer, meta.geoDraft]
  for (const layer of layers) {
    if (layer && Array.isArray(layer.deliveryPhotoRoles) && layer.deliveryPhotoRoles.length) {
      return layer.deliveryPhotoRoles
    }
  }
  return []
}

/** 判定为施工证据的交车图（保留原槽位与对应项目名） */
function deliveryWorkPhotoSlots(flowNodes, roles) {
  const roleMap = deliveryPhotoRoleMap(roles)
  if (!roleMap.size) return []
  return collectDeliveryEntryPhotos(flowNodes)
    .map((slot) => {
      const hit = roleMap.get(urlKey(slot.url))
      if (!hit || hit.role !== DELIVERY_PHOTO_ROLE.WORK) return null
      return { slot, item: hit.item }
    })
    .filter(Boolean)
}

module.exports = {
  DELIVERY_PHOTO_ROLE,
  collectDeliveryEntryPhotos,
  deliveryPhotoRoleMap,
  normalizeDeliveryPhotoRoles,
  readHostDeliveryPhotoRoles,
  deliveryWorkPhotoSlots,
}
