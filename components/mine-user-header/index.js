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
