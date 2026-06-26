/**
 * 公开深链页展示辅助（与 backend PublicPageSections 同序）
 */

function buildCertRows(certifications) {
  return (certifications || []).map((item) => ({
    label: item.label,
    value: item.text || '—',
  }))
}

function buildTransparencyMetrics(transparency) {
  if (!transparency) return []
  const cells = []
  if (transparency.caseCount > 0) {
    cells.push({ num: String(transparency.caseCount), label: '公开案例' })
  }
  if (transparency.albumCompleteRate != null && transparency.albumCompleteRate > 0) {
    cells.push({ num: `${transparency.albumCompleteRate}%`, label: '相册完整率' })
  }
  if (transparency.score > 0) {
    cells.push({ num: String(transparency.score), label: '透明度评分' })
  }
  if (transparency.serviceCount > 0) {
    cells.push({ num: String(transparency.serviceCount), label: '可预约服务' })
  }
  return cells
}

const TRANSPARENCY_BREAKDOWN_META = {
  album: { label: '相册完整率', max: 30, hint: '服务相册六阶段节点完成比例' },
  case: { label: '公开案例', max: 25, hint: '已审核脱敏案例数量' },
  serviceProfile: { label: '服务资料', max: 15, hint: '上架服务的名称、摘要、封面与价格' },
  qualification: { label: '资质认证', max: 15, hint: '营业执照与维修资质证照' },
  leadResponse: { label: '咨询响应', max: 15, hint: '近7日咨询回复情况' },
}

const TRANSPARENCY_METHODOLOGY =
  '满分100分，由公开案例(25)、相册完整率(30)、服务资料(15)、资质认证(15)、咨询响应(15)加权计算；数据按日更新。'

function buildTransparencyExplain(transparency) {
  if (!transparency) {
    return { rows: [], methodology: TRANSPARENCY_METHODOLOGY, asOfDate: '' }
  }
  const breakdown = transparency.breakdown || {}
  const rows = Object.keys(TRANSPARENCY_BREAKDOWN_META)
    .filter((key) => breakdown[key] != null)
    .map((key) => {
      const meta = TRANSPARENCY_BREAKDOWN_META[key]
      return {
        key,
        label: meta.label,
        score: breakdown[key],
        max: meta.max,
        hint: meta.hint,
      }
    })
  return {
    rows,
    methodology: transparency.methodology || TRANSPARENCY_METHODOLOGY,
    asOfDate: transparency.asOfDate || '',
  }
}

module.exports = {
  buildCertRows,
  buildTransparencyMetrics,
  buildTransparencyExplain,
  TRANSPARENCY_METHODOLOGY,
}
