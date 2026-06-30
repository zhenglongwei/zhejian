const { canOwnerShareAlbum } = require('./album-owner-share')
const { buildShareableCaseFromAlbum } = require('./case-share')
const { SHARE_MODE } = require('../constants/album-share')

function initAlbumShareState(detail = {}) {
  const showShareEntry = canOwnerShareAlbum(detail)
  const shareCase = buildShareableCaseFromAlbum(detail)
  const showPublicCaseShare =
    detail.publicCaseStatus === 'public_approved' && Boolean(shareCase && shareCase.id)
  const defaultShareIntent = showShareEntry ? 'owner' : 'publicCase'
  return {
    showShareEntry,
    showPublicCaseShare,
    showShareButton: showShareEntry || showPublicCaseShare,
    defaultShareIntent,
    shareSheetIntent: defaultShareIntent,
    shareActionsDisabled: showShareEntry,
    shareReady: false,
    shareToken: '',
    shareUseOriginal: false,
    sharePreparing: false,
    shareMode: SHARE_MODE.DESENSITIZED,
  }
}

module.exports = {
  initAlbumShareState,
}
