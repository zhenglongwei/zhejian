/**
 * 服务相册模板选项 — 对齐 backend service-album-node-template
 */
const { ENV } = require('./config')
const { get } = require('./request')
const {
  SERVICE_ALBUM_NODE_TITLES,
  buildTemplateNodeTitleList,
} = require('../constants/service-album-node-templates')

const MOCK_TEMPLATE_OPTIONS = [
  { id: 'maintenance', name: '小保养' },
  { id: 'major_maintenance', name: '大保养' },
  { id: 'brake', name: '刹车片/刹车盘' },
  { id: 'battery', name: '电瓶更换' },
  { id: 'tire', name: '轮胎更换' },
  { id: 'ac', name: '空调服务' },
  { id: 'body_paint', name: '钣喷修复' },
  { id: 'accident', name: '事故车维修' },
]

const MOCK_TEMPLATE_NODE_TITLES = Object.keys(SERVICE_ALBUM_NODE_TITLES).reduce((acc, key) => {
  if (key === 'default') return acc
  acc[key] = buildTemplateNodeTitleList(key)
  return acc
}, {})

async function fetchServiceAlbumTemplateOptions() {
  if (ENV.mode === 'mock') {
    return MOCK_TEMPLATE_OPTIONS.slice()
  }
  const data = await get('/merchant/service-albums/templates')
  return data.list || []
}

module.exports = {
  fetchServiceAlbumTemplateOptions,
  MOCK_TEMPLATE_OPTIONS,
  MOCK_TEMPLATE_NODE_TITLES,
}
