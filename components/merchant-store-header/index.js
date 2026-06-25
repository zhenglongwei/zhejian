Component({
  properties: {
    storeName: {
      type: String,
      value: '',
    },
    address: {
      type: String,
      value: '',
    },
    overviewLine: {
      type: String,
      value: '',
    },
    canSwitchStore: {
      type: Boolean,
      value: false,
    },
    switchingStore: {
      type: Boolean,
      value: false,
    },
    storeOptions: {
      type: Array,
      value: [],
    },
    storePickerIndex: {
      type: Number,
      value: 0,
    },
    showMessageEntry: {
      type: Boolean,
      value: true,
    },
    unreadBadgeText: {
      type: String,
      value: '',
    },
  },

  methods: {
    onStoreChange(e) {
      this.triggerEvent('storechange', { index: Number(e.detail.value) })
    },

    onMessageTap() {
      this.triggerEvent('messagetap')
    },
  },
})
