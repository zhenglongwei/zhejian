const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const { config } = require('./config')
const { requestIdMiddleware } = require('./middleware/request-id')
const { optionalAuth } = require('./middleware/auth')
const { notFoundHandler, errorHandler } = require('./middleware/error-handler')
const healthRoutes = require('./routes/health')
const userRoutes = require('./routes/user')
const userAlbumRoutes = require('./routes/user-albums')
const desensitizeRoutes = require('./routes/desensitize')
const merchantRoutes = require('./routes/merchant')
const systemRoutes = require('./routes/system')

function createApp() {
  const app = express()
  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(cors({ origin: true, credentials: true }))
  app.use(express.json({ limit: '2mb' }))
  app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'))
  app.use(requestIdMiddleware)
  app.use(optionalAuth)

  app.get('/', (req, res) => {
    res.json({
      service: 'zhejian-api',
      health: '/api/v1/health',
    })
  })

  app.use('/api/v1', healthRoutes)
  app.use('/api/v1/user', userRoutes)
  app.use('/api/v1/user', userAlbumRoutes)
  app.use('/api/v1/desensitize', desensitizeRoutes)
  app.use('/api/v1/merchant', merchantRoutes)
  app.use('/api/v1/system', systemRoutes)

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

module.exports = { createApp }
