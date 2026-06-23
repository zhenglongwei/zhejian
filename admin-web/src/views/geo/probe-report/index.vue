<template>
  <div v-loading="loading">
    <div class="page-head">
      <h2 class="page-title">GEO 探测周报</h2>
      <div class="page-actions">
        <el-select v-model="days" style="width: 120px" @change="loadReport">
          <el-option :value="7" label="近 7 天" />
          <el-option :value="14" label="近 14 天" />
        </el-select>
        <el-select
          v-model="selectedEngine"
          style="width: 160px"
          placeholder="引擎"
          @change="loadReport"
        >
          <el-option value="" label="全部引擎" />
          <el-option
            v-for="item in engineOptions"
            :key="item.engine"
            :value="item.engine"
            :label="item.label"
          />
        </el-select>
        <el-button @click="onSyncSeeds">同步词库</el-button>
        <el-button type="primary" :loading="probing" @click="onRunProbe">运行探测</el-button>
      </div>
    </div>

    <el-alert
      v-if="report.disclaimer"
      class="mb-16"
      type="warning"
      :closable="false"
      :title="report.disclaimer"
      show-icon
    />
    <el-alert
      v-if="report.channelNote"
      class="mb-16"
      type="info"
      :closable="false"
      :title="report.channelNote"
      show-icon
    />

    <p v-if="citationHint" class="metric-hint mb-16">{{ citationHint }}</p>

    <el-row :gutter="16" class="mb-16">
      <el-col :span="6">
        <el-statistic
          :title="citationTitle"
          :value="formatRate(report.metrics?.prompt_probe_citation_rate)"
          suffix="%"
        />
      </el-col>
      <el-col :span="6">
        <el-statistic
          title="Mention 率"
          :value="formatRate(report.metrics?.prompt_probe_mention_rate)"
          suffix="%"
        />
      </el-col>
      <el-col :span="6">
        <el-statistic
          title="意图覆盖率 (P0)"
          :value="formatRate(report.metrics?.prompt_intent_coverage)"
          suffix="%"
        />
      </el-col>
      <el-col :span="6">
        <el-statistic title="有效探测数" :value="report.metrics?.probe_total || 0" />
      </el-col>
    </el-row>

    <el-row :gutter="16" class="mb-16">
      <el-col :span="6">
        <el-statistic
          title="FAQ 完整度 (M02)"
          :value="formatRate(report.metrics?.topic_faq_completeness)"
          suffix="%"
        />
      </el-col>
      <el-col :span="6">
        <el-statistic
          title="专题挂载案例率 (M03)"
          :value="formatRate(report.metrics?.topic_with_case_rate)"
          suffix="%"
        />
      </el-col>
      <el-col :span="6">
        <el-statistic title="已发布专题" :value="report.topicHealth?.published_count || 0" />
      </el-col>
      <el-col :span="6">
        <el-statistic title="≥3 FAQ 专题" :value="report.topicHealth?.faq_complete_count || 0" />
      </el-col>
    </el-row>

    <el-row :gutter="16" class="mb-16">
      <el-col :span="6">
        <el-statistic
          title="仅提及（无链接）"
          :value="report.usedVsCited?.mentioned_only || 0"
        />
      </el-col>
      <el-col :span="6">
        <el-statistic
          title="带链接引用"
          :value="report.usedVsCited?.cited_with_link || 0"
        />
      </el-col>
      <el-col :span="6">
        <el-statistic
          title="引后转化（P1）"
          :value="formatRate(report.metrics?.post_citation_lead_rate)"
          suffix="%"
        />
      </el-col>
      <el-col :span="6">
        <el-statistic
          title="引后咨询/电话"
          :value="report.postCitationLeads?.lead_event_count || 0"
        />
      </el-col>
    </el-row>

    <el-row :gutter="16" class="mb-16">
      <el-col :span="14">
        <el-card shadow="never" header="引擎对比（生态外 API 探测）">
          <el-table
            :data="comparisonRows"
            size="small"
            border
            highlight-current-row
            :row-class-name="engineRowClassName"
            @row-click="onEngineRowClick"
          >
            <el-table-column label="引擎" min-width="160">
              <template #default="{ row }">
                <span>{{ row.label }}</span>
                <el-tag v-if="row.engine === 'qwen'" size="small" type="primary" class="ml-8">
                  主曲线
                </el-tag>
                <el-tag v-else-if="row.tier === 2" size="small" type="info" class="ml-8">
                  Tier 2
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Citation 率" min-width="180">
              <template #default="{ row }">
                <div class="rate-cell">
                  <span>{{ formatRate(row.prompt_probe_citation_rate) }}%</span>
                  <el-progress
                    :percentage="Math.round(Number(row.prompt_probe_citation_rate || 0) * 1000) / 10"
                    :show-text="false"
                    :stroke-width="6"
                  />
                </div>
              </template>
            </el-table-column>
            <el-table-column label="Mention 率" width="100">
              <template #default="{ row }">{{ formatRate(row.prompt_probe_mention_rate) }}%</template>
            </el-table-column>
            <el-table-column prop="total" label="样本" width="72" />
            <el-table-column label="vs 千问" width="100">
              <template #default="{ row }">{{ formatVsQwen(row) }}</template>
            </el-table-column>
          </el-table>
          <p class="hint mt-8">点击行可切换上方引擎筛选；对比表始终展示周期内全引擎汇总。</p>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card shadow="never" header="意图覆盖">
          <p>Active Prompt：{{ report.metrics?.active_prompt_count || 0 }}</p>
          <p>已映射已发布专题：{{ report.metrics?.covered_prompt_count || 0 }}</p>
          <p v-if="report.coverage?.uncoveredPrompts?.length" class="hint">
            未覆盖示例：{{ report.coverage.uncoveredPrompts.join('、') }}
          </p>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" :header="recentResultsHeader">
      <el-table :data="report.recentResults || []" border stripe>
        <el-table-column prop="promptId" label="Prompt ID" width="180" show-overflow-tooltip />
        <el-table-column prop="prompt" label="Prompt" min-width="200" show-overflow-tooltip />
        <el-table-column prop="engineLabel" label="引擎" width="120" show-overflow-tooltip />
        <el-table-column prop="topicSlug" label="专题 slug" width="160" show-overflow-tooltip />
        <el-table-column label="Mention" width="90">
          <template #default="{ row }">
            <el-tag :type="row.mentioned ? 'success' : 'info'">{{ row.mentioned ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Used only" width="90">
          <template #default="{ row }">
            <el-tag :type="row.usedOnly ? 'warning' : 'info'">{{ row.usedOnly ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="citedUrl" label="Citation URL" min-width="200" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="90" />
        <el-table-column prop="probedAt" label="时间" width="170" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchProbeReport, runProbeBatch, syncProbeSeeds } from '@/api/geo-obs'

const loading = ref(false)
const probing = ref(false)
const days = ref(7)
const selectedEngine = ref('')
const report = ref({ metrics: {}, recentResults: [], byEngine: [] })

const qwenCitationRate = computed(() => {
  const qwen = (report.value.byEngine || []).find((row) => row.engine === 'qwen')
  return qwen?.prompt_probe_citation_rate ?? null
})

const engineOptions = computed(() => {
  const map = new Map()
  ;(report.value.byEngine || []).forEach((row) => {
    map.set(row.engine, { engine: row.engine, label: row.label })
  })
  ;(report.value.enabledEngines || []).forEach((row) => {
    const id = row.id || row.engine
    if (!id || map.has(id)) return
    map.set(id, { engine: id, label: row.label || id })
  })
  return [...map.values()]
})

const comparisonRows = computed(() => {
  const map = new Map()
  ;(report.value.byEngine || []).forEach((row) => {
    map.set(row.engine, { ...row })
  })
  ;(report.value.enabledEngines || []).forEach((cfg) => {
    const id = cfg.id || cfg.engine
    if (!id || map.has(id)) return
    map.set(id, {
      engine: id,
      label: cfg.label || id,
      tier: cfg.tier || 0,
      total: 0,
      prompt_probe_citation_rate: 0,
      prompt_probe_mention_rate: 0,
    })
  })
  return [...map.values()].sort((a, b) => (a.tier || 99) - (b.tier || 99) || b.total - a.total)
})

const citationTitle = computed(() => {
  if (selectedEngine.value === 'qwen') return 'Citation 率 (P0 · 主曲线)'
  if (selectedEngine.value) return 'Citation 率（单引擎）'
  return 'Citation 率 (P0 · 混合)'
})

const citationHint = computed(() => {
  if (selectedEngine.value) {
    const label = report.value.filter?.engineLabel || selectedEngine.value
    return `当前筛选：${label}；引后转化等指标仅含该引擎探测样本。`
  }
  const qwenRate = report.value.metrics?.prompt_probe_citation_rate_qwen
  if (qwenRate != null) {
    return `顶部 Citation 为全引擎混合值；北极星主曲线（通义千问）= ${formatRate(qwenRate)}%。`
  }
  return '顶部 Citation 为全引擎混合值；主曲线见通义千问行。'
})

const recentResultsHeader = computed(() => {
  if (selectedEngine.value && report.value.filter?.engineLabel) {
    return `最近探测结果 · ${report.value.filter.engineLabel}（最多 20 条）`
  }
  return '最近探测结果（全引擎 · 最多 20 条）'
})

function formatRate(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0.0'
  return (num * 100).toFixed(1)
}

function formatVsQwen(row) {
  if (row.engine === 'qwen') return '—'
  const base = qwenCitationRate.value
  if (base == null || !row.total) return '—'
  const delta = (Number(row.prompt_probe_citation_rate) - Number(base)) * 100
  if (!Number.isFinite(delta)) return '—'
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)} pp`
}

function engineRowClassName({ row }) {
  if (row.engine === selectedEngine.value) return 'engine-row-active'
  if (row.engine === 'qwen') return 'engine-row-primary'
  return ''
}

function onEngineRowClick(row) {
  const next = selectedEngine.value === row.engine ? '' : row.engine
  if (next === selectedEngine.value) return
  selectedEngine.value = next
  loadReport()
}

async function loadReport() {
  loading.value = true
  try {
    const params = { days: days.value }
    if (selectedEngine.value) params.engine = selectedEngine.value
    report.value = await fetchProbeReport(params)
    if (report.value.filter?.engine && report.value.filter.engine !== selectedEngine.value) {
      selectedEngine.value = report.value.filter.engine
    }
  } finally {
    loading.value = false
  }
}

async function onSyncSeeds() {
  const data = await syncProbeSeeds()
  ElMessage.success(`词库同步完成：新增 ${data.created}，更新 ${data.updated}`)
  await loadReport()
}

async function onRunProbe() {
  probing.value = true
  try {
    const data = await runProbeBatch({ limit: 20 })
    ElMessage.success(`探测完成：${data.processed} 条`)
    await loadReport()
  } finally {
    probing.value = false
  }
}

onMounted(loadReport)
</script>

<style scoped>
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.page-title {
  margin: 0;
  font-size: 20px;
}
.page-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.mb-16 {
  margin-bottom: 16px;
}
.mt-8 {
  margin-top: 8px;
}
.ml-8 {
  margin-left: 8px;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.metric-hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin: 0;
}
.rate-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
:deep(.engine-row-primary) {
  --el-table-tr-bg-color: var(--el-color-primary-light-9);
}
:deep(.engine-row-active) {
  --el-table-tr-bg-color: var(--el-color-success-light-9);
}
</style>
