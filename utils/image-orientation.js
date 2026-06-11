/** 微信小程序 getImageInfo orientation → CSS transform */
function orientationToTransform(orientation) {
  switch (Number(orientation)) {
    case 3:
      return 'rotate(180deg)'
    case 6:
      return 'rotate(90deg)'
    case 8:
      return 'rotate(-90deg)'
    default:
      return ''
  }
}

function applyOrientationToPages(pages, orientationMap = {}) {
  return (pages || []).map((page) => {
    if (!page || page.type !== 'photo') return page
    const transform = orientationMap[page.imageUrl] || page.imageTransform || ''
    return transform ? { ...page, imageTransform: transform } : page
  })
}

module.exports = {
  orientationToTransform,
  applyOrientationToPages,
}
