const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const {
  getOnboardingProfile,
  saveOnboardingDraft,
  submitOnboarding,
} = require('../services/merchant-onboarding.service')
const { recognizeBusinessLicense } = require('../services/license-ocr.service')

const router = express.Router()

router.get('/onboarding', requireAuth(['user']), async (req, res, next) => {
  try {
    const profile = await getOnboardingProfile(req.auth.userId)
    return ok(res, profile)
  } catch (e) {
    next(e)
  }
})

router.put('/onboarding/draft', requireAuth(['user']), async (req, res, next) => {
  try {
    const profile = await saveOnboardingDraft(req.auth.userId, req.body || {})
    return ok(res, profile)
  } catch (e) {
    next(e)
  }
})

router.post('/onboarding/license-ocr', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await recognizeBusinessLicense(req.body?.licensePhotoUrl)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/onboarding/submit', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await submitOnboarding(req.auth.userId, req.body || {})
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
