const VALID_FEEDBACK_TYPES = new Set([
  'unclear_image',
  'unclear_note',
  'vehicle_mismatch',
  'missing_process',
  'result_concern',
  'other',
])

const FEEDBACK_STATUS = {
  PENDING: 'pending',
  CLOSED: 'closed',
}

const FEEDBACK_RATE_LIMIT_MS = 24 * 60 * 60 * 1000

module.exports = {
  VALID_FEEDBACK_TYPES,
  FEEDBACK_STATUS,
  FEEDBACK_RATE_LIMIT_MS,
}
