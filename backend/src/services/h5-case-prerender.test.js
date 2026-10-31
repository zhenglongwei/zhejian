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
        title: '检测报告',
        chiefComplaint: '右前门有划痕',
        findings: [{ partName: '右前门', advice: '漆面划痕，建议局部补漆' }],
      },
      {
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
