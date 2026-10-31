/**
 * 流程包 contentPackageJson 原图匹配
 * 运行：node src/services/media-access.flow-package.test.js
 */
const assert = require('assert')
const { jsonTreeReferencesObjectKey } = require('./media-access.service')

const objectKey = 'uploads/2026/10/f7fe6a1ef7754899146502eb5dd962e3.jpg'
const signedUrl =
  `https://staging.zhejian.simplewin.cn/api/v1/media/files/${objectKey}?exp=1&sig=dead`

assert.strictEqual(
  jsonTreeReferencesObjectKey(
    {
      flowNodes: [
        {
          photoDraft: {
            findings: [{ partName: '制动盘', images: [{ url: signedUrl }] }],
          },
        },
      ],
    },
    objectKey,
  ),
  true,
)

assert.strictEqual(
  jsonTreeReferencesObjectKey(
    { flowNodes: [{ photoDraft: { findings: [{ images: ['https://example.com/x.jpg'] }] } }] },
    objectKey,
  ),
  false,
)

assert.strictEqual(jsonTreeReferencesObjectKey(null, objectKey), false)

console.log('media-access.flow-package.test.js OK')
