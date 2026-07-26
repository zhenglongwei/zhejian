/**
 * 轻量 ZIP（STORE，适合已压缩的 jpg/png/webp）。
 * 文件名使用 UTF-8（general purpose bit 11）。
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
  for (let i = 0; i < data.length; i += 1) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function u16(n) {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(n >>> 0, 0)
  return b
}

function u32(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n >>> 0, 0)
  return b
}

/**
 * @param {Array<{ name: string, data: Buffer }>} entries
 * @returns {Buffer}
 */
function buildZipStore(entries = []) {
  const localParts = []
  const centralParts = []
  let offset = 0

  entries.forEach((entry) => {
    const name = String(entry.name || 'file').replace(/\\/g, '/')
    const nameBuf = Buffer.from(name, 'utf8')
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data || [])
    const checksum = crc32(data)
    const gpFlag = 0x0800 // UTF-8
    const method = 0 // STORE
    const modTime = 0
    const modDate = 0

    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(gpFlag),
      u16(method),
      u16(modTime),
      u16(modDate),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
    ])

    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(gpFlag),
      u16(method),
      u16(modTime),
      u16(modDate),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuf,
    ])

    localParts.push(localHeader, data)
    centralParts.push(centralHeader)
    offset += localHeader.length + data.length
  })

  const centralDir = Buffer.concat(centralParts)
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ])

  return Buffer.concat([...localParts, centralDir, end])
}

module.exports = {
  crc32,
  buildZipStore,
}
