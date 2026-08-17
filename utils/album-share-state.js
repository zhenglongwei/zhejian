const { canOwnerShareAlbum } = require('./album-owner-share')
const { buildShareableCaseFromAlbum } = require('./case-share')
const { SHARE_MODE } = require('../constants/album-share')

function resolvePublishSheetState(detail = {}) {
  const status = detail.publicCaseStatus || 'private'
  if (status === 'public_approved') return 'approved'
  if (status === 'notify_window') return 'window'
  if (status === 'owner_blocked' || status === 'user_rejected') return 'blocked'
  if (status === 'pending_review' || status === 'pending_desensitize') return 'pending'
  if (status === 'need_modify') return 'need_modify'
  if (status === 'review_passed') return 'window'
  return 'idle'
}

function publishHintForState(state) {
  if (state === 'window') return '打码说明即将出现在店页。'
  if (state === 'approved') return '打码说明已在店页。不合适随时能撤下来。'
  if (state === 'blocked') return '已按你的意思，这条不会放到店页。'
  if (state === 'pending') return '门店已送审，通过后会出现在店页。'
  if (state === 'need_modify') return '审核未通过，请等待门店修改后重新生成。'
  return '门店可能把打码说明放到店页。发给微信不会自动进店页。'
}

function initAlbumShareState(detail = {}, options = {}) {
  const showShareEntry = canOwnerShareAlbum(detail)
  const shareCase = buildShareableCaseFromAlbum(detail)
  const showPublicCaseShare =
    detail.publicCaseStatus === 'public_approved' && Boolean(shareCase && shareCase.id)
  const publishSheetState = resolvePublishSheetState(detail)
  const socialPlatform = options.socialPlatform || 'xiaohongshu'
  const defaultShareIntent = showShareEntry ? 'owner' : 'publicCase'
  return {
    showShareEntry,
    showPublicCaseShare,
    showShareButton: true,
    defaultShareIntent,
    shareSheetIntent: defaultShareIntent,
    shareActionsDisabled: showShareEntry,
    shareReady: false,
    shareToken: '',
    shareUseOriginal: false,
    sharePreparing: false,
    shareMode: SHARE_MODE.DESENSITIZED,
    socialPlatform,
    socialDraftText: '',
    socialDraftWaitHint: '',
    publishSheetState,
    publishSheetDisabled: !detail.canAuthorizePublicCase,
    showPublishSection: true,
    publishSheetHint: publishHintForState(publishSheetState),
    shareHonorHint: '可发给微信好友或朋友圈；发给微信不会自动进店页。',
  }
}

module.exports = {
  initAlbumShareState,
  resolvePublishSheetState,
  publishHintForState,
}
