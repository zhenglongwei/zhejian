const { ALBUM_STATUS } = require('../constants/album')
const {
  CASE_SOURCE,
  CASE_SOURCE_LABEL,
  CASE_SOURCE_TAG_VARIANT,
} = require('../constants/case-source')

const MAX_TAGS = 3
const PLACEHOLDER_VEHICLES = ['车辆（待脱敏）', '车辆（请填写车型）', '车辆']

function hasAlbumImages(album) {
  return (album.nodes || []).some((n) => (n.images || []).length > 0)
}

function normalizeVehicleText(text) {
  const v = (text || '').trim()
  if (!v || PLACEHOLDER_VEHICLES.indexOf(v) >= 0) return '未填写车型'
  return v
}

/** 商家相册列表标题（草稿不展示「待脱敏」占位） */
function buildAlbumListTitle(album) {
  const vehicle = normalizeVehicleText(album.vehicleText)
  const service = album.serviceName || '维修案例'
  const built = `${vehicle} · ${service}`
  if (album.title && album.title.indexOf('待脱敏') === -1) {
    return album.title
  }
  return built
}

/**
 * 商家端列表 Tag：随相册状态变化，禁止草稿展示「已审核」
 */
function buildAlbumListTags(album) {
  const tags = [
    {
      variant: CASE_SOURCE_TAG_VARIANT[CASE_SOURCE.MERCHANT_HISTORY] || 'history',
      text: CASE_SOURCE_LABEL[CASE_SOURCE.MERCHANT_HISTORY] || '商家历史案例',
    },
  ]

  const status = album.status || ALBUM_STATUS.DRAFT

  if (status === ALBUM_STATUS.DRAFT) {
    if (album.maskingConfirmed) {
      tags.push({ variant: 'desensitized', text: '已脱敏' })
      tags.push({ variant: 'warning', text: '待提交审核' })
    } else if (hasAlbumImages(album)) {
      tags.push({ variant: 'warning', text: '待脱敏' })
    } else {
      tags.push({ variant: 'warning', text: '草稿' })
    }
    return tags.slice(0, MAX_TAGS)
  }

  if (status === ALBUM_STATUS.PENDING_REVIEW) {
    tags.push({ variant: 'desensitized', text: '已脱敏' })
    tags.push({ variant: 'warning', text: '待审核' })
    return tags.slice(0, MAX_TAGS)
  }

  if (status === ALBUM_STATUS.APPROVED) {
    tags.push({ variant: 'desensitized', text: '已脱敏' })
    tags.push({ variant: 'audited', text: '已审核' })
  }

  if (status === ALBUM_STATUS.REJECTED) {
    tags.push({ variant: 'danger', text: '已驳回' })
  }

  return tags.slice(0, MAX_TAGS)
}

/** 商家列表封面：仅脱敏确认后用脱敏图，否则不展示原图缩略 */
function pickAlbumListCover(album) {
  if (album.maskingConfirmed && album.coverImageDesensitized) {
    return album.coverImageDesensitized
  }
  return ''
}

module.exports = {
  buildAlbumListTitle,
  buildAlbumListTags,
  pickAlbumListCover,
  normalizeVehicleText,
}
