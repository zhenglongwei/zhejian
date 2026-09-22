const assert = require('assert')
const {
  looksLikeEncyclopediaFaq,
  filterEvidenceFaq,
  nArchiveLabel,
} = require('./evidence-faq')

function run() {
  assert.strictEqual(nArchiveLabel(1), '这例公开档案里')
  assert.strictEqual(nArchiveLabel(3), '这 3 例公开档案里')

  assert.strictEqual(
    looksLikeEncyclopediaFaq({
      q: '刹车片多久需要更换？',
      a: '一般来说结合磨损判断。',
    }),
    true
  )
  assert.strictEqual(
    looksLikeEncyclopediaFaq({
      q: '这 3 例公开档案里，到店后先做了哪些检查？',
      a: '这 3 例公开档案里，记下的检查结论包括片厚不足。',
    }),
    false
  )
  assert.strictEqual(
    looksLikeEncyclopediaFaq({
      q: '这家店专不专业？',
      a: '我们专业团队注重透明化。',
    }),
    true
  )

  const kept = filterEvidenceFaq([
    { q: '小保养一般包含哪些项目？', a: '通常包含机油机滤。' },
    { q: '这例做了哪些项目？', a: '这例公开档案里做了机油机滤。' },
  ])
  assert.strictEqual(kept.length, 1)
  assert.ok(kept[0].q.includes('这例'))

  assert.strictEqual(
    filterEvidenceFaq([
      { q: '修完后要向商家确认什么？', a: '修完后要向商家确定质保期。' },
      {
        q: '这例质保怎么写的？',
        a: '这例写了漆面质保一年。修完后要向商家确定质保期，以及不含哪些。',
      },
    ]).length,
    1,
  )

  console.log('[evidence-faq.test] ok')
}

run()
