/**
 * 生成生产库「迁移账本一次性对齐」SQL（仅账本损坏时用）
 * 用法：node scripts/gen-prod-fix-migration-history.js
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const dir = path.join(__dirname, '../prisma/migrations')
const names = fs
  .readdirSync(dir)
  .filter((n) => fs.statSync(path.join(dir, n)).isDirectory())
  .sort()

const rows = names.map((name) => {
  const sql = fs.readFileSync(path.join(dir, name, 'migration.sql'))
  const checksum = crypto.createHash('sha256').update(sql).digest('hex')
  return { name, checksum }
})

function esc(s) {
  return String(s).replace(/'/g, "''")
}

const lines = []
lines.push('-- 生产库一次性对齐：补缺列 + 重建迁移账本（仅用于当前账本损坏场景）')
lines.push('-- 用法: mysql -uroot -p zhejian < scripts/prod-fix-migration-history.sql')
lines.push('START TRANSACTION;')
lines.push('')
lines.push('SET @db := DATABASE();')
lines.push('')
lines.push('-- A. 补缺列（已存在则跳过）')

const adds = [
  ['albums', 'publish_thank_you_json', 'ADD COLUMN `publish_thank_you_json` JSON NULL'],
  ['public_cases', 'gate_b_risk', "ADD COLUMN `gate_b_risk` VARCHAR(16) NOT NULL DEFAULT ''"],
  [
    'public_cases',
    'spot_check_status',
    "ADD COLUMN `spot_check_status` VARCHAR(32) NOT NULL DEFAULT ''",
  ],
]

adds.forEach(([table, col, ddl], i) => {
  lines.push(
    `SET @exists${i} := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='${table}' AND COLUMN_NAME='${col}');`,
  )
  lines.push(
    `SET @sql${i} := IF(@exists${i}=0, '${esc(`ALTER TABLE \`${table}\` ${ddl}`)}', 'SELECT 1');`,
  )
  lines.push(`PREPARE s${i} FROM @sql${i}; EXECUTE s${i}; DEALLOCATE PREPARE s${i};`)
  lines.push('')
})

const indexes = [
  ['public_cases_gate_b_risk_idx', 'public_cases', 'gate_b_risk'],
  ['public_cases_spot_check_status_idx', 'public_cases', 'spot_check_status'],
]

indexes.forEach(([idx, table, col], i) => {
  lines.push(
    `SET @idx${i} := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='${table}' AND INDEX_NAME='${idx}');`,
  )
  lines.push(
    `SET @isql${i} := IF(@idx${i}=0, '${esc(`CREATE INDEX \`${idx}\` ON \`${table}\`(\`${col}\`)`)}', 'SELECT 1');`,
  )
  lines.push(`PREPARE si${i} FROM @isql${i}; EXECUTE si${i}; DEALLOCATE PREPARE si${i};`)
  lines.push('')
})

lines.push('-- B. 重建迁移账本（清空后按当前仓库全部记为已应用）')
lines.push('DELETE FROM `_prisma_migrations`;')
lines.push('')

for (const r of rows) {
  const id = crypto.randomUUID()
  lines.push(
    `INSERT INTO \`_prisma_migrations\` (\`id\`, \`checksum\`, \`finished_at\`, \`migration_name\`, \`logs\`, \`rolled_back_at\`, \`started_at\`, \`applied_steps_count\`) VALUES ('${id}', '${r.checksum}', NOW(3), '${r.name}', NULL, NULL, NOW(3), 1);`,
  )
}

lines.push('')
lines.push('COMMIT;')
lines.push('')
lines.push('SELECT COUNT(*) AS migration_rows FROM `_prisma_migrations`;')
lines.push("SHOW COLUMNS FROM public_cases LIKE 'spot_check_status';")
lines.push("SHOW COLUMNS FROM public_cases LIKE 'gate_b_risk';")
lines.push("SHOW COLUMNS FROM albums LIKE 'publish_thank_you_json';")

const outPath = path.join(__dirname, 'prod-fix-migration-history.sql')
fs.writeFileSync(outPath, `${lines.join('\n')}\n`)
console.log(`wrote ${outPath} (${rows.length} migrations)`)
