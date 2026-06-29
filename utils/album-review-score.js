const {
  REPAIR_REVIEW_DIMENSIONS,
  ALBUM_REVIEW_DIMENSIONS,
} = require('../constants/album-review-dimensions')

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
  calcRepairScore,
  calcAlbumScore,
  calcOverallScore,
}
