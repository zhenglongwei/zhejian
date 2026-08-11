/**
 * Parse docs/04_维修过程相册/17_服务类目检测清单.md → catalog data module
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '../..')
const mdPath = path.join(root, 'docs/04_维修过程相册/17_服务类目检测清单.md')
const outPath = path.join(__dirname, '../src/constants/service-checklist-catalog-data.js')

const md = fs.readFileSync(mdPath, 'utf8')

const stageMap = { 接车: 'stage_1', 检测: 'stage_2', 施工: 'stage_5', 完工: 'stage_6' }
const strengthMap = { 强烈建议: 'strong', 建议: 'tip' }

function parseItems(sectionText) {
  const items = []
  const lines = String(sectionText || '').split(/\r?\n/)
  for (const line of lines) {
    if (!line.startsWith('| `')) continue
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length - 1)
    if (cells.length < 6) continue
    const key = cells[0].replace(/^`|`$/g, '')
    if (!key || key === 'itemKey') continue
    const suggestStageId = stageMap[cells[2]] || 'stage_2'
    items.push({
      itemKey: key,
      label: cells[1],
      suggestStageId,
      /** 施工阶段项 = 待处理衍生项，不常驻节点清单 */
      workOnly: suggestStageId === 'stage_5',
      group: cells[3] || '',
      noteExample: cells[4] || '',
      strength: strengthMap[cells[5]] || 'tip',
      linkHint: cells[6] || '',
    })
  }
  return items
}

const sections = {}
const re = /### 5\.(\d+)[^\n]*\n([\s\S]*?)(?=\n### 5\.|\n## 6\.|$)/g
let m
while ((m = re.exec(md))) {
  sections[m[1]] = m[2]
}

const maintenanceBase = parseItems(sections['1'] || '')
const majorSection = sections['2'] || ''
const majorIdx = majorSection.indexOf('#### 5.2.1')
const majorDeltaOnly = parseItems(majorIdx >= 0 ? majorSection.slice(majorIdx) : majorSection)

const map = {
  maintenance: {
    categoryId: 'maintenance',
    label: '小保养',
    inheritsFrom: null,
    items: maintenanceBase,
  },
  major_maintenance: {
    categoryId: 'major_maintenance',
    label: '大保养',
    inheritsFrom: 'maintenance',
    items: majorDeltaOnly,
  },
  brake: {
    categoryId: 'brake',
    label: '刹车片/刹车盘',
    inheritsFrom: null,
    items: parseItems(sections['3'] || ''),
  },
  battery: {
    categoryId: 'battery',
    label: '电瓶更换',
    inheritsFrom: null,
    items: parseItems(sections['4'] || ''),
  },
  tire: {
    categoryId: 'tire',
    label: '轮胎更换',
    inheritsFrom: null,
    items: parseItems(sections['5'] || ''),
  },
  ac: {
    categoryId: 'ac',
    label: '空调服务',
    inheritsFrom: null,
    items: parseItems(sections['6'] || ''),
  },
  body_paint: {
    categoryId: 'body_paint',
    label: '钣喷修复',
    inheritsFrom: null,
    items: parseItems(sections['7'] || ''),
  },
  accident: {
    categoryId: 'accident',
    label: '事故车维修',
    inheritsFrom: null,
    items: parseItems(sections['8'] || ''),
  },
  default: {
    categoryId: 'default',
    label: '通用',
    inheritsFrom: null,
    items: parseItems(sections['9'] || ''),
  },
  chassis_noise: {
    categoryId: 'chassis_noise',
    label: '底盘异响/胶套',
    inheritsFrom: null,
    items: parseItems(sections['10'] || ''),
  },
}

for (const [k, v] of Object.entries(map)) {
  console.log(k, v.items.length)
}

const out =
  '/** Auto-generated from 17_服务类目检测清单.md — re-run: node backend/scripts/gen-checklist-catalog.js */\n' +
  "const CATALOG_VERSION = '2026-08-11-followup'\n\n" +
  `const CATEGORIES = ${JSON.stringify(map, null, 2)}\n\n` +
  'module.exports = { CATALOG_VERSION, CATEGORIES }\n'

fs.writeFileSync(outPath, out)
console.log('wrote', outPath)
