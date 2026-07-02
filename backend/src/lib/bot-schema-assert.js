/**
 * GEO-IGAIN-C05 · Bot 预渲染 JSON-LD 结构断言
 */

function extractJsonLdBlocks(html) {
  const blocks = []
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  let match
  while ((match = re.exec(String(html || '')))) {
    const raw = String(match[1] || '').trim()
    if (!raw) continue
    try {
      blocks.push(JSON.parse(raw))
    } catch (err) {
      const error = new Error(`invalid JSON-LD block: ${err.message}`)
      error.raw = raw.slice(0, 120)
      throw error
    }
  }
  return blocks
}

function flattenGraphNodes(blocks) {
  const nodes = []
  ;(blocks || []).forEach((block) => {
    if (!block || typeof block !== 'object') return
    if (Array.isArray(block['@graph'])) {
      block['@graph'].forEach((node) => nodes.push(node))
      return
    }
    nodes.push(block)
  })
  return nodes
}

function assertCaseBotSchemaGraph(html, options = {}) {
  const blocks = extractJsonLdBlocks(html)
  if (!blocks.length) {
    throw new Error('missing JSON-LD script blocks')
  }

  const nodes = flattenGraphNodes(blocks)
  const graphBlock = blocks.find((block) => Array.isArray(block['@graph']))
  if (!graphBlock) {
    throw new Error('missing @graph JSON-LD block')
  }

  const orgNode = nodes.find(
    (node) => node['@type'] === 'Organization' && String(node['@id'] || '').includes('#organization')
  )
  if (!orgNode) {
    throw new Error('missing Organization @id #organization in @graph')
  }

  const articleNode = nodes.find(
    (node) => node['@type'] === 'Article' && node['@id']
  )
  if (!articleNode) {
    throw new Error('missing Article node with @id in @graph')
  }

  if (orgNode['@id'] && articleNode.publisher && articleNode.publisher['@id']) {
    if (articleNode.publisher['@id'] !== orgNode['@id']) {
      throw new Error('Article.publisher @id must link to Organization @id')
    }
  }

  const howToBlock = blocks.find((block) => block['@type'] === 'HowTo')
  if (!howToBlock || !Array.isArray(howToBlock.step) || !howToBlock.step.length) {
    throw new Error('missing HowTo schema with steps')
  }

  if (options.requireSummaryInHtml && options.summarySnippet) {
    const snippet = String(options.summarySnippet).slice(0, 20)
    if (snippet && !html.includes(snippet)) {
      throw new Error('aiSummary not in prerender html')
    }
  }

  return { blocks, nodes, graphBlock, howToBlock }
}

module.exports = {
  extractJsonLdBlocks,
  flattenGraphNodes,
  assertCaseBotSchemaGraph,
}
