Component({
  properties: {
    rows: { type: Number, value: 3 },
    title: { type: Boolean, value: true },
    avatar: { type: Boolean, value: false },
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
