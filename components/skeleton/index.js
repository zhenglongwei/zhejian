Component({
  properties: {
    rows: { type: Number, value: 3 },
    title: { type: Boolean, value: true },
    avatar: { type: Boolean, value: false },
    /** default 通用 · album 档案纸底骨架色 */
    theme: {
      type: String,
      value: 'default',
    },
    /** default 行骨架 · album-card 相册列表加高卡 */
    variant: {
      type: String,
      value: 'default',
    },
  },
  data: {
    rowList: [0, 1, 2],
  },
  observers: {
    rows(n) {
      this.setData({ rowList: Array.from({ length: n }, (_, i) => i) })
    },
  },
  lifetimes: {
    attached() {
      const n = this.properties.rows
      this.setData({ rowList: Array.from({ length: n }, (_, i) => i) })
    },
  },
})
