/**
 * 商家员工（极简：管理员邀请 / 员工同权）
 * API: GET/POST /api/v1/merchant/staff*
 */
const { ENV } = require('./config')
const { get, post } = require('./request')

async function fetchMerchantStaffList() {
  if (ENV.mode === 'mock') {
    return {
      list: [
        {
          id: 'staff_mock_owner',
          userId: 'user_demo_1',
          role: 'owner',
          roleLabel: '管理员',
          nickname: '演示管理员',
          phoneDisplay: '138****0001',
          isSelf: true,
          canRemove: false,
        },
      ],
      maxStaff: 8,
      memberCount: 0,
    }
  }
  return get('/merchant/staff')
}

async function inviteMerchantStaff(phone) {
  if (ENV.mode === 'mock') {
    return {
      item: {
        id: 'staff_mock_new',
        role: 'staff',
        roleLabel: '员工',
        nickname: '新员工',
        phoneDisplay: String(phone).replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
        canRemove: true,
      },
      hint: '已登记手机号；对方用该号登录并绑定手机后，在「我的」进入商家工作台',
    }
  }
  return post('/merchant/staff/invite', { phone })
}

async function removeMerchantStaff(staffId) {
  if (ENV.mode === 'mock') {
    return { ok: true }
  }
  return post(`/merchant/staff/${staffId}/remove`, {})
}

module.exports = {
  fetchMerchantStaffList,
  inviteMerchantStaff,
  removeMerchantStaff,
}
