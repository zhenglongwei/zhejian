const test = require('node:test')
const assert = require('node:assert/strict')
const {
  resolveWizardStep,
  resolveWizardMaxStep,
  canVisitWizardStep,
  shouldKeepExistingGeoDraft,
} = require('./host-wizard-step')

test('private hosted stays on archive and cannot skip ahead', () => {
  const meta = { hosted: true, visibility: 'private', publicPublishStage: '' }
  assert.equal(resolveWizardStep(meta, 'private'), 1)
  assert.equal(resolveWizardMaxStep(meta, 'private'), 1)
  assert.equal(canVisitWizardStep(1, 1), true)
  assert.equal(canVisitWizardStep(2, 1), false)
})

test('privacy review can go back to archive but not skip copy', () => {
  const meta = { hosted: true, visibility: 'private', publicPublishStage: 'awaiting_privacy' }
  assert.equal(resolveWizardStep(meta, 'public'), 2)
  assert.equal(resolveWizardMaxStep(meta, 'public'), 2)
  assert.equal(canVisitWizardStep(1, 2), true)
  assert.equal(canVisitWizardStep(2, 2), true)
  assert.equal(canVisitWizardStep(3, 2), false)
})

test('copy step can visit all three; live public stays on archive', () => {
  const drafting = {
    hosted: true,
    visibility: 'private',
    publicPublishStage: 'awaiting_geo_confirm',
  }
  assert.equal(resolveWizardStep(drafting, 'public'), 3)
  assert.equal(resolveWizardMaxStep(drafting, 'public'), 3)
  assert.equal(canVisitWizardStep(1, 3), true)
  assert.equal(canVisitWizardStep(2, 3), true)

  const live = { hosted: true, visibility: 'public', publicPublishStage: 'published' }
  assert.equal(resolveWizardStep(live, 'public'), 1)
  assert.equal(resolveWizardMaxStep(live, 'public'), 1)
  assert.equal(canVisitWizardStep(3, 1), false)
})

test('keep storefront copy when returning from later steps', () => {
  assert.equal(
    shouldKeepExistingGeoDraft({ publicPublishStage: 'awaiting_privacy', wizardMaxStep: 2 }),
    false,
  )
  assert.equal(
    shouldKeepExistingGeoDraft({
      publicPublishStage: 'awaiting_geo_confirm',
      wizardMaxStep: 3,
      geoSummary: '为何来店、查了什么',
    }),
    true,
  )
  assert.equal(shouldKeepExistingGeoDraft({ wizardMaxStep: 3, geoSummary: '' }), true)
})
