<template>
  <div v-loading="loading">
    <div class="page-head">
      <h2 class="page-title">Citation Gap</h2>
      <el-select v-model="days" style="width: 120px" @change="loadData">
        <el-option :value="14" label="近 14 天" />
        <el-option :value="30" label="近 30 天" />
      </el-select>
    </div>

    <el-alert
      v-if="report.disclaimer"
      class="mb-16"
      type="info"
      :closable="false"
      :title="report.disclaimer"
      show-icon
    />

    <el-row :gutter="16" class="mb-16">
      <el-col :span="6">
        <el-statistic title="意图组合" :value="report.metrics?.intent_count || 0" />
      </el-col>
      <el-col :span="6">
        <el-statistic title="高 Gap" :value="report.metrics?.high_gap_count || 0" />
      </el-col>
      <el-col :span="6">
        <el-statistic title="缺专题" :value="report.metrics?.topic_missing_count || 0" />
      </el-col>
      <el-col :span="6">
        <el-statistic title="零案例意图" :value="report.metrics?.zero_case_intent_count || 0" />
      </el-col>
    </el-row>

    <el-card shadow="never" header="Top Gap（优先补案例/专题）" class="mb-16">
      <el-table :data="report.topGaps || []" border stripe>
        <el-table-column prop="city" label="城市" width="100" />
        <el-table-column prop="service" label="服务" min-width="140" />
        <el-table-column prop="citationGapScore" label="Gap 分" width="90" sortable />
        <el-table-column prop="publicCaseCount" label="公开案例" width="100" />
        <el-table-column label="专题" width="80">
          <template #default="{ row }">{{ row.hasTopic ? '有' : '无' }}</template>
        </el-table-column>
        <el-table-column prop="probeCitationCount" label="探测引用" width="100" />
        <el-table-column prop="usedOnlyCount" label="仅提及" width="90" />
        <el-table-column prop="recommendedAction" label="建议动作" width="100" />
      </el-table>
    </el-card>

    <el-card shadow="never" header="专题待办（T+）">
      <el-table :data="report.topicTodos || []" border size="small">
        <el-table-column prop="city" label="城市" width="100" />
        <el-table-column prop="service" label="服务" min-width="160" />
        <el-table-column prop="citationGapScore" label="Gap 分" width="90" />
        <el-table-column prop="reason" label="原因" min-width="200" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchCitationGaps } from '@/api/geo-obs'

const loading = ref(false)
const days = ref(14)
const report = ref({})

async function loadData() {
  loading.value = true
  try {
    report.value = await fetchCitationGaps({ days: days.value, limit: 10 })
  } catch (e) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
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
}
.mb-16 {
  margin-bottom: 16px;
}
</style>
