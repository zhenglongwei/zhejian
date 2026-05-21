const {
  CASE_SOURCE_LABEL,
  CASE_SOURCE_TAG_VARIANT,
} = require('../constants/case-source')

const MAX_TAGS = 3

/**
 * 案例卡片/详情标准标签行（来源 > 脱敏/审核；单卡 ≤3）
 * 仅用于已发布/用户端案例；商家相册草稿请用 buildAlbumListTags
 * 「价格仅供参考」由 PriceDisplay / ComplianceNotice 展示，不占 Tag 位
 */
function buildCaseTags(source, extra = []) {
  const tags = [
    {
      variant: CASE_SOURCE_TAG_VARIANT[source] || 'default',
      text: CASE_SOURCE_LABEL[source] || '',
    },
    { variant: 'desensitized', text: '已脱敏' },
    { variant: 'audited', text: '已审核' },
  ]
  extra.forEach((t) => {
    if (typeof t === 'string') {
      tags.push({ variant: 'info', text: t })
    } else if (t && t.text) {
      tags.push(t)
    }
  })
  return tags.filter((t) => t.text).slice(0, MAX_TAGS)
}

module.exports = { buildCaseTags }
