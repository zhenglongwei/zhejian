const path = require('path')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const { config } = require('./config')
const { requestIdMiddleware } = require('./middleware/request-id')
const { optionalAuth } = require('./middleware/auth')
const { notFoundHandler, errorHandler } = require('./middleware/error-handler')
const { MEDIA_ROOT, ensureMediaDirs } = require('./lib/media-storage')
const healthRoutes = require('./routes/health')
const userRoutes = require('./routes/user')
const userHomeRoutes = require('./routes/user-home')
const userContentRoutes = require('./routes/user-content')
const userAuthRoutes = require('./routes/user-auth')
const userLeadRoutes = require('./routes/user-leads')
const userReportRoutes = require('./routes/user-reports')
const userServiceAlbumRoutes = require('./routes/user-service-albums')
const userFavoriteRoutes = require('./routes/user-favorite')
const userVehicleRoutes = require('./routes/user-vehicle')
const userNotificationRoutes = require('./routes/user-notifications')
const desensitizeRoutes = require('./routes/desensitize')
const merchantLeadRoutes = require('./routes/merchant-leads')
const merchantAuthRoutes = require('./routes/merchant-auth')
const merchantOnboardingRoutes = require('./routes/merchant-onboarding')
const merchantStoreRoutes = require('./routes/merchant-store')
const merchantServiceAlbumRoutes = require('./routes/merchant-service-albums')
const merchantServicePlanRoutes = require('./routes/merchant-service-plans')
const merchantStaffRoutes = require('./routes/merchant-staff')
const merchantStatsRoutes = require('./routes/merchant-stats')
const merchantPublicCaseRoutes = require('./routes/merchant-public-cases')
const merchantNotificationRoutes = require('./routes/merchant-notifications')
const mediaRoutes = require('./routes/media')
const systemRoutes = require('./routes/system')
const trackRoutes = require('./routes/track')
const publicH5Routes = require('./routes/public-h5')
const { resolveCaseRedirectTarget } = require('./services/h5-case-redirect.service')
const adminRoutes = require('./routes/admin')

function createApp() {
  const app = express()
  app.set('trust proxy', 1)
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }))
  app.use(cors({ origin: true, credentials: true }))
  app.use(express.json({ limit: '2mb' }))
  app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'))
  app.use(requestIdMiddleware)
  app.use(optionalAuth)

  ensureMediaDirs()
  app.use('/media', express.static(MEDIA_ROOT, { maxAge: '7d', fallthrough: true }))

  /** 本地 H5 联调：与 API 同域，无需部署到 geo.simplewin.cn（仅非 production） */
  if (config.nodeEnv !== 'production') {
    const h5Root = path.join(__dirname, '..', '..', 'h5')
    app.get('/case/view.html', async (req, res, next) => {
      if (!req.query.id || req.query.legacy === '1') return next()
      try {
        const target = await resolveCaseRedirectTarget(req.query.id)
        return res.redirect(target.status, target.location)
      } catch (e) {
        return next()
      }
    })
    app.get(/^\/case\/[a-zA-Z0-9_-]+\.html$/, (req, res, next) => {
      if (req.path === '/case/index.html' || req.path === '/case/view.html') return next()
      return res.sendFile(path.join(h5Root, 'case', 'view.html'))
    })
    app.use('/shared', express.static(path.join(h5Root, 'shared')))
    app.use('/fixtures', express.static(path.join(h5Root, 'fixtures')))
    app.use('/case', express.static(path.join(h5Root, 'case')))
    app.use('/album', express.static(path.join(h5Root, 'album')))
    app.get(/^\/store\/[a-zA-Z0-9_-]+\/cases\/?$/i, (req, res) => {
      res.sendFile(path.join(h5Root, 'store', 'cases.html'))
    })
    app.get(/^\/service\/[a-zA-Z0-9_-]+\/cases\/?$/i, (req, res) => {
      res.sendFile(path.join(h5Root, 'service', 'cases.html'))
    })
    app.get(/^\/city\/[a-z0-9-]+\/?$/i, (req, res) => {
      res.sendFile(path.join(h5Root, 'city', 'index.html'))
    })
    app.use('/city', express.static(path.join(h5Root, 'city')))
  }

  app.get('/', (req, res) => {
    res.json({
      service: 'zhejian-api',
      health: '/api/v1/health',
    })
  })

  app.use('/api/v1', healthRoutes)
  app.use('/api/v1/media', mediaRoutes)
  app.use('/api/v1/user', userRoutes)
  app.use('/api/v1/user', userHomeRoutes)
  app.use('/api/v1/user', userContentRoutes)
  app.use('/api/v1/user', userAuthRoutes)
  app.use('/api/v1/user', userLeadRoutes)
  app.use('/api/v1/user', userReportRoutes)
  app.use('/api/v1/user', userServiceAlbumRoutes)
  app.use('/api/v1/user', userFavoriteRoutes)
  app.use('/api/v1/user', userVehicleRoutes)
  app.use('/api/v1/user', userNotificationRoutes)
  app.use('/api/v1/desensitize', desensitizeRoutes)
  app.use('/api/v1/merchant', merchantAuthRoutes)
  app.use('/api/v1/merchant', merchantOnboardingRoutes)
  app.use('/api/v1/merchant', merchantStoreRoutes)
  app.use('/api/v1/merchant', merchantLeadRoutes)
  app.use('/api/v1/merchant', merchantServiceAlbumRoutes)
  app.use('/api/v1/merchant', merchantServicePlanRoutes)
  app.use('/api/v1/merchant', merchantStaffRoutes)
  app.use('/api/v1/merchant', merchantStatsRoutes)
  app.use('/api/v1/merchant', merchantPublicCaseRoutes)
  app.use('/api/v1/merchant', merchantNotificationRoutes)
  app.use('/api/v1/system', systemRoutes)
  app.use('/api/v1/track', trackRoutes)
  /** 与 /track 相同；H5 默认走此路径，避免广告插件拦截 URL 中的 “track” */
  app.use('/api/v1/analytics', trackRoutes)
  app.use('/api/v1/public', publicH5Routes)
  app.use('/api/v1/admin', adminRoutes)

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

module.exports = { createApp }
