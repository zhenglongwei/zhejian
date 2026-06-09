const {
  PLATFORM_SUPPORT_SCOPE,
  PLATFORM_SUPPORT_PHONE,
  PLATFORM_SUPPORT_EMAIL,
  PLATFORM_SUPPORT_HOURS,
} = require('../constants/support-contact')

function copyText(data, toastTitle) {
  wx.setClipboardData({
    data,
    success: () => {
      wx.showToast({
        title: toastTitle || '已复制',
        icon: 'none',
        duration: 2500,
      })
    },
  })
}

function showSupportActionSheet() {
  const actions = []
  if (PLATFORM_SUPPORT_PHONE) {
    actions.push({ key: 'phone', label: `拨打 ${PLATFORM_SUPPORT_PHONE}` })
  }
  if (PLATFORM_SUPPORT_EMAIL) {
    actions.push({ key: 'email', label: '复制客服邮箱' })
  }
  actions.push({ key: 'copyScope', label: '复制问题说明模板' })

  wx.showActionSheet({
    itemList: actions.map((item) => item.label),
    success: (res) => {
      const action = actions[res.tapIndex]
      if (!action) return
      if (action.key === 'phone') {
        wx.makePhoneCall({ phoneNumber: String(PLATFORM_SUPPORT_PHONE).replace(/-/g, '') })
        return
      }
      if (action.key === 'email') {
        copyText(PLATFORM_SUPPORT_EMAIL, '客服邮箱已复制')
        return
      }
      if (action.key === 'copyScope') {
        copyText(`【辙见客服咨询】\n${PLATFORM_SUPPORT_SCOPE}`, '说明模板已复制')
      }
    },
  })
}

/** 我的页 · 联系客服（P0-6） */
function openPlatformSupportContact() {
  const hoursLine = PLATFORM_SUPPORT_HOURS ? `\n\n服务时段：${PLATFORM_SUPPORT_HOURS}` : ''
  wx.showModal({
    title: '联系客服',
    content: `${PLATFORM_SUPPORT_SCOPE}${hoursLine}`,
    confirmText: '联系方式',
    cancelText: '知道了',
    success: (res) => {
      if (res.confirm) showSupportActionSheet()
    },
    fail: () => {
      showSupportActionSheet()
    },
  })
}

module.exports = {
  openPlatformSupportContact,
}
