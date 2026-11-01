const test = require('node:test')
const assert = require('node:assert/strict')
const { scrubNode, scrubUrl } = require('./llm-call-record')

test('signed image urls keep the path and drop the ticket', () => {
  const input = {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'https://staging.example/api/v1/media/files/uploads/2026/11/abc.jpg?exp=1&sig=dead' } },
          { type: 'text', text: '看这张' },
        ],
      },
    ],
    apiKey: 'secret',
  }
  const out = scrubNode(input)
  assert.equal(out.apiKey, undefined)
  assert.equal(
    out.messages[0].content[0].image_url.url,
    'https://staging.example/api/v1/media/files/uploads/2026/11/abc.jpg',
  )
  assert.equal(out.messages[0].content[1].text, '看这张')
})

test('data urls are not written out', () => {
  assert.match(scrubUrl('data:image/jpeg;base64,AAAA'), /omitted/)
})
