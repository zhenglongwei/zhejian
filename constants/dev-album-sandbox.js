const { SERVICE_ALBUM_STAGES } = require('./service-album-stages')
const { enrichServiceAlbumListItem } = require('../utils/service-album-display')
const {
  buildAlbumFlipPages,
  buildAlbumNodeNotes,
} = require('../utils/album-flip-pages')

const DEMO_IMAGE = '/assets/home/store-cover-demo.jpg'

const SANDBOX_ALBUM_RAW = {
  albumId: 'alb_sandbox_demo',
  storeId: 'store_demo_001',
  storeName: '辙见演示门店',
  serviceName: '前刹车片更换',
  templateName: '制动保养',
  status: 'in_progress',
  publicCaseStatus: 'private',
  vehicle: { brand: '大众', series: '帕萨特', plateDisplay: '浙A****8' },
  createdAt: '2026-06-01T09:00:00.000Z',
  updatedAt: '2026-06-10T16:30:00.000Z',
  storeNote: '本次为前轮刹车片更换，含工时与配件。',
  summaryRows: [
    { label: '服务项目', value: '前刹车片更换' },
    { label: '车辆', value: '大众 帕萨特' },
    { label: '车牌', value: '浙A****8' },
  ],
  parts: [
    { name: '前刹车片', brand: '原厂配套', qty: '1 套' },
  ],
  nodes: [
    {
      id: 'stage_1',
      title: '接车记录',
      status: 'completed',
      images: [DEMO_IMAGE, DEMO_IMAGE],
      note: '进店外观与里程记录。',
      updatedAt: '2026-06-01T09:20:00.000Z',
    },
    {
      id: 'stage_2',
      title: '检测诊断',
      status: 'completed',
      images: [DEMO_IMAGE],
      note: '制动片磨损至报警线，建议更换。',
      updatedAt: '2026-06-01T10:00:00.000Z',
    },
    {
      id: 'stage_3',
      title: '方案与报价',
      status: 'completed',
      images: [],
      note: '更换前刹车片，参考费用 ¥680。',
      updatedAt: '2026-06-01T10:30:00.000Z',
    },
    {
      id: 'stage_4',
      title: '配件告知',
      status: 'completed',
      images: [DEMO_IMAGE],
      note: '已告知更换刹车片品牌与编码。',
      updatedAt: '2026-06-02T11:00:00.000Z',
    },
    {
      id: 'stage_5',
      title: '施工记录',
      status: 'completed',
      images: [DEMO_IMAGE, DEMO_IMAGE],
      note: '拆卸旧片、安装新片过程记录。',
      updatedAt: '2026-06-05T14:00:00.000Z',
    },
    {
      id: 'stage_6',
      title: '完工交付',
      status: 'completed',
      images: [DEMO_IMAGE],
      note: '试车正常，制动效果良好。',
      updatedAt: '2026-06-10T16:00:00.000Z',
    },
  ],
}

function buildStageProgress(chapters, activeNodeId) {
  const chapterByNode = {}
  ;(chapters || []).forEach((chapter) => {
    if (chapter && chapter.nodeId) chapterByNode[chapter.nodeId] = chapter
  })
  return SERVICE_ALBUM_STAGES.map((stage) => {
    const chapter = chapterByNode[stage.id]
    return {
      id: stage.id,
      title: stage.title,
      filled: Boolean(chapter),
      active: activeNodeId === stage.id,
      startIndex: chapter ? chapter.startIndex : 0,
    }
  })
}

function buildDevAlbumSandboxData() {
  const detail = { ...SANDBOX_ALBUM_RAW }
  const { pages, chapters } = buildAlbumFlipPages(detail.nodes)
  const activeNodeId = (chapters[0] && chapters[0].nodeId) || 'stage_1'
  const userCardItem = enrichServiceAlbumListItem(detail, {
    audience: 'user',
    listTab: 'all',
  })
  const merchantCardItem = enrichServiceAlbumListItem(detail, {
    audience: 'merchant',
  })
  const stageProgress = buildStageProgress(chapters, activeNodeId)
  const nodeNoteMap = {}
  ;(detail.nodes || []).forEach((node) => {
    const note = String((node && node.note) || '').trim()
    if (!note || !node.id) return
    nodeNoteMap[node.id] = note
  })

  return {
    detail,
    userCardItem,
    merchantCardItem,
    flipPages: pages,
    chapters,
    stageProgress,
    activeNodeId,
    activeStageTitle: (chapters[0] && chapters[0].title) || '接车记录',
    nodeNoteMap,
    infoSheet: {
      summaryRows: detail.summaryRows,
      parts: detail.parts,
      storeNote: detail.storeNote,
      nodeNotes: buildAlbumNodeNotes(detail.nodes),
      pageProgress: `1 / ${pages.length}`,
      aiSummary: '制动片磨损至报警线，已完成更换并试车正常。',
    },
    sampleNode: detail.nodes[1],
    demoImage: DEMO_IMAGE,
  }
}

module.exports = {
  DEMO_IMAGE,
  buildDevAlbumSandboxData,
}
