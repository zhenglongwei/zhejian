/**
 * 相册检查 · 方法表文案（简练、车主视角）
 */

const ADVICE = {
  ASK_STORE: '向门店索取',
  CONFIRM_STORE: '向门店确认',
  CONFIRM_INSURER: '向保险公司核对',
  NONE: '—',
}

const MATCH_OK = '正常'

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
}) {
  const pairLabel = label || [leftLabel, rightLabel].filter(Boolean).join(' ↔ ')

  if (!leftOk || !rightOk) {
    return {
      id,
      label: pairLabel,
      howToCheck: ADVICE.NONE,
      ifMatch: ADVICE.NONE,
      ifMismatch: '暂无法核对',
      advice: ADVICE.ASK_STORE,
      rowLevel: 'missing',
    }
  }

  return {
    id,
    label: pairLabel,
    howToCheck: howToCheck || ADVICE.NONE,
    ifMatch: MATCH_OK,
    ifMismatch: ifMismatch || ADVICE.NONE,
    advice,
    rowLevel: 'review',
  }
}

function buildWarnMethodRow({ id, label, howToCheck, ifMismatch, advice = ADVICE.CONFIRM_STORE }) {
  return {
    id,
    label,
    howToCheck: howToCheck || ADVICE.NONE,
    ifMatch: MATCH_OK,
    ifMismatch: ifMismatch || ADVICE.NONE,
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
