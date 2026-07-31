/** 车主服务评价 · 维修服务 + 相册记录（首屏两域一星，细项仍四维） */

const REPAIR_REVIEW_DIMENSIONS = [
  { key: 'repairAttitude', label: '服务态度', hint: '沟通是否尊重、及时、耐心' },
  { key: 'repairTrust', label: '专业可靠', hint: '诊断与施工是否让人放心' },
]

const ALBUM_REVIEW_DIMENSIONS = [
  {
    key: 'albumSufficiency',
    label: '过程记录是否充分',
    hint: '关键节点是否都有，且图片能否说明当时车况',
  },
  { key: 'albumClarity', label: '图文是否清楚', hint: '照片能否看清，说明能否读懂' },
]

const ALBUM_REVIEW_GROUPS = [
  { key: 'repair', title: '维修服务', dimensions: REPAIR_REVIEW_DIMENSIONS },
  { key: 'album', title: '相册记录', dimensions: ALBUM_REVIEW_DIMENSIONS },
]

/** 首屏：两域各一星，写入时同步同域细项 */
const DOMAIN_REVIEW_DIMENSIONS = [
  {
    key: 'repairDomain',
    label: '维修服务',
    hint: '态度与专业是否让人放心',
    mapsTo: ['repairAttitude', 'repairTrust'],
  },
  {
    key: 'albumDomain',
    label: '过程相册',
    hint: '记录是否充分、图文是否清楚',
    mapsTo: ['albumSufficiency', 'albumClarity'],
  },
]

const ALL_REVIEW_DIMENSIONS = [...REPAIR_REVIEW_DIMENSIONS, ...ALBUM_REVIEW_DIMENSIONS]

function emptyAlbumReviewScores() {
  return ALL_REVIEW_DIMENSIONS.reduce((acc, dim) => {
    acc[dim.key] = 0
    return acc
  }, {})
}

function domainScoresFromDetail(scores = {}) {
  return {
    repairDomain: Number(scores.repairAttitude) || Number(scores.repairTrust) || 0,
    albumDomain: Number(scores.albumSufficiency) || Number(scores.albumClarity) || 0,
  }
}

function applyDomainScore(scores = {}, domainKey, value) {
  const domain = DOMAIN_REVIEW_DIMENSIONS.find((item) => item.key === domainKey)
  if (!domain) return { ...scores }
  const next = { ...scores }
  const star = Number(value) || 0
  domain.mapsTo.forEach((key) => {
    next[key] = star
  })
  return next
}

module.exports = {
  REPAIR_REVIEW_DIMENSIONS,
  ALBUM_REVIEW_DIMENSIONS,
  ALBUM_REVIEW_GROUPS,
  DOMAIN_REVIEW_DIMENSIONS,
  ALL_REVIEW_DIMENSIONS,
  emptyAlbumReviewScores,
  domainScoresFromDetail,
  applyDomainScore,
}
