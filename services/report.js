const { post } = require('./request')

async function submitReport(payload) {
  return post('/user/reports', payload)
}

module.exports = {
  submitReport,
}
