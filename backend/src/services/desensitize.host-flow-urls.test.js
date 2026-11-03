const test = require('node:test')
const assert = require('node:assert/strict')

// collectFlowReviewImageUrls 未直接导出；经 ensure 路径前先测 flow-public-media 同源
const { collectPublicizableFlowPhotos } = require('../utils/flow-public-media')

test('定稿工单图在 content.findings 时仍可收进可公示清单', () => {
  const album = {
    contentPackageJson: {
      flowNodes: [
        {
          id: 'fn_work',
          kind: 'work',
          status: 'completed',
          document: { status: 'completed', payload: {} },
          content: {
            findings: [
              {
                id: 'w1',
                partName: '下摆臂',
                images: [{ url: 'https://cdn.example.com/work-a.jpg' }],
              },
            ],
          },
        },
        {
          id: 'fn_delivery',
          kind: 'delivery_photos',
          status: 'completed',
          document: { status: 'pending_confirm', payload: {} },
          content: {
            deliveryExteriorUrl: 'https://cdn.example.com/out.jpg',
            deliveryPhotos: [{ url: 'https://cdn.example.com/d2.jpg' }],
          },
        },
      ],
    },
  }
  const urls = collectPublicizableFlowPhotos(album).map((r) => r.url).sort()
  assert.deepEqual(urls, [
    'https://cdn.example.com/d2.jpg',
    'https://cdn.example.com/out.jpg',
    'https://cdn.example.com/work-a.jpg',
  ])
})
