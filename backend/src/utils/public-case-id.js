/**
 * 公开案例主键：有库记录则沿用；否则与草稿 ID 同规则（case_ + 去掉 alb_ 的相册 id）
 */
function publicCaseIdForAlbum(albumId, existingId) {
  const existing = String(existingId || '').trim()
  if (existing) return existing
  return `case_${String(albumId || '').replace(/^alb_/, '')}`
}

module.exports = { publicCaseIdForAlbum }
