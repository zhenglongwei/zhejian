const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveFactsFlowNodes } = require('./content.service')

test('resolveFactsFlowNodes 用相册 content 回填归档快照缺失的节点文字', () => {
  const archiveSnap = {
    flowNodes: [
      { id: 'fn_003', kind: 'inspection_report', document: { status: 'confirmed', payload: null } },
      { id: 'fn_005', kind: 'work', document: null },
    ],
  }
  const album = {
    contentPackageJson: {
      flowNodes: [
        {
          id: 'fn_003',
          kind: 'inspection_report',
          content: {
            chiefComplaint: '底盘异响',
            findings: [{ partName: '悬挂胶套', result: '需处理' }],
          },
        },
        {
          id: 'fn_005',
          kind: 'work',
          content: { findings: [{ partName: '悬挂胶套', caption: '更换左右前悬挂胶套' }] },
        },
      ],
    },
  }
  const out = resolveFactsFlowNodes(archiveSnap, album)
  assert.equal(out.length, 2)
  assert.equal(out[0].content.chiefComplaint, '底盘异响')
  assert.equal(out[1].content.findings[0].caption, '更换左右前悬挂胶套')
})

test('resolveFactsFlowNodes 归档已有文字时保持冻结，不被相册新内容覆盖', () => {
  const archiveSnap = {
    flowNodes: [
      { id: 'fn_003', kind: 'inspection_report', content: { chiefComplaint: '归档诉求' } },
    ],
  }
  const album = {
    contentPackageJson: {
      flowNodes: [{ id: 'fn_003', content: { chiefComplaint: '相册新诉求' } }],
    },
  }
  const out = resolveFactsFlowNodes(archiveSnap, album)
  assert.equal(out[0].content.chiefComplaint, '归档诉求')
})

test('resolveFactsFlowNodes 无归档快照时使用相册节点', () => {
  const album = {
    contentPackageJson: {
      flowNodes: [{ id: 'fn_001', content: { chiefComplaint: '动力不足' } }],
    },
  }
  const out = resolveFactsFlowNodes(null, album)
  assert.equal(out[0].content.chiefComplaint, '动力不足')
})
