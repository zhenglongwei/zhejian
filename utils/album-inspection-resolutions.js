/**
 * 相册检查 · 方法表文案（简练、车主视角）
 */

const ADVICE = {
  ASK_STORE: '向门店索取',
  CONFIRM_STORE: '向门店确认',
  CONFIRM_INSURER: '向保险公司核对',
}

const MATCH_OK = '正常'

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
    missingSummary: missingSummary || '相关留痕',
    riskHint:
      hints.risk ||
      (missingSummary
        ? `暂无${missingSummary}，此项对照暂时无法进行。`
        : '对照所需材料不齐，此项核对暂时无法进行。'),
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
  const pairLabel = label || [leftLabel, rightLabel].filter(Boolean).join(' ↔ ')

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
