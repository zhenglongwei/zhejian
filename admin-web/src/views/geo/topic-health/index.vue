<template>
  <div v-loading="loading">
    <div class="page-head">
      <h2 class="page-title">专题健康度</h2>
      <el-button @click="loadData">刷新</el-button>
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
        <el-statistic title="已发布专题" :value="report.metrics?.published_count || 0" />
        <p v-if="report.metrics" class="metric-hint">
          目标 ≥{{ report.metrics.published_target || 50 }}
          <el-tag
            size="small"
            :type="report.metrics.published_target_met ? 'success' : 'warning'"
            class="ml-8"
          >
            {{ report.metrics.published_target_met ? '达标' : '未达标' }}
          </el-tag>
        </p>
      </el-col>
      <el-col :span="6">
        <el-statistic
          title="信息增量率 (G03)"
          :value="formatRate(report.metrics?.information_gain_rate)"
          suffix="%"
        />
      </el-col>
      <el-col :span="6">
        <el-statistic
          title="FAQ 完整度 (M02)"
          :value="formatRate(report.metrics?.topic_faq_completeness)"
          suffix="%"
        />
      </el-col>
      <el-col :span="6">
        <el-statistic
          title="挂载案例率 (M03)"
          :value="formatRate(report.metrics?.topic_with_case_rate)"
          suffix="%"
        />
      </el-col>
    </el-row>

    <el-row :gutter="16" class="mb-16">
      <el-col :span="6">
        <el-statistic
          title="有案例含 N= 率 (G03)"
          :value="formatRate(report.metrics?.topic_with_stats_rate)"
          suffix="%"
        />
      </el-col>
      <el-col :span="6">
        <el-statistic title="有案例专题" :value="report.metrics?.topic_with_case_mounted_count || 0" />
      </el-col>
      <el-col :span="6">
        <el-statistic
          title="聚合新鲜度 (G05)"
          :value="formatRate(report.metrics?.aggregate_freshness)"
          suffix="%"
        />
      </el-col>
      <el-col :span="6">
        <el-statistic title="聚合缓存覆盖" :value="report.metrics?.aggregate_cache_count || 0" />
      </el-col>
    </el-row>

    <el-row :gutter="16" class="mb-16">
      <el-col :span="6">
        <el-statistic title="可收录专题" :value="report.metrics?.indexable_count || 0" />
      </el-col>
      <el-col :span="6">
        <el-statistic title="含 N= 摘要" :value="report.metrics?.information_gain_count || 0" />
      </el-col>
      <el-col :span="6">
        <el-statistic title="≥3 FAQ" :value="report.metrics?.faq_complete_count || 0" />
      </el-col>
      <el-col :span="6">
        <el-statistic title="草稿待发布" :value="report.draftCount || 0" />
      </el-col>
    </el-row>

    <el-card shadow="never" header="服务页 noindex 审计 (G04)" class="mb-16">
      <el-row :gutter="16" class="mb-16">
        <el-col :span="6">
          <el-statistic title="服务页总数" :value="report.serviceAudit?.serviceCount || 0" />
        </el-col>
        <el-col :span="6">
          <el-statistic title="可收录" :value="report.serviceAudit?.indexableCount || 0" />
        </el-col>
        <el-col :span="6">
          <el-statistic title="noindex" :value="report.serviceAudit?.noindexCount || 0" />
        </el-col>
        <el-col :span="6">
          <el-statistic title="违规" :value="report.serviceAudit?.violationCount || 0" />
        </el-col>
      </el-row>
      <el-alert
        v-if="report.serviceAudit?.passed"
        type="success"
        :closable="false"
        title="无案例服务页均已 noindex，审计通过"
        show-icon
      />
      <el-table
        v-else
        :data="report.serviceAudit?.violations || []"
        border
        stripe
        size="small"
      >
        <el-table-column prop="slug" label="slug" min-width="160" />
        <el-table-column prop="name" label="服务" min-width="140" />
        <el-table-column prop="caseCount" label="案例数" width="90" />
        <el-table-column label="allowIndex" width="100">
          <template #default="{ row }">{{ row.allowIndex ? '是' : '否' }}</template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" min-width="200" />
      </el-table>
    </el-card>

    <el-card shadow="never" header="待修复专题（已发布但有告警）" class="mb-16">
      <el-empty
        v-if="!report.warningPages?.length"
        description="暂无告警专题"
      />
      <el-table v-else :data="report.warningPages" border stripe size="small">
        <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
        <el-table-column prop="slug" label="slug" min-width="180" show-overflow-tooltip />
        <el-table-column prop="city" label="城市" width="90" />
        <el-table-column prop="faqCount" label="FAQ" width="70" />
        <el-table-column prop="relatedCaseCount" label="案例" width="70" />
        <el-table-column label="N=" width="70">
          <template #default="{ row }">
            <el-tag :type="row.hasInformationGain ? 'success' : 'warning'" size="small">
              {{ row.hasInformationGain ? '有' : '缺' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="告警" min-width="200">
          <template #default="{ row }">{{ row.warnings?.join('；') }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="onEditTopic(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" header="已发布专题明细（最近 200 条）">
      <el-table :data="report.pages || []" border stripe size="small">
        <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
        <el-table-column prop="slug" label="slug" min-width="180" show-overflow-tooltip />
        <el-table-column prop="pageType" label="类型" width="110" />
        <el-table-column prop="status" label="状态" width="90" />
        <el-table-column prop="faqCount" label="FAQ" width="70" />
        <el-table-column prop="relatedCaseCount" label="案例" width="70" />
        <el-table-column label="N=" width="70">
          <template #default="{ row }">
            <el-tag :type="row.hasInformationGain ? 'success' : 'info'" size="small">
              {{ row.hasInformationGain ? '有' : '缺' }}
            </el-tag>
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
import { fetchTopicHealth } from '@/api/geo-obs'

const router = useRouter()
const loading = ref(false)
const report = ref({})

function formatRate(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0.0'
  return (num * 100).toFixed(1)
}

async function loadData() {
  loading.value = true
  try {
    report.value = await fetchTopicHealth()
  } catch (e) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

function onEditTopic(row) {
  if (!row?.id) return
  router.push({ name: 'geo-page-edit', params: { pageId: row.id } })
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
.ml-8 {
  margin-left: 8px;
}
.metric-hint {
  margin: 8px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
