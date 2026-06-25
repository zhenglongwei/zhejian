const { TOOL_GUEST_LOGIN_BUTTON } = require('../../constants/tool-login-copy')
const {
  normalizeStoredImageUrl,
  isLocalTempImagePath,
} = require('../../utils/media-upload')
const { resolveImageSrc } = require('../../utils/desensitize-url')

function resolveDisplayAvatarUrl(rawAvatar) {
  if (!rawAvatar) return ''
  if (isLocalTempImagePath(rawAvatar)) return rawAvatar
  return resolveImageSrc(rawAvatar) || normalizeStoredImageUrl(rawAvatar)
}

Component({
  properties: {
    variant: {
      type: String,
      value: 'profile',
    },
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
    vehicleSummary: {
      type: String,
      value: '',
    },
  },

  data: {
    guestLoginButton: TOOL_GUEST_LOGIN_BUTTON,
    nicknameInput: '',
    displayNickname: '',
    displayAvatarUrl: '',
    localAvatarPreview: '',
  },

  observers: {
    'user, avatarPreview, localAvatarPreview': function syncUser(
      user,
      avatarPreview,
      localAvatarPreview,
    ) {
      const nickname = (user && user.nickname) || ''
      const rawAvatar =
        localAvatarPreview || avatarPreview || (user && user.avatarUrl) || ''
      const avatarUrl = resolveDisplayAvatarUrl(rawAvatar)
      const patch = {
        nicknameInput: nickname,
        displayNickname: nickname || '微信用户',
        displayAvatarUrl: avatarUrl,
      }
      if (
        localAvatarPreview &&
        !avatarPreview &&
        user &&
        user.avatarUrl &&
        !isLocalTempImagePath(user.avatarUrl)
      ) {
        patch.localAvatarPreview = ''
      }
      this._savedNickname = nickname
      this.setData(patch)
    },
  },

  methods: {
    clearLocalAvatarPreview() {
      const user = this.properties.user
      const avatarUrl = resolveDisplayAvatarUrl((user && user.avatarUrl) || '')
      this.setData({
        localAvatarPreview: '',
        displayAvatarUrl: avatarUrl,
      })
    },

    onLoginTap() {
      this.triggerEvent('logintap')
    },

    onHubTap() {
      if (!this.properties.isLoggedIn) {
        this.onLoginTap()
        return
      }
      this.triggerEvent('profiletap')
    },

    onBindPhoneTap() {
      this.triggerEvent('bindphonetap')
    },

    onChooseAvatar(e) {
      const tempPath = (e.detail && e.detail.avatarUrl) || ''
      if (!tempPath) return

      this.setData({
        localAvatarPreview: tempPath,
        displayAvatarUrl: tempPath,
      })

      const page = getCurrentPages().slice(-1)[0]
      if (page && typeof page.markAvatarPicking === 'function') {
        page.markAvatarPicking(tempPath)
      }

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
