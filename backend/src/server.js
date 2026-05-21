require('dotenv').config()
const { createApp } = require('./app')
const { config } = require('./config')
const { prisma } = require('./lib/prisma')

const app = createApp()

const server = app.listen(config.port, config.host, () => {
  console.log(`[zhejian-api] listening on http://${config.host}:${config.port}`)
})

async function shutdown(signal) {
  console.log(`[zhejian-api] ${signal} received, shutting down`)
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
