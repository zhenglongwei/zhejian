const path = require('path')
const express = require('express')
const helmet = require('helmet')
const morgan = require('morgan')
const { config } = require('./config')
const { requestIdMiddleware } = require('./middleware/request-id')
const { optionalAuth } = require('./middleware/auth')
const { createCorsMiddleware } = require('./middleware/cors')
const { applyRateLimits } = require('./middleware/rate-limit')
const { notFoundHandler, errorHandler } = require('./middleware/error-handler')
const { MEDIA_ROOT, ensureMediaDirs } = require('./lib/media-storage')
const healthRoutes = require('./routes/health')
const userRoutes = require('./routes/user')
const userHomeRoutes = require('./routes/user-home')
const userContentRoutes = require('./routes/user-content')
const userAuthRoutes = require('./routes/user-auth')
const userAccountRoutes = require('./routes/user-account')
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
const merchantGeoRoutes = require('./routes/merchant-geo')
const merchantPublicCaseRoutes = require('./routes/merchant-public-cases')
const merchantNotificationRoutes = require('./routes/merchant-notifications')
const merchantSubscriptionRoutes = require('./routes/merchant-subscription')
const merchantAlbumReviewRoutes = require('./routes/merchant-album-reviews')
const payWechatRoutes = require('./routes/pay-wechat')
const mediaRoutes = require('./routes/media')
const systemRoutes = require('./routes/system')
const trackRoutes = require('./routes/track')
const publicH5Routes = require('./routes/public-h5')
const publicCaseRightsRoutes = require('./routes/public-case-rights')
const publicGeoCheckRoutes = require('./routes/public-geo-check')
const publicGeoRankingRoutes = require('./routes/public-geo-ranking')
const publicWechatArchiveRoutes = require('./routes/public-wechat-archive')
const publicWebAuthRoutes = require('./routes/public-web-auth')
const { resolveCaseRedirectTarget } = require('./services/h5-case-redirect.service')
const adminRoutes = require('./routes/admin')

