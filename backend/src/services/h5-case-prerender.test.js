const test = require('node:test')
const assert = require('node:assert/strict')
const { buildBotBodyHtml, buildCrawlText } = require('./h5-case-prerender.service')

const data = {
  title: '右前门补漆',
  summary: '本次维修针对右前门漆面划痕进行处理。',
  articleBody: '车辆到店后，门店对车辆情况进行了初步了解与记录。门店根据车辆实际情况进行了检查。',
  serviceFlow: {
    chapters: [
      {
        kind: 'inspection_report',
        title: '检测报告',
        chiefComplaint: '右前门有划痕',
        findings: [{ partName: '右前门', advice: '漆面划痕，建议局部补漆' }],
      },
      {
        kind: 'work',
        title: '工单',
        items: [{ name: '右前门局部补漆', note: '已完成' }],
      },
    ],
  },
  faq: [{ q: '刚补完漆需要注意什么？', a: '七天内不要用高压水枪近距离冲洗。' }],
}

test('爬虫正文用人看到的摘要、节点和问答，不放套话文章', () => {
  const html = buildBotBodyHtml(data)
  assert.match(html, /案例摘要/)
  assert.match(html, /右前门有划痕/)
  assert.match(html, /漆面划痕，建议局部补漆/)
  assert.match(html, /右前门局部补漆/)
  assert.match(html, /刚补完漆需要注意什么/)
  assert.doesNotMatch(html, /初步了解/)
  assert.doesNotMatch(html, /案例正文/)
  const text = buildCrawlText(data)
  assert.match(text, /右前门有划痕/)
  assert.doesNotMatch(text, /初步了解/)
})

test('证据等级行：trustMeta 有标签时进正文与爬虫文本', () => {
  const withTrust = {
    ...data,
    trustMeta: {
      evidenceLevel: 'rich_images',
      evidenceLevelLabel: '图文全留证',
      authorizationTierLabel: '门店发布',
      desensitized: true,
      reviewStatus: 'approved',
    },
    serviceFlow: {
      chapters: [
        ...data.serviceFlow.chapters,
        {
          kind: 'repair_report',
          title: '完工',
          exteriorPhotoWaived: true,
          acceptanceItems: [
            { id: 'acc_1', kind: 'work', name: '右前门局部补漆', result: 'pass', resultLabel: '合格', images: [{ url: '/p/a.jpg' }] },
            { id: 'exterior', kind: 'exterior', name: '外观', result: 'pass', resultLabel: '合格', images: [], missingPhoto: true },
          ],
        },
      ],
    },
  }
  const html = buildBotBodyHtml(withTrust)
  assert.match(html, /data-bot="evidence"/)
  assert.match(html, /证据等级：图文全留证/)
  assert.match(html, /商家未留外观照/)
  assert.match(html, /商家确认未拍外观照/)
  const text = buildCrawlText(withTrust)
  assert.match(text, /证据等级：图文全留证/)
})

test('无 trustMeta 时不出证据等级行', () => {
  const html = buildBotBodyHtml(data)
  assert.doesNotMatch(html, /证据等级/)
})

test('facts JSON-LD 块可被 bot-schema-assert 解析', () => {
  const { extractJsonLdBlocks } = require('../lib/bot-schema-assert')
  const { buildCaseFactsSchema } = require('../lib/case-facts-jsonld')
  const { config } = require('../config')
  const block = buildCaseFactsSchema({
    baseUrl: config.publicBaseUrl,
    canonicalPath: '/case/case_x.html',
    data,
  })
  // data 无 caseVehicle/trustMeta 时仍可有 findings 事实
  assert.ok(block)
  const html = `<html><head><script type="application/ld+json">${JSON.stringify(block)}</script></head><body></body></html>`
  const blocks = extractJsonLdBlocks(html)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0]['@graph'][0]['@type'], 'Article')
})
