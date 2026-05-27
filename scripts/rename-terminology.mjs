import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const exts = new Set(['.md', '.mdc', '.js', '.wxml', '.json', '.wxss'])
const skip = /node_modules|[\\/]\.git[\\/]|rename-terminology/

const replacements = [
  ['00_Phase1_维修档案产品口径.md', '00_Phase1_服务相册产品口径.md'],
  ['我的维修档案', '我的服务相册'],
  ['新建维修档案', '新建服务相册'],
  ['编辑维修档案', '编辑服务相册'],
  ['暂无维修档案', '暂无服务相册'],
  ['维修档案', '服务相册'],
  ['维修留档', '服务相册'],
  ['维修相册', '服务相册'],
  ['透明维修', '辙见'],
  ['浙检', '辙见'],
]

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (skip.test(p)) continue
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (exts.has(path.extname(name))) out.push(p)
  }
  return out
}

let count = 0
for (const file of walk(root)) {
  let text = fs.readFileSync(file, 'utf8')
  const orig = text
  for (const [from, to] of replacements) text = text.split(from).join(to)
  if (text !== orig) {
    fs.writeFileSync(file, text, 'utf8')
    console.log('updated:', path.relative(root, file))
    count++
  }
}
console.log('done', count, 'files')
