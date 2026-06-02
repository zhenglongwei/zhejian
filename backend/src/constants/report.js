const {
  REPORT_TARGET_TYPE,
  REPORT_TYPE,
  REPORT_STATUS,
} = require('../../../constants/report')

const VALID_TARGET_TYPES = new Set(Object.values(REPORT_TARGET_TYPE))
const VALID_REPORT_TYPES = new Set(Object.values(REPORT_TYPE))

const REPORT_RATE_LIMIT_MS = 24 * 60 * 60 * 1000

module.exports = {
  REPORT_TARGET_TYPE,
  REPORT_TYPE,
  REPORT_STATUS,
  VALID_TARGET_TYPES,
  VALID_REPORT_TYPES,
  REPORT_RATE_LIMIT_MS,
}
