<template>
  <div v-loading="loading">
    <h2 class="page-title">案例审核</h2>
    <p class="page-desc">
      商家确认完工并完成配图脱敏后进入待审。审公示案例稿与脱敏配图；通过后车主可查看并发布；驳回后商家可改再送审。脱敏异常可重试，本期不支持运营手工打码。
    </p>
    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane
        v-for="tab in CASE_TABS"
        :key="tab.key"
        :label="tab.label"
        :name="tab.key"
      />
    </el-tabs>

    <el-form :inline="true" class="filter-form" @submit.prevent="loadList">
      <el-form-item label="关键词">
        <el-input v-model="filters.keyword" clearable placeholder="案例标题" />
      </el-form-item>
      <el-form-item label="来源">
        <el-select v-model="filters.source" clearable style="width: 160px">
          <el-option
            v-for="opt in CASE_SOURCE_OPTIONS"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="loadList">查询</el-button>
      </el-form-item>
    </el-form>

    <el-table v-if="list.length" :data="list" border stripe @row-click="goDetail">
      <el-table-column prop="title" label="案例标题" min-width="200" show-overflow-tooltip />
      <el-table-column label="来源" width="130">
        <template #default="{ row }">
          <CaseSourceTag :source="row.source" :source-label="row.sourceLabel" />
        </template>
      </el-table-column>
      <el-table-column prop="storeName" label="门店" width="140" show-overflow-tooltip />
      <el-table-column prop="serviceName" label="服务项目" width="120" show-overflow-tooltip />
      <el-table-column prop="imageCount" label="图片数" width="80" />
      <el-table-column prop="status" label="状态" width="120">
        <template #default="{ row }">
          {{ statusLabel(row.status) }}
        </template>
      </el-table-column>
      <el-table-column prop="submittedAt" label="提交时间" width="170" />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="goDetail(row)">审核</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-else-if="!loading" description="暂无案例" />

    <el-pagination
      v-if="total > 0"
      class="pager"
      layout="total, prev, pager, next"
      :total="total"
      :page-size="pageSize"
      :current-page="page"
      @current-change="onPageChange"
    />
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchCaseList } from '@/api/case-review'
import { CASE_TABS, CASE_SOURCE_OPTIONS } from '@/constants/case-review'
import CaseSourceTag from '@/components/case-review/CaseSourceTag.vue'

const router = useRouter()
const activeTab = ref('pending')
const loading = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filters = reactive({
  keyword: '',
  source: '',
})

function statusLabel(status) {
  const map = {
    pending_desensitize: '脱敏处理中',
    pending_review: '待审核',
    review_passed: '已通过·待发布',
    public_approved: '已发布',
    rejected: '已驳回',
    need_modify: '已驳回',
    offline: '已下线',
  }
  return map[status] || status || '—'
}

async function loadList() {
  loading.value = true
  try {
    const data = await fetchCaseList({
      tab: activeTab.value,
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword || undefined,
      source: filters.source || undefined,
    })
    list.value = data.list || []
    total.value = data.total || 0
  } finally {
    loading.value = false
  }
}

function onTabChange() {
  page.value = 1
  loadList()
}

function onPageChange(p) {
  page.value = p
  loadList()
}

function goDetail(row) {
  const caseId = row.caseId || row.id
  router.push({ name: 'case-detail', params: { caseId } })
}

onMounted(loadList)
</script>

<style scoped>
.page-title {
  margin: 0 0 8px;
  font-size: 20px;
}
.page-desc {
  margin: 0 0 16px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}
.filter-form {
  margin-bottom: 12px;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
:deep(.el-table__row) {
  cursor: pointer;
}
</style>
