const test = require('node:test')
const assert = require('node:assert/strict')
const { violatesMechanicVoice } = require('./mechanic-copy-voice')

test('rejects caption-like and vague spec copy', () => {
  assert.equal(
    violatesMechanicVoice('白色漆面伴有疑似锈点，漆层破损严重。'),
    true,
  )
  assert.equal(
    violatesMechanicVoice('技师正在使用纸巾擦拭检查，画面文字提示关注液位。'),
    true,
  )
  assert.equal(
    violatesMechanicVoice('安装全新适配型号机油滤芯并复位。'),
    true,
  )
})

test('allows mechanic judgment and teardown hedge', () => {
  assert.equal(
    violatesMechanicVoice('右前翼子板凹陷，漆面开裂。内部可能受损，需进一步拆检。'),
    false,
  )
  assert.equal(violatesMechanicVoice('更换机油滤芯，放出旧油。'), false)
})
