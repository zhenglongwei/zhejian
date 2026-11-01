const test = require('node:test')
const assert = require('node:assert/strict')
const {
  resolveWizardStep,
  resolveWizardMaxStep,
  canVisitWizardStep,
  shouldKeepExistingGeoDraft,
} = require('./host-wizard-step')

test('not hosted opens on choose-mode step', () => {
  const meta = { hosted: false, visibility: 'private', publicPublishStage: '' }
  assert.equal(resolveWizardStep(meta), 1)
  assert.equal(resolveWizardMaxStep(meta), 1)
  assert.equal(canVisitWizardStep(2, 1), false)
})

test('private hosted opens on preview', () => {
  const meta = { hosted: true, visibility: 'private', publicPublishStage: '' }
  assert.equal(resolveWizardStep(meta), 2)
  assert.equal(resolveWizardMaxStep(meta), 2)
  assert.equal(canVisitWizardStep(2, 2), true)
})

test('live public and in-progress public both open on preview', () => {
  const drafting = {
    hosted: true,
    visibility: 'private',
    publicPublishStage: 'awaiting_privacy',
  }
  assert.equal(resolveWizardStep(drafting), 2)
  assert.equal(resolveWizardMaxStep(drafting), 2)

  const live = { hosted: true, visibility: 'public', publicPublishStage: 'published' }
  assert.equal(resolveWizardStep(live), 2)
  assert.equal(resolveWizardMaxStep(live), 2)
  assert.equal(canVisitWizardStep(3, 2), false)
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
