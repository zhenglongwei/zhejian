const test = require('node:test')
const assert = require('node:assert/strict')
const { libraryNote, formatLibraryTime, pickCache } = require('./album-media-library.service')
const { FLOW_ORGANIZE_PROMPT_VERSION } = require('./node-photo-organize.service')

test('library note prefers category, reading and observation', () => {
  const note = libraryNote(
    {
      resultJson: { category: 'odometer', reading: '86500', observation: '表盘入镜' },
    },
    '',
  )
  assert.match(note, /里程/)
  assert.match(note, /86500/)
  assert.match(note, /表盘入镜/)
})

test('library time is month-day hour:minute', () => {
  assert.equal(formatLibraryTime(new Date('2026-10-03T02:08:00+08:00')), '10-03 02:08')
  assert.equal(formatLibraryTime(new Date('2026-10-02T18:08:00.000Z')), '10-03 02:08')
})

test('pickCache prefers flow organize prompt version', () => {
  const hit = pickCache([
    { promptVersion: 'album-vision-v2-2026-09-19', resultJson: { description: 'old' } },
    { promptVersion: FLOW_ORGANIZE_PROMPT_VERSION, resultJson: { observation: 'new' } },
  ])
  assert.equal(hit.resultJson.observation, 'new')
})
