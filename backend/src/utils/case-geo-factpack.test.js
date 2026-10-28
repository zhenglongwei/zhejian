/**
 * 案例原料包：七步单据链 → 大模型原料
 */
const assert = require('assert')
const {
  buildCaseFactPack,
  factPackHasEnoughFacts,
} = require('./case-geo-factpack')

function node(kind, extra = {}) {
  return { id: `fn_${kind}`, kind, title: kind, sortOrder: 0, ...extra }
}

/** 完整七步单据链 */
function fullFlowNodes() {
  return [
    node('intake', {
      photoDraft: { chiefComplaint: '过减速带时右前轮咯噔响，方向盘也有点抖' },
      document: { status: 'confirmed', payload: {} },
    }),
    node('inspection', {
      photoDraft: {
        findings: [
          {
            partName: '右前小吊杆球头',
            result: '需处理',
            advice: '球头松旷，胶套开裂',
            images: [{ url: 'https://x/insp1.jpg' }],
          },
          {
            partName: '右前减震器',
            result: '需关注',
            advice: '轻微渗油',
            images: [{ url: 'https://x/insp2.jpg' }],
          },
          { partName: '左前刹车片', result: '状态良好', advice: '无需处理', images: [] },
          { partName: '轮胎花纹', result: '仅记录', advice: '', images: [] },
        ],
      },
    }),
    node('inspection_report', {
      document: {
        status: 'delivered',
        payload: {
          chiefComplaint: '过减速带时右前轮咯噔响，方向盘也有点抖',
          mileageText: '里程 62000 km',
          vehicleBrand: '大众',
          vehicleSeries: '高尔夫',
          findings: [
            {
              partName: '右前小吊杆球头',
              result: '需处理',
              advice: '球头松旷，胶套开裂',
              images: [{ url: 'https://x/insp1.jpg' }],
            },
            {
              partName: '右前减震器',
              result: '需关注',
              advice: '轻微渗油',
              images: [{ url: 'https://x/insp2.jpg' }],
            },
            { partName: '左前刹车片', result: '状态良好', advice: '无需处理', images: [] },
            { partName: '轮胎花纹', result: '仅记录', advice: '', images: [] },
          ],
        },
      },
    }),
    node('quote_confirm', {
      document: {
        status: 'confirmed',
        payload: {
          lines: [{ name: '更换右前小吊杆', brand: '大众原厂', amount: 680, note: '含四轮定位' }],
        },
      },
    }),
    node('addon_quote_confirm', {
      document: {
        status: 'confirmed',
        payload: { lines: [{ name: '右前减震器渗油处理', amount: 220 }] },
      },
    }),
    node('work', {
      status: 'completed',
      photoDraft: {
        findings: [
          {
            partName: '更换右前小吊杆',
            caption: '旧件胶套已开裂，新件装复后复紧',
            outsideQuote: false,
            images: [{ url: 'https://x/work1.jpg' }],
          },
          {
            partName: '右前减震器渗油处理',
            caption: '擦净油渍后复检',
            outsideQuote: true,
            images: [{ url: 'https://x/work2.jpg' }],
          },
        ],
      },
      document: {
        status: 'completed',
        payload: {
          workItems: [
            {
              name: '更换右前小吊杆',
              note: '旧件胶套已开裂，新件装复后复紧',
              outsideQuote: false,
              images: [{ url: 'https://x/work1.jpg' }],
            },
            {
              name: '右前减震器渗油处理',
              note: '擦净油渍后复检',
              outsideQuote: true,
              images: [{ url: 'https://x/work2.jpg' }],
            },
          ],
        },
      },
    }),
    node('repair_report', {
      document: {
        status: 'confirmed',
        payload: {
          deliveryPhotos: [{ url: 'https://x/deliv1.jpg' }],
          warrantyPeriod: '12个月或2万公里',
          warrantyNotes: '含更换配件的质保，人为损坏除外',
          conclusion: '异响消除，方向盘抖动消失',
        },
      },
    }),
  ]
}

function testFullFlowExtractsAllFacts() {
  const pack = buildCaseFactPack(fullFlowNodes())
  assert.equal(pack.hasFlow, true)
  assert.ok(pack.chiefComplaint.includes('咯噔响'))
  assert.equal(pack.vehicle.brand, '大众')
  assert.equal(pack.vehicle.series, '高尔夫')
  assert.equal(pack.vehicle.mileageText, '里程 62000 km')
  assert.equal(pack.findings.length, 2, '四档里只留需处理与需关注')
  assert.equal(pack.quoteItems.length, 1)
  assert.equal(pack.addonQuoteItems.length, 1)
  assert.equal(pack.workItems.length, 2)
  assert.equal(pack.finish.conclusion, '异响消除，方向盘抖动消失')
  assert.equal(pack.finish.warrantyPeriod, '12个月或2万公里')
  assert.equal(pack.finish.deliveryPhotoCount, 1)
}

