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

    <el-card shadow="never" class="mt-16">
      <template #header>
        <div class="card-head">
          <span>车型选题雷达（人工建专题）</span>
          <el-select v-model="vehicleMinSample" style="width: 120px" @change="loadVehicleSeeds">
            <el-option :value="3" label="≥3 例" />
            <el-option :value="5" label="≥5 例" />
            <el-option :value="8" label="≥8 例" />
          </el-select>
        </div>
      </template>
      <el-alert
        v-if="vehicleReport.disclaimer"
        class="mb-16"
        type="warning"
        :closable="false"
        :title="vehicleReport.disclaimer"
        show-icon
      />
      <el-row :gutter="16" class="mb-16">
        <el-col :span="8">
          <el-statistic title="候选选题" :value="vehicleReport.metrics?.seedCount || 0" />
        </el-col>
        <el-col :span="8">
          <el-statistic title="缺专题" :value="vehicleReport.metrics?.missingTopicCount || 0" />
        </el-col>
        <el-col :span="8">
          <el-statistic title="已发布" :value="vehicleReport.metrics?.publishedTopicCount || 0" />
        </el-col>
      </el-row>
      <el-table v-loading="vehicleLoading" :data="vehicleReport.seeds || []" border stripe size="small">
        <el-table-column prop="vehicleSeries" label="车型/车系" width="120" />
        <el-table-column prop="serviceName" label="服务" min-width="120" />
        <el-table-column prop="caseCount" label="案例数" width="80" />
        <el-table-column label="专题" width="90">
          <template #default="{ row }">
            {{ row.hasTopic ? (row.topicStatus === 'published' ? '已发布' : '草稿') : '无' }}
          </template>
        </el-table-column>
        <el-table-column prop="slug" label="slug" min-width="180" show-overflow-tooltip />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.recommendedAction === 'create_draft'"
              link
              type="primary"
              :loading="creatingSlug === row.slug"
              @click="onCreateVehicleDraft(row)"
            >
              创建草稿
            </el-button>
            <el-button
              v-else-if="row.recommendedAction === 'edit_draft'"
              link
              type="primary"
              @click="onEditVehicleTopic(row)"
            >
              编辑草稿
            </el-button>
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { fetchCitationGaps, fetchVehicleTopicSeeds, createVehicleTopicDraft } from '@/api/geo-obs'

const router = useRouter()
const loading = ref(false)
const days = ref(14)
const report = ref({})
const vehicleLoading = ref(false)
const vehicleMinSample = ref(3)
const vehicleReport = ref({})
const creatingSlug = ref('')

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

async function loadVehicleSeeds() {
  vehicleLoading.value = true
  try {
    vehicleReport.value = await fetchVehicleTopicSeeds({
      minSample: vehicleMinSample.value,
      limit: 20,
    })
  } catch (e) {
    ElMessage.error(e?.message || '车型选题加载失败')
  } finally {
    vehicleLoading.value = false
  }
}

async function onCreateVehicleDraft(row) {
  if (!row?.slug) return
  creatingSlug.value = row.slug
  try {
    const created = await createVehicleTopicDraft(row.slug)
    ElMessage.success('已创建草稿，请核对后发布')
    router.push({ name: 'geo-page-edit', params: { pageId: created.id || created.slug } })
    await loadVehicleSeeds()
  } catch (e) {
    ElMessage.error(e?.message || '创建失败')
  } finally {
    creatingSlug.value = ''
  }
}

function onEditVehicleTopic(row) {
  if (!row?.slug) return
  router.push({ name: 'geo-page-list', query: { q: row.slug } })
}

onMounted(() => {
  loadData()
  loadVehicleSeeds()
})
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
.mt-16 {
  margin-top: 16px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.text-muted {
  color: var(--el-text-color-secondary);
}
</style>
