/**
 * REV-MOD smoke: public gate + follow-up once/empty reject
 */
const { PrismaClient } = require('@prisma/client')
const {
  listPublicReviewsForAlbum,
  submitServiceAlbumReviewFollowUp,
} = require('../src/services/album-review.service')

const prisma = new PrismaClient()

async function main() {
  const cols = await prisma.$queryRawUnsafe(
    "SHOW COLUMNS FROM service_album_reviews LIKE 'follow_up%'",
  )
  console.log(
    'follow_up columns:',
    cols.map((c) => c.Field).join(', '),
  )

  const reviewRows = await prisma.serviceAlbumReview.findMany({
    take: 40,
    orderBy: { createdAt: 'desc' },
    select: { albumId: true, followUpAt: true, userId: true, status: true },
  })
  const albumIds = [...new Set(reviewRows.map((r) => r.albumId))]
  const albums = albumIds.length
    ? await prisma.album.findMany({
        where: { id: { in: albumIds } },
        select: {
          id: true,
          publicCaseStatus: true,
          publicCase: { select: { status: true } },
        },
      })
    : []
  const albumMap = new Map(albums.map((a) => [a.id, a]))

  const privateAlbum = albums.find((a) => {
    const st = (a.publicCase && a.publicCase.status) || a.publicCaseStatus
    return st !== 'public_approved'
  })
  if (privateAlbum) {
    const pub = await listPublicReviewsForAlbum(privateAlbum.id)
    const st =
      (privateAlbum.publicCase && privateAlbum.publicCase.status) ||
      privateAlbum.publicCaseStatus
    console.log(
      'gate private album',
      privateAlbum.id,
      'status=',
      st,
      'publicReviews=',
      pub.length,
    )
    if (pub.length !== 0) {
      throw new Error('non-public case must hide reviews')
    }
  } else {
    console.log('skip private gate: no non-public album with reviews')
  }

  const publicAlbum = albums.find((a) => {
    const st = (a.publicCase && a.publicCase.status) || a.publicCaseStatus
    return st === 'public_approved'
  })
  if (publicAlbum) {
    const pub = await listPublicReviewsForAlbum(publicAlbum.id)
    console.log('public album', publicAlbum.id, 'reviews=', pub.length)
    if (!pub.length) {
      throw new Error('public_approved with reviews should return thread')
    }
    const r = pub[0]
    for (const k of [
      'repairScore',
      'albumScore',
      'merchantReply',
      'followUpContent',
      'hasFollowUp',
      'images',
    ]) {
      if (!(k in r)) throw new Error(`missing field ${k}`)
    }
    console.log('public payload fields ok; hasFollowUp=', r.hasFollowUp)
  } else {
    console.log('skip public path: no public_approved album with reviews yet')
  }

  const noFollow = reviewRows.find(
    (r) => !r.followUpAt && r.status !== 'hidden',
  )
  if (noFollow) {
    try {
      await submitServiceAlbumReviewFollowUp(noFollow.albumId, noFollow.userId, {
        content: '',
      })
      throw new Error('empty follow-up should reject')
    } catch (e) {
      if (e.message === 'empty follow-up should reject') throw e
      console.log('follow-up empty reject ok:', e.message)
    }
  }

  const withFollow = reviewRows.find((r) => r.followUpAt)
  if (withFollow) {
    try {
      await submitServiceAlbumReviewFollowUp(withFollow.albumId, withFollow.userId, {
        content: 'again',
      })
      throw new Error('second follow-up should reject')
    } catch (e) {
      if (e.message === 'second follow-up should reject') throw e
      console.log('follow-up once reject ok:', e.message)
    }
  } else {
    console.log('skip once-guard: no existing follow-up row')
  }

  void albumMap
  console.log('QA path checks done')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
