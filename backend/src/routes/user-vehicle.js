const express = require('express')
const { ok } = require('../lib/response')
const { requireAuth } = require('../middleware/auth')
const {
  listUserVehicles,
  getDefaultUserVehicle,
  getUserVehicle,
  createUserVehicle,
  updateUserVehicle,
  deleteUserVehicle,
  setDefaultUserVehicle,
} = require('../services/user-vehicle.service')

const router = express.Router()

router.get('/vehicles', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await listUserVehicles(req.auth.userId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/vehicles/default', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await getDefaultUserVehicle(req.auth.userId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.get('/vehicles/:vehicleId', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await getUserVehicle(req.auth.userId, req.params.vehicleId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/vehicles', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await createUserVehicle(req.auth.userId, req.body || {})
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.put('/vehicles/:vehicleId', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await updateUserVehicle(req.auth.userId, req.params.vehicleId, req.body || {})
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.delete('/vehicles/:vehicleId', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await deleteUserVehicle(req.auth.userId, req.params.vehicleId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

router.post('/vehicles/:vehicleId/set-default', requireAuth(['user']), async (req, res, next) => {
  try {
    const data = await setDefaultUserVehicle(req.auth.userId, req.params.vehicleId)
    return ok(res, data)
  } catch (e) {
    next(e)
  }
})

module.exports = router
