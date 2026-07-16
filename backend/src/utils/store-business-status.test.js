const assert = require('assert')
const {
  resolveStoreBusinessStatus,
} = require('./store-business-status')

function atShanghai(isoLocal) {
  // isoLocal: '2026-07-17T10:00:00+08:00'
  return new Date(isoLocal)
}

assert.strictEqual(
  resolveStoreBusinessStatus({
    storeStatus: 'DRAFT',
    businessHours: '09:00-18:00',
  }),
  'offline'
)

assert.strictEqual(
  resolveStoreBusinessStatus({
    storeStatus: 'ACTIVE',
    businessHours: '09:00-18:00',
    bookingPaused: true,
  }),
  'suspended'
)

assert.strictEqual(
  resolveStoreBusinessStatus({
    storeStatus: 'ACTIVE',
    businessHours: '09:00-18:00',
    now: atShanghai('2026-07-17T10:30:00+08:00'),
  }),
  'open'
)

assert.strictEqual(
  resolveStoreBusinessStatus({
    storeStatus: 'ACTIVE',
    businessHours: '09:00-18:00',
    now: atShanghai('2026-07-17T20:00:00+08:00'),
  }),
  'closed'
)

assert.strictEqual(
  resolveStoreBusinessStatus({
    storeStatus: 'ACTIVE',
    businessHours: '09:00-18:00，7月17日休息',
    now: atShanghai('2026-07-17T10:30:00+08:00'),
  }),
  'closed'
)

assert.strictEqual(
  resolveStoreBusinessStatus({
    storeStatus: 'ACTIVE',
    businessHours: '09:00-18:00，7月17日节假日休息',
    now: atShanghai('2026-07-17T10:30:00+08:00'),
  }),
  'holiday'
)

console.log('store-business-status.test.js ok')
