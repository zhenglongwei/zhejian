const { wechatLogin, bindPhone } = require('../../services/user')
const { getSession } = require('../../utils/auth')

const COPY = {
  login: {
    title: '登录',
    description: '登录后可查看你的订单、车辆和维修档案。',
    primary: '微信一键登录',
  },
  bindPhone: {
    title: '绑定手机号',
    description: '绑定手机号后可下单、预约和接收服务通知。',
    primary: '绑定手机号',
  },
  bindPhoneOrder: {
    title: '绑定手机号',
    description: '为方便门店确认预约和服务，请先绑定手机号。',
    primary: '绑定手机号',
  },
}

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
    mode: {
      type: String,
      value: 'login',
    },
    title: {
      type: String,
      value: '',
    },
    description: {
      type: String,
      value: '',
    },
    showAgreement: {
      type: Boolean,
      value: true,
    },
    maskClosable: {
      type: Boolean,
      value: true,
    },
    /** 绑手机场景：general | order */
    bindContext: {
      type: String,
      value: 'general',
    },
  },

  data: {
    step: 'login',
    loading: false,
    errorMessage: '',
    agreed: false,
    displayTitle: '',
    displayDescription: '',
    primaryLabel: '',
    needAgreement: false,
    dismissLabel: '暂不登录',
  },

  observers: {
    'visible, mode, title, description, bindContext'() {
      if (this.properties.visible) {
        this.resetDisplay()
      }
    },
  },

  methods: {
    resolveStep() {
      const { mode } = this.properties
      const session = getSession()
      if (mode === 'login') return 'login'
      if (mode === 'bindPhone') {
        if (!session.token) return 'login'
        return 'bindPhone'
      }
      if (!session.token) return 'login'
      if (!(session.user && session.user.isPhoneBound)) return 'bindPhone'
      return 'login'
    },

    resetDisplay() {
      const step = this.resolveStep()
      const { title, description, showAgreement, bindContext } = this.properties
      const copyKey =
        step === 'bindPhone' && bindContext === 'order'
          ? 'bindPhoneOrder'
          : step
      const copy = COPY[copyKey] || COPY.login
      const needAgreement = showAgreement && step === 'login'

      this.setData({
        step,
        loading: false,
        errorMessage: '',
        agreed: !needAgreement,
        displayTitle: title || copy.title,
        displayDescription: description || copy.description,
        primaryLabel: copy.primary,
        needAgreement,
        dismissLabel: step === 'bindPhone' ? '暂不绑定' : '暂不登录',
      })
    },

    onMaskTap() {
      if (!this.properties.maskClosable || this.data.loading) return
      this.triggerEvent('close')
      this.triggerEvent('cancel')
    },

    noop() {},

    onDismiss() {
      if (this.data.loading) return
      this.triggerEvent('close')
      this.triggerEvent('cancel')
    },

    toggleAgreement() {
      this.setData({ agreed: !this.data.agreed })
    },

    onAgreementLinkTap(e) {
      const { type } = e.currentTarget.dataset
      const label = type === 'privacy' ? '隐私政策' : '用户协议'
      wx.showToast({ title: `${label}页将在后续版本开放`, icon: 'none' })
    },

    async onWechatLoginTap() {
      if (this.data.loading) return
      if (this.data.needAgreement && !this.data.agreed) {
        this.setData({ errorMessage: '请先阅读并同意用户协议与隐私政策' })
        return
      }

      this.setData({ loading: true, errorMessage: '' })
      try {
        const { user } = await wechatLogin()
        this.setData({ loading: false })
        this.triggerEvent('success', { user, step: 'login' })

        const nextStep = this.resolveStepAfterLogin(user)
        if (
          nextStep === 'bindPhone' &&
          (this.properties.mode === 'auto' || this.properties.mode === 'bindPhone')
        ) {
          this.setData({
            step: 'bindPhone',
            displayTitle: COPY.bindPhone.title,
            displayDescription:
              this.properties.bindContext === 'order'
                ? COPY.bindPhoneOrder.description
                : COPY.bindPhone.description,
            primaryLabel: COPY.bindPhone.primary,
            needAgreement: false,
            agreed: true,
            dismissLabel: '暂不绑定',
          })
          return
        }
        this.triggerEvent('close')
      } catch (e) {
        this.setData({
          loading: false,
          errorMessage: (e && e.message) || '登录失败，请稍后重试',
        })
        this.triggerEvent('fail', {
          step: 'login',
          message: (e && e.message) || '登录失败',
        })
      }
    },

    resolveStepAfterLogin(user) {
      if (!(user && user.isPhoneBound)) return 'bindPhone'
      return 'login'
    },

    async onGetPhoneNumber(e) {
      if (this.data.loading) return
      const detail = e.detail || {}

      if (detail.errMsg && detail.errMsg.indexOf('deny') !== -1) {
        wx.showToast({ title: '你已取消授权，可稍后再登录。', icon: 'none' })
        this.triggerEvent('fail', { step: 'bindPhone', message: 'cancelled' })
        return
      }

      this.setData({ loading: true, errorMessage: '' })
      try {
        const user = await bindPhone(detail)
        this.setData({ loading: false })
        this.triggerEvent('success', { user, step: 'bindPhone' })
        this.triggerEvent('close')
      } catch (err) {
        this.setData({
          loading: false,
          errorMessage: (err && err.message) || '手机号绑定失败，请重试。',
        })
        this.triggerEvent('fail', {
          step: 'bindPhone',
          message: (err && err.message) || 'bind failed',
        })
      }
    },
  },
})
