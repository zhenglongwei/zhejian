const { prisma } = require('../lib/prisma')
const { REPORT_STATUS } = require('../constants/report')
const { FEEDBACK_STATUS } = require('../constants/album-feedback')
const {
  USER_STATUS,
  DEACTIVATE_BLOCKER,
  DEACTIVATE_BLOCKER_MESSAGE,
  MERCHANT_OWNER_DEACTIVATE_ALLOW,
} = require('../constants/user')
const { withdrawAuthorization } = require('./service-album.service')

const OPEN_PUBLIC_STATUSES = new Set(['pending_review', 'public_approved'])

function redactContactJson(contactJson) {
  if (!contactJson || typeof contactJson !== 'object' || Array.isArray(contactJson)) {
    return contactJson
  }
  return {
    ...contactJson,
    phone: '',
    mobile: '',
    name: '',
    contactName: '',
  }
}

function redactVehicleJson(vehicleJson) {
  if (!vehicleJson || typeof vehicleJson !== 'object' || Array.isArray(vehicleJson)) {
    return vehicleJson
  }
  return {
    ...vehicleJson,
    plate: '',
    plateDisplay: '',
    plateNo: '',
    vin: '',
    vinMasked: '',
  }
}

function mapBlocker(code) {
  return {
    code,
    message: DEACTIVATE_BLOCKER_MESSAGE[code] || '暂无法注销，请联系客服',
  }
}

async function loadUserOrThrow(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    const err = new Error('用户不存在')
    err.status = 404
    throw err
  }
  return user
}

async function collectDeactivateBlockers(user) {
  const blockers = []

  if (user.status === USER_STATUS.CANCELLED) {
    blockers.push(mapBlocker(DEACTIVATE_BLOCKER.ALREADY_CANCELLED))
    return blockers
  }

  const [pendingReports, pendingFeedback, ownedMerchants] = await Promise.all([
    prisma.contentReport.count({
      where: {
        userId: user.id,
        status: { in: [REPORT_STATUS.PENDING, REPORT_STATUS.PROCESSING] },
      },
    }),
    prisma.serviceAlbumFeedback.count({
      where: {
        userId: user.id,
        status: FEEDBACK_STATUS.PENDING,
      },
    }),
    prisma.merchant.findMany({
      where: { ownerUserId: user.id },
      select: { id: true, status: true },
    }),
  ])

  if (pendingReports > 0) {
    blockers.push(mapBlocker(DEACTIVATE_BLOCKER.PENDING_CONTENT_REPORT))
  }
  if (pendingFeedback > 0) {
    blockers.push(mapBlocker(DEACTIVATE_BLOCKER.PENDING_ALBUM_FEEDBACK))
  }

  const blockingMerchant = ownedMerchants.find(
    (item) => !MERCHANT_OWNER_DEACTIVATE_ALLOW.has(item.status)
  )
  if (blockingMerchant) {
    blockers.push(mapBlocker(DEACTIVATE_BLOCKER.ACTIVE_MERCHANT_OWNER))
  }

  return blockers
}

async function fetchDeactivateCheck(userId) {
  const user = await loadUserOrThrow(userId)
  const blockers = await collectDeactivateBlockers(user)
  return {
    canDeactivate: blockers.length === 0,
    blockers,
  }
}

async function offlineUserPublicAlbums(userId, phone) {
  const albums = await prisma.album.findMany({
    where: {
      OR: [{ userId }, ...(phone ? [{ userPhone: phone }] : [])],
    },
    select: {
      id: true,
      publicCaseStatus: true,
      vehicleJson: true,
    },
  })

  for (const album of albums) {
    if (OPEN_PUBLIC_STATUSES.has(album.publicCaseStatus)) {
      await withdrawAuthorization(album.id, userId)
    }
    await prisma.album.update({
      where: { id: album.id },
      data: {
        userId: '',
        userPhone: '',
        vehicleJson: redactVehicleJson(album.vehicleJson),
      },
    })
  }
}

async function anonymizeUserLeads(userId) {
  const leads = await prisma.consultLead.findMany({
    where: { userId },
    select: {
      id: true,
      contactJson: true,
      vehicleJson: true,
    },
  })

  for (const lead of leads) {
    await prisma.consultLead.update({
      where: { id: lead.id },
      data: {
        contactJson: redactContactJson(lead.contactJson),
        vehicleJson: redactVehicleJson(lead.vehicleJson),
      },
    })
  }
}

async function deactivateAccount(userId) {
  const user = await loadUserOrThrow(userId)
  const blockers = await collectDeactivateBlockers(user)
  if (blockers.length) {
    const err = new Error(blockers[0].message)
    err.status = 409
    err.code = 100007
    err.data = { blockers }
    throw err
  }

  const phone = user.phone || ''

  await offlineUserPublicAlbums(userId, phone)
  await anonymizeUserLeads(userId)

  await prisma.$transaction(async (tx) => {
    await tx.userSearchHistory.deleteMany({ where: { userId } })
    await tx.userFavorite.deleteMany({ where: { userId } })
    await tx.userVehicle.deleteMany({ where: { userId } })
    await tx.notificationSubscription.deleteMany({ where: { userId } })
    await tx.notificationMessage.deleteMany({
      where: { receiverType: 'user', receiverId: userId },
    })
    await tx.merchantStaff.updateMany({
      where: { userId },
      data: { userId: null },
    })
    await tx.contentReport.updateMany({
      where: { userId },
      data: { contactPhone: '' },
    })
    await tx.serviceAlbumFeedback.updateMany({
      where: { userId },
      data: { contactPhone: '' },
    })

    await tx.user.update({
      where: { id: userId },
      data: {
        status: USER_STATUS.CANCELLED,
        cancelledAt: new Date(),
        openid: null,
        unionid: null,
        phone: '',
        nickname: '',
        avatarUrl: '',
      },
    })
  })

  return { ok: true }
}

module.exports = {
  fetchDeactivateCheck,
  deactivateAccount,
}
