const {
  REPAIR_REVIEW_DIMENSIONS,
  ALBUM_REVIEW_DIMENSIONS,
} = require('../constants/album-review-dimensions')

const STAR_FULL = '★'
const STAR_EMPTY = '☆'
const STAR_MAX = 5

/** 将 0-5 的分数渲染为 5 个星号字符串，如 4 → '★★★★☆' */
function renderStarsText(score) {
  const n = Math.round(Number(score) || 0)
  const full = Math.max(0, Math.min(STAR_MAX, n))
  return STAR_FULL.repeat(full) + STAR_EMPTY.repeat(STAR_MAX - full)
}

/** H5 用：返回带 class 的星级 HTML 片段 */
function renderStarsHtml(score) {
  const text = renderStarsText(score)
  return '<span class="h5-stars">' + text + '</span>'
}

/** 维度评分带维度名的展示文本，如 '维修服务 ★★★★★' */
function formatDimensionScore(label, score) {
  return label + ' ' + renderStarsText(score)
}

function calcGroupScore(scores, dimensions) {
  const values = dimensions
    .map((d) => Number(scores[d.key]) || 0)
    .filter((v) => v > 0)
  if (!values.length) return 0
  const sum = values.reduce((a, b) => a + b, 0)
  return Math.round((sum / values.length) * 10) / 10
}

function calcRepairScore(scores = {}) {
  return calcGroupScore(scores, REPAIR_REVIEW_DIMENSIONS)
}

function calcAlbumScore(scores = {}) {
  return calcGroupScore(scores, ALBUM_REVIEW_DIMENSIONS)
}

function calcOverallScore(scores = {}) {
  const repair = calcRepairScore(scores)
  const album = calcAlbumScore(scores)
  if (!repair && !album) return 0
  if (!repair) return album
  if (!album) return repair
  return Math.round(((repair + album) / 2) * 10) / 10
}

module.exports = {
  renderStarsText,
  renderStarsHtml,
  formatDimensionScore,
  calcRepairScore,
  calcAlbumScore,
  calcOverallScore,
}
