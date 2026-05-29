const fs = require('fs')
const { resolveObjectKeyFilePath, resolveDesensitizedFilePath } = require('./media-storage')

function filesAreIdentical(pathA, pathB) {
  if (!pathA || !pathB || !fs.existsSync(pathA) || !fs.existsSync(pathB)) {
    return false
  }
  const statA = fs.statSync(pathA)
  const statB = fs.statSync(pathB)
  if (statA.size !== statB.size) return false
  const bufA = fs.readFileSync(pathA)
  const bufB = fs.readFileSync(pathB)
  return bufA.equals(bufB)
}

function isStubCopyArtifact(objectKey, desensitizedKey) {
  const sourcePath = resolveObjectKeyFilePath(objectKey)
  const destPath = resolveDesensitizedFilePath(desensitizedKey)
  return filesAreIdentical(sourcePath, destPath)
}

module.exports = {
  filesAreIdentical,
  isStubCopyArtifact,
}
