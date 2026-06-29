/** 车主服务评价 · 维修服务 + 相册记录 */

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

const ALL_REVIEW_DIMENSIONS = [...REPAIR_REVIEW_DIMENSIONS, ...ALBUM_REVIEW_DIMENSIONS]

function emptyAlbumReviewScores() {
  return ALL_REVIEW_DIMENSIONS.reduce((acc, dim) => {
    acc[dim.key] = 0
    return acc
  }, {})
}

module.exports = {
  REPAIR_REVIEW_DIMENSIONS,
  ALBUM_REVIEW_DIMENSIONS,
  ALBUM_REVIEW_GROUPS,
  ALL_REVIEW_DIMENSIONS,
  emptyAlbumReviewScores,
}
