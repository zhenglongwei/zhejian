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

test('privacy review lands on preview step; cannot skip beyond two', () => {
  const meta = { hosted: true, visibility: 'private', publicPublishStage: 'awaiting_privacy' }
  assert.equal(resolveWizardStep(meta, 'public'), 2)
  assert.equal(resolveWizardMaxStep(meta, 'public'), 2)
  assert.equal(canVisitWizardStep(1, 2), true)
  assert.equal(canVisitWizardStep(2, 2), true)
  assert.equal(canVisitWizardStep(3, 2), false)
})

test('legacy geo stages also land on preview; live public stays on archive', () => {
  const drafting = {
    hosted: true,
    visibility: 'private',
    publicPublishStage: 'awaiting_geo_confirm',
  }
  assert.equal(resolveWizardStep(drafting, 'public'), 2)
  assert.equal(resolveWizardMaxStep(drafting, 'public'), 2)
  assert.equal(canVisitWizardStep(1, 2), true)
  assert.equal(canVisitWizardStep(2, 2), true)

  const live = { hosted: true, visibility: 'public', publicPublishStage: 'published' }
  assert.equal(resolveWizardStep(live, 'public'), 1)
  assert.equal(resolveWizardMaxStep(live, 'public'), 1)
  assert.equal(canVisitWizardStep(2, 1), false)
})

test('keep storefront copy when summary already filled', () => {
  assert.equal(
    shouldKeepExistingGeoDraft({ publicPublishStage: 'awaiting_privacy', geoSummary: '' }),
    false,
  )
  assert.equal(
    shouldKeepExistingGeoDraft({
      publicPublishStage: 'awaiting_geo_confirm',
      wizardMaxStep: 2,
      geoSummary: '为何来店、查了什么',
    }),
    true,
  )
  assert.equal(shouldKeepExistingGeoDraft({ wizardMaxStep: 2, geoSummary: '' }), false)
})
