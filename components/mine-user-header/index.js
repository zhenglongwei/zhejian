const {
  TOOL_GUEST_LOGIN_TITLE,
  TOOL_GUEST_LOGIN_DESC,
  TOOL_GUEST_LOGIN_BUTTON,
} = require('../../constants/tool-login-copy')

Component({
  properties: {
    isLoggedIn: {
      type: Boolean,
      value: false,
    },
    user: {
      type: Object,
      value: null,
    },
  },

  data: {
    guestTitle: TOOL_GUEST_LOGIN_TITLE,
    guestDesc: TOOL_GUEST_LOGIN_DESC,
    guestLoginButton: TOOL_GUEST_LOGIN_BUTTON,
  },

  methods: {
    onUserAreaTap() {
      this.triggerEvent('usertap')
    },

    onLoginTap() {
      this.triggerEvent('logintap')
    },

    onBindPhoneTap() {
      this.triggerEvent('bindphonetap')
    },
  },
})
