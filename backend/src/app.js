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
const userServiceAlbumRoutes = require('./routes/user-service-albums')
const desensitizeRoutes = require('./routes/desensitize')
const merchantLeadRoutes = require('./routes/merchant-leads')
const merchantAuthRoutes = require('./routes/merchant-auth')
const merchantOnboardingRoutes = require('./routes/merchant-onboarding')
const merchantServiceAlbumRoutes = require('./routes/merchant-service-albums')
const merchantServicePlanRoutes = require('./routes/merchant-service-plans')
const mediaRoutes = require('./routes/media')
const systemRoutes = require('./routes/system')
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
  app.use('/api/v1/user', userServiceAlbumRoutes)
  app.use('/api/v1/desensitize', desensitizeRoutes)
  app.use('/api/v1/merchant', merchantAuthRoutes)
  app.use('/api/v1/merchant', merchantOnboardingRoutes)
  app.use('/api/v1/merchant', merchantLeadRoutes)
  app.use('/api/v1/merchant', merchantServiceAlbumRoutes)
  app.use('/api/v1/merchant', merchantServicePlanRoutes)
  app.use('/api/v1/system', systemRoutes)
  app.use('/api/v1/admin', adminRoutes)

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

module.exports = { createApp }
