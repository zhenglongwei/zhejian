/** Re-export shared album summary aggregation for backend services. */
const { resolveShared } = require('./resolve-shared')

module.exports = resolveShared('utils/album-summary.js')