function createApp() {
  const app = express()
  app.set('trust proxy', 1)
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // 公开页现经 API 输出 HTML；脱敏图 302 到 OSS，img-src 不能只用 'self'
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        mediaSrc: ["'self'", 'data:', 'https:'],
      },
    },
  }))
  app.use(createCorsMiddleware())
  applyRateLimits(app)
  app.use('/api/v1/pay', payWechatRoutes)
  app.use('/api/v1/public/geo-check', express.json({ limit: '8mb' }))
  app.use(express.json({ limit: '2mb' }))
  app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'))
  app.use(requestIdMiddleware)
  app.use(optionalAuth)

  ensureMediaDirs()
  /** 兼容旧路径：/media/files/… → /api/v1/media/files/…（H5 快照/库内遗留） */
  app.use('/media/files', (req, res) => {
    const rest = String(req.url || '').replace(/^\//, '')
    return res.redirect(302, `/api/v1/media/files/${rest}`)
  })
  /** 生产：仅静态暴露脱敏目录；原图必须走 /api/v1/media/files/… + signed URL */
  if (config.nodeEnv === 'production') {
    app.use(
      '/media/uploads/desensitized',
      (req, res, next) => {
        // OSS 开启后优先走 API 读图（302 签名 URL），避免本地盘已迁走导致 404
        const { isOssEnabled } = require('./lib/oss-client')
        if (isOssEnabled()) {
          const rest = String(req.url || '').replace(/^\//, '')
          return res.redirect(302, `/api/v1/media/files/uploads/desensitized/${rest}`)
        }
        return next()
      },
      express.static(path.join(MEDIA_ROOT, 'uploads', 'desensitized'), {
        maxAge: '7d',
        fallthrough: false,
      })
    )
  } else {
    app.use('/media', express.static(MEDIA_ROOT, { maxAge: '7d', fallthrough: true }))
  }

  /** 本地 H5 联调：与 API 同域，无需部署到 geo.simplewin.cn（仅非 production） */
  if (config.nodeEnv !== 'production') {
    const h5Root = path.join(__dirname, '..', '..', 'h5')
    async function sendPrerender(res, next, renderFn) {
      try {
        const html = await renderFn()
        res.set('Content-Type', 'text/html; charset=utf-8')
        if (config.isStagingPublicSite) res.set('X-Robots-Tag', 'noindex, nofollow')
        return res.send(html)
      } catch (e) {
        if (e.status === 404) return next()
        return next(e)
      }
    }

    app.get('/case/view.html', async (req, res, next) => {
      if (!req.query.id || req.query.legacy === '1') return next()
      try {
        const target = await resolveCaseRedirectTarget(req.query.id)
        return res.redirect(target.status, target.location)
      } catch (e) {
        return next()
      }
    })
    app.get(/^\/case\/[a-zA-Z0-9_-]+\.html$/, async (req, res, next) => {
      if (req.path === '/case/index.html' || req.path === '/case/view.html') return next()
      const { renderCaseBotHtml } = require('./services/h5-case-prerender.service')
      const caseId = req.path.replace(/^\/case\//, '').replace(/\.html$/i, '')
      return sendPrerender(res, next, () => renderCaseBotHtml(caseId))
    })
    app.use('/shared', express.static(path.join(h5Root, 'shared')))
    app.use('/fixtures', express.static(path.join(h5Root, 'fixtures')))
    app.use('/library', express.static(path.join(h5Root, 'library')))
    app.use('/case', express.static(path.join(h5Root, 'case')))
    app.use('/album', express.static(path.join(h5Root, 'album')))
    app.get(['/cases', '/cases/'], function (_req, res) {
      return res.redirect(301, '/case/')
    })
    app.get(['/store', '/store/', '/store/index.html'], function (_req, res) {
      return res.redirect(301, '/')
    })
    app.get(/^\/store\/[a-zA-Z0-9_-]+\.html$/i, async (req, res, next) => {
      if (req.path === '/store/index.html' || req.path === '/store/view.html') return next()
      const { renderStoreBotHtml } = require('./services/h5-store-prerender.service')
      const storeId = req.path.replace(/^\/store\//, '').replace(/\.html$/i, '')
      return sendPrerender(res, next, () => renderStoreBotHtml(storeId))
    })
    app.get(/^\/store\/[a-zA-Z0-9_-]+\/cases\/?$/i, (req, res) => {
      res.sendFile(path.join(h5Root, 'store', 'cases.html'))
    })
    app.get(/^\/topic\/[a-z0-9-]+\/?$/i, async (req, res, next) => {
      const { renderTopicHtml } = require('./services/h5-page-prerender.service')
      const slug = req.path.replace(/^\/topic\//, '').replace(/\/$/, '')
      return sendPrerender(res, next, () => renderTopicHtml(slug))
    })
    app.get(/^\/service\/[a-zA-Z0-9_-]+\/cases\/?$/i, (req, res) => {
      res.sendFile(path.join(h5Root, 'service', 'cases.html'))
    })
    app.get(/^\/service\/[a-zA-Z0-9_-]+\.html$/i, async (req, res, next) => {
      const { renderServiceHtml } = require('./services/h5-page-prerender.service')
      const slug = req.path.replace(/^\/service\//, '').replace(/\.html$/i, '')
      return sendPrerender(res, next, () => renderServiceHtml(slug, req.query))
    })
    app.get(/^\/city\/[a-z0-9-]+\/?$/i, async (req, res, next) => {
      const { renderCityHtml } = require('./services/h5-page-prerender.service')
      const slug = req.path.replace(/^\/city\//, '').replace(/\/$/, '')
      return sendPrerender(res, next, () => renderCityHtml(slug))
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
  app.use('/api/v1/user', userAccountRoutes)
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
  app.use('/api/v1/merchant', merchantGeoRoutes)
  app.use('/api/v1/merchant', merchantPublicCaseRoutes)
  app.use('/api/v1/merchant', merchantNotificationRoutes)
  app.use('/api/v1/merchant', merchantSubscriptionRoutes)
  app.use('/api/v1/merchant', merchantAlbumReviewRoutes)
  app.use('/api/v1/system', systemRoutes)
  app.use('/api/v1/track', trackRoutes)
  /** 与 /track 相同；H5 默认走此路径，避免广告插件拦截 URL 中的 “track” */
  app.use('/api/v1/analytics', trackRoutes)
  app.use('/api/v1/public', publicH5Routes)
  app.use('/api/v1/public', publicCaseRightsRoutes)
  app.use('/api/v1/public', publicGeoCheckRoutes)
  app.use('/api/v1/public', publicGeoRankingRoutes)
  app.use('/api/v1/public', publicWechatArchiveRoutes.router)
  app.use('/api/v1/public', publicWebAuthRoutes.router)
  app.use('/api/v1/admin', adminRoutes)

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

module.exports = { createApp }
