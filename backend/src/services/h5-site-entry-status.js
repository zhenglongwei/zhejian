function toShelfStatus(total) {
  const n = Number(total) || 0
  return {
    hasPublicCases: n > 0,
    total: n,
  }
}

module.exports = { toShelfStatus }
