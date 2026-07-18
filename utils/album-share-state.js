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
    publishSheetDisabled: Boolean(detail.canAuthorizePublicCase === false),
    publishSheetHint:
      publishSheetState === 'idle' ? '预览即将上网的内容，确认后进入审核。' : '',
    shareHonorHint: '帮助同城车主少踩坑：可将脱敏后的维修记录发布到公开网站（须审核）。',
  }
}

module.exports = {
  initAlbumShareState,
  resolvePublishSheetState,
}
