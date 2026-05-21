/**
 * 订单维修相册 — 展示辅助
 * 相册任务在正式进入服务流程后创建（mock：开始维修时 hasAlbum=true）
 */

function getOrderAlbumImageCount(order) {
  if (!order || !order.albumEntry) return 0
  return Number(order.albumEntry.imageCount) || 0
}

module.exports = {
  getOrderAlbumImageCount,
}
