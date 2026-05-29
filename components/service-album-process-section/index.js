Component({
  properties: {
    title: {
      type: String,
      value: '过程记录',
    },
    nodes: {
      type: Array,
      value: [],
    },
    storeNote: {
      type: String,
      value: '',
    },
    emptyText: {
      type: String,
      value: '该节点暂无图片',
    },
    footerBannerText: {
      type: String,
      value: '',
    },
  },
})
