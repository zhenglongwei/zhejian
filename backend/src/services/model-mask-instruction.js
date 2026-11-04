/**
 * 各节点看图 AI 共用的 masks 要求（接车 / 检测 / 施工 / 交车 / 节点审核）。
 * 有图须带；没看过的图不要写入；空 regions 表示模型看过且无敏感区。
 * 强约束：漏图=整批重跑，成本高，所以「无隐私」也必须显式回空 regions，绝不许省略条目。
 */
const MODEL_MASKS_INSTRUCTION =
  '另带 masks。框出车牌、车架号、人脸、手机号、姓名、证件。kind 只用 plate、vin、face、phone、name、document。imageSlot 用附图图号（从 1 起）。regions 的 left、top、width、height 是相对整张图的 0 到 1。' +
  '硬性要求：masks 的条数必须等于附图张数，每张附图恰好一条，一条都不能省。' +
  '看完某张图没发现任何敏感区，也必须返回该图那条记录，regions 写空数组 []——空 regions 就是「已看、无隐私」的标记；漏掉任何一张图都算输出错误。' +
  '没看过的图不要写进 masks。'

module.exports = {
  MODEL_MASKS_INSTRUCTION,
}
