const { canOwnerShareAlbum } = require('./album-owner-share')
const { buildShareableCaseFromAlbum } = require('./case-share')
const { SHARE_MODE } = require('../constants/album-share')

function resolvePublishSheetState(detail = {}) {
  const status = detail.publicCaseStatus || 'private'
  if (status === 'public_approved') return 'approved'
  if (status === 'pending_review') return 'pending'
  if (status === 'need_modify') return 'need_modify'
  return 'idle'
}

function initAlbumShareState(detail = {}, options = {}) {
  const showShareEntry = canOwnerShareAlbum(detail)
  const shareCase = buildShareableCaseFromAlbum(detail)
  const showPublicCaseShare =
    detail.publicCaseStatus === 'public_approved' && Boolean(shareCase && shareCase.id)
  const publishSheetState = resolvePublishSheetState(detail)
  const socialPlatform = options.socialPlatform || 'xiaohongshu'
  const defaultShareIntent = showShareEntry ? 'owner' : 'publicCase'
  const publishSheetDisabled = Boolean(detail.canAuthorizePublicCase === false)
  const showPublishSection =
    publishSheetState === 'approved' ||
    publishSheetState === 'pending' ||
    (publishSheetState === 'need_modify' && !publishSheetDisabled) ||
    (publishSheetState === 'idle' && !publishSheetDisabled)
  return {
    showShareEntry,
    showPublicCaseShare,
    showShareButton: showShareEntry || showPublicCaseShare || publishSheetState !== 'idle',
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
    publishSheetDisabled,
    showPublishSection,
    publishSheetHint:
      publishSheetState === 'idle' ? '预览即将上网的内容，确认后进入审核。' : '',
    shareHonorHint: showPublishSection
      ? '帮助同城车主少踩坑：可发给微信，或预览后发布到公开网站。'
      : '可发给微信好友或朋友圈；当前未达到公开案例站展示条件，不会出现「发布到网站」。',
  }
}

module.exports = {
  initAlbumShareState,
  resolvePublishSheetState,
}
