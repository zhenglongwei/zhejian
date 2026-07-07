/**
 * 相册检查 · 方法表文案（车主视角、新手可读）
 */

const ADVICE = {
  ASK_STORE: '向门店要',
  CONFIRM_STORE: '向门店确认',
  CONFIRM_INSURER: '向保险公司核对',
}

const MATCH_OK = '对得上，一般没问题'

function resolveMissingSide(leftOk, rightOk) {
  if (!leftOk && !rightOk) return 'both'
  if (!leftOk) return 'left'
  if (!rightOk) return 'right'
  return ''
}

function resolveMissingLabels(leftLabel, rightLabel, leftOk, rightOk) {
  const missing = []
  if (!leftOk && leftLabel) missing.push(leftLabel)
  if (!rightOk && rightLabel) missing.push(rightLabel)
  return missing.join('、')
}

function resolveMissingCopy({ leftOk, rightOk, leftLabel, rightLabel, missingHints = {} }) {
  const side = resolveMissingSide(leftOk, rightOk)
  const hints = missingHints[side] || missingHints.default || {}
  const missingSummary = resolveMissingLabels(leftLabel, rightLabel, leftOk, rightOk)

  return {
    missingSummary: missingSummary || '相关材料',
    riskHint:
      hints.risk ||
      (missingSummary
        ? `还没有${missingSummary}，这一步暂时没法核对。`
        : '材料不齐，暂时没法核对。'),
    actionHint: hints.action || ADVICE.ASK_STORE,
  }
}

function buildMethodRow({
  id,
  label,
  leftOk = true,
  rightOk = true,
  leftLabel = '',
  rightLabel = '',
  howToCheck = '',
  ifMismatch = '',
  advice = ADVICE.CONFIRM_STORE,
  missingHints = {},
}) {
  const pairLabel = label || [leftLabel, rightLabel].filter(Boolean).join(' 与 ')

  if (!leftOk || !rightOk) {
    const missing = resolveMissingCopy({
      leftOk,
      rightOk,
      leftLabel,
      rightLabel,
      missingHints,
    })
    return {
      id,
      label: pairLabel,
      isMissing: true,
      missingSummary: missing.missingSummary,
      riskHint: missing.riskHint,
      actionHint: missing.actionHint,
      rowLevel: 'missing',
    }
  }

  return {
    id,
    label: pairLabel,
    isMissing: false,
    howToCheck,
    ifMatch: MATCH_OK,
    ifMismatch,
    advice,
    rowLevel: 'review',
  }
}

function buildWarnMethodRow({ id, label, howToCheck, ifMismatch, advice = ADVICE.CONFIRM_STORE }) {
  return {
    id,
    label,
    isMissing: false,
    howToCheck,
    ifMatch: MATCH_OK,
    ifMismatch,
    advice,
    rowLevel: 'warn',
  }
}

module.exports = {
  ADVICE,
  MATCH_OK,
  buildMethodRow,
  buildWarnMethodRow,
}
