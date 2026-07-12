/**
 * GEO-OBS-B02 / GEO-TOPIC-D02 · Prompt 词库种子（与 geo-topic-seed-list 一一对应）
 * 供后续 geo_prompt_probe 表与 OBS 探测使用；当前为常量映射。
 */
const { GEO_TOPIC_SEED_ALL } = require('./geo-topic-seed-list')

const PROMPT_TYPE = {
  KNOWLEDGE: 'B',
  EVIDENCE: 'C',
  LOCAL: 'A',
}

function buildPromptRow(seed) {
  return {
    id: seed.promptId,
    prompt: seed.promptText,
    city: seed.city || '',
    service: seed.serviceName || '',
    fault: seed.faultTag || '',
    topicSlug: seed.slug,
    pageType: seed.pageType,
    source: 'seed',
    promptType: seed.promptType || PROMPT_TYPE.KNOWLEDGE,
    active: true,
  }
}

const GEO_PROMPT_SEED = GEO_TOPIC_SEED_ALL.map(buildPromptRow)

function findPromptByTopicSlug(slug) {
  return GEO_PROMPT_SEED.find((row) => row.topicSlug === slug) || null
}

function listActivePromptSeeds() {
  return GEO_PROMPT_SEED.filter((row) => row.active)
}

module.exports = {
  PROMPT_TYPE,
  GEO_PROMPT_SEED,
  findPromptByTopicSlug,
  listActivePromptSeeds,
}
