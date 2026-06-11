const { TOOL_GUEST_LOGIN_BUTTON } = require('../../constants/tool-login-copy')
const { normalizeStoredImageUrl } = require('../../utils/media-upload')

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
    avatarPreview: {
      type: String,
      value: '',
    },
  },

  data: {
    guestLoginButton: TOOL_GUEST_LOGIN_BUTTON,
    nicknameInput: '',
    displayAvatarUrl: '',
  },

  observers: {
    'user, avatarPreview': function syncUser(user, avatarPreview) {
      const nickname = (user && user.nickname) || ''
      const rawAvatar = avatarPreview || (user && user.avatarUrl) || ''
      const avatarUrl = rawAvatar ? normalizeStoredImageUrl(rawAvatar) : ''
      this._savedNickname = nickname
      this.setData({
        nicknameInput: nickname,
        displayAvatarUrl: avatarUrl,
      })
    },
  },

  methods: {
    onLoginTap() {
      this.triggerEvent('logintap')
    },

    onBindPhoneTap() {
      this.triggerEvent('bindphonetap')
    },

    onChooseAvatar(e) {
      const tempPath = (e.detail && e.detail.avatarUrl) || ''
      if (!tempPath) return
      this.setData({ displayAvatarUrl: tempPath })
      this.triggerEvent('avatarchoose', { tempPath })
    },

    onNicknameInput(e) {
      const value = (e.detail && e.detail.value) || ''
      this.setData({ nicknameInput: value })
    },

    onNicknameBlur(e) {
      const value = String((e.detail && e.detail.value) || '').trim()
      if (value === this._savedNickname) return
      this.triggerEvent('nicknamechange', { nickname: value })
    },
  },
})
