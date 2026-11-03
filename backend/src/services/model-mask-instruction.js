/**
 * 各节点看图 AI 共用的 masks 要求（接车 / 检测 / 施工 / 交车 / 节点审核）。
 * 有图须带；没看过的图不要写入；空 regions 表示模型看过且无敏感区。
 */
const MODEL_MASKS_INSTRUCTION =
  '另带 masks。框出车牌、车架号、人脸、手机号、姓名、证件。kind 只用 plate、vin、face、phone、name、document。imageSlot 用附图图号（从 1 起）。regions 的 left、top、width、height 是相对整张图的 0 到 1。没有遮挡就给该图空 regions；没看过的图不要写进 masks。'

module.exports = {
  MODEL_MASKS_INSTRUCTION,
}