/** 状态良好、仅记录 不喂：写进去等于刷屏 */
function testDropsHealthyAndRecordOnly() {
  const pack = buildCaseFactPack(fullFlowNodes())
  const names = pack.findings.map((row) => row.partName)
  assert.ok(!names.includes('左前刹车片'), '状态良好不喂')
  assert.ok(!names.includes('轮胎花纹'), '仅记录不喂')
}

/** 藏价规则：方案行只取项目名，金额一律不入原料 */
function testNeverFeedsAmount() {
  const pack = buildCaseFactPack(fullFlowNodes())
  const serialized = JSON.stringify(pack)
  assert.ok(!serialized.includes('680'), '不得包含金额 680')
  assert.ok(!serialized.includes('220'), '不得包含金额 220')
  assert.deepEqual(pack.quoteItems, ['更换右前小吊杆'])
}

/** 增项标记必须保留（走原始 flowNodes 解析才有） */
function testKeepsOutsideQuoteFlag() {
  const pack = buildCaseFactPack(fullFlowNodes())
  const addon = pack.workItems.find((row) => row.name === '右前减震器渗油处理')
  assert.ok(addon, '应有增项工单项')
  assert.equal(addon.outsideQuote, true, '增项标记不得丢失')
  const normal = pack.workItems.find((row) => row.name === '更换右前小吊杆')
  assert.equal(normal.outsideQuote, false)
}

/** 无检测报告时，诉求回退到接车节点 */
function testChiefComplaintFallsBackToIntake() {
  const flow = fullFlowNodes().filter((row) => row.kind !== 'inspection_report')
  const pack = buildCaseFactPack(flow)
  assert.ok(pack.chiefComplaint.includes('咯噔响'), '诉求应回退到接车节点')
}

/** 无检测报告时，检测结论回退到检测节点 */
function testFindingsFallsBackToInspection() {
  const flow = fullFlowNodes().filter((row) => row.kind !== 'inspection_report')
  const pack = buildCaseFactPack(flow)
  assert.equal(pack.findings.length, 2, '检测结论应回退到 inspection 节点')
}

/** 老相册没有单据链：如实标记，交给调用方走 node.note 兜底 */
function testLegacyAlbumWithoutFlow() {
  const pack = buildCaseFactPack([])
  assert.equal(pack.hasFlow, false)
  assert.deepEqual(pack.missing, ['flowNodes'])
  const nullPack = buildCaseFactPack(null)
  assert.equal(nullPack.hasFlow, false)
}

/** 已分析图 key：供图片分流用，避免重复送多模态模型 */
function testCollectsAnalyzedImageKeys() {
  const pack = buildCaseFactPack(fullFlowNodes())
  const keys = pack.analyzedImageKeys
  assert.ok(keys.includes('https://x/insp1.jpg'), '检测图应算已分析')
  assert.ok(keys.includes('https://x/work1.jpg'), '工单图应算已分析')
  const unique = new Set(keys)
  assert.equal(keys.length, unique.size, '图片 key 不得重复')
}

function testHasEnoughFactsGate() {
  assert.equal(factPackHasEnoughFacts(buildCaseFactPack(fullFlowNodes())), true)
  assert.equal(factPackHasEnoughFacts(buildCaseFactPack([])), false, '无单据链判为不足')

  // 有诉求但无检查结论也无施工内容：不足
  const thin = [
    node('intake', {
      photoDraft: { chiefComplaint: '来做保养' },
      document: { status: 'confirmed', payload: {} },
    }),
  ]
  assert.equal(factPackHasEnoughFacts(buildCaseFactPack(thin)), false)

  // 无诉求：不足
  const noComplaint = fullFlowNodes().filter((row) => row.kind !== 'intake')
  const stripped = noComplaint.map((row) => {
    if (row.kind !== 'inspection_report') return row
    return {
      ...row,
      document: {
        ...row.document,
        payload: { ...row.document.payload, chiefComplaint: '' },
      },
    }
  })
  assert.equal(factPackHasEnoughFacts(buildCaseFactPack(stripped)), false)
}

testFullFlowExtractsAllFacts()
testDropsHealthyAndRecordOnly()
testNeverFeedsAmount()
testKeepsOutsideQuoteFlag()
testChiefComplaintFallsBackToIntake()
testFindingsFallsBackToInspection()
testLegacyAlbumWithoutFlow()
testCollectsAnalyzedImageKeys()
testHasEnoughFactsGate()
console.log('case-geo-factpack.test.js OK')
