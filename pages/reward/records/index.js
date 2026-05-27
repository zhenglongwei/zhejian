/** V1 奖励记录 → V2 我的（R8） */
const { redirectLegacyRewardPage } = require('../../../utils/legacy-redirect')

Page({
  onLoad() {
    redirectLegacyRewardPage()
  },
})
