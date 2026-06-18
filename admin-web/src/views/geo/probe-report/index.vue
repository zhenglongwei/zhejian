<template>
  <div v-loading="loading">
    <div class="page-head">
      <h2 class="page-title">GEO 探测周报</h2>
      <div class="page-actions">
        <el-select v-model="days" style="width: 120px" @change="loadReport">
          <el-option :value="7" label="近 7 天" />
          <el-option :value="14" label="近 14 天" />
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

    <el-row :gutter="16" class="mb-16">
      <el-col :span="6">
        <el-statistic
          title="Citation 率 (P0)"
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
      <el-col :span="12">
        <el-card shadow="never" header="按引擎">
          <el-table :data="report.byEngine || []" size="small" border>
            <el-table-column prop="engine" label="引擎" width="120" />
            <el-table-column label="Citation 率" width="120">
              <template #default="{ row }">{{ formatRate(row.prompt_probe_citation_rate) }}%</template>
            </el-table-column>
            <el-table-column label="Mention 率" width="120">
              <template #default="{ row }">{{ formatRate(row.prompt_probe_mention_rate) }}%</template>
            </el-table-column>
            <el-table-column prop="total" label="样本" width="80" />
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never" header="意图覆盖">
          <p>Active Prompt：{{ report.metrics?.active_prompt_count || 0 }}</p>
          <p>已映射已发布专题：{{ report.metrics?.covered_prompt_count || 0 }}</p>
          <p v-if="report.coverage?.uncoveredPrompts?.length" class="hint">
            未覆盖示例：{{ report.coverage.uncoveredPrompts.join('、') }}
          </p>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" header="最近探测结果">
      <el-table :data="report.recentResults || []" border stripe>
        <el-table-column prop="promptId" label="Prompt ID" width="180" show-overflow-tooltip />
        <el-table-column prop="prompt" label="Prompt" min-width="240" show-overflow-tooltip />
        <el-table-column prop="topicSlug" label="专题 slug" width="180" show-overflow-tooltip />
        <el-table-column label="Mention" width="90">
          <template #default="{ row }">
            <el-tag :type="row.mentioned ? 'success' : 'info'">{{ row.mentioned ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="citedUrl" label="Citation URL" min-width="220" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="90" />
        <el-table-column prop="probedAt" label="时间" width="170" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchProbeReport, runProbeBatch, syncProbeSeeds } from '@/api/geo-obs'

const loading = ref(false)
const probing = ref(false)
const days = ref(7)
const report = ref({ metrics: {}, recentResults: [] })

function formatRate(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0.0'
  return (num * 100).toFixed(1)
}

async function loadReport() {
  loading.value = true
  try {
    report.value = await fetchProbeReport({ days: days.value })
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
}
.mb-16 {
  margin-bottom: 16px;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
