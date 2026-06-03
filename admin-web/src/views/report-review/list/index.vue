<template>
  <div v-loading="loading">
    <h2 class="page-title">举报管理</h2>
    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane
        v-for="tab in REPORT_TABS"
        :key="tab.key"
        :label="tab.label"
        :name="tab.key"
      />
    </el-tabs>

    <el-form :inline="true" class="filter-form" @submit.prevent="loadList">
      <el-form-item label="关键词">
        <el-input v-model="filters.keyword" clearable placeholder="对象标题/ID/说明" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="loadList">查询</el-button>
      </el-form-item>
    </el-form>

    <el-table v-if="list.length" :data="list" border stripe @row-click="goDetail">
      <el-table-column prop="targetTypeLabel" label="对象类型" width="90" />
      <el-table-column prop="targetTitle" label="对象" min-width="160" show-overflow-tooltip />
      <el-table-column prop="reportTypeLabel" label="举报类型" width="150" show-overflow-tooltip />
      <el-table-column prop="reporterPhoneMasked" label="举报人手机" width="130" />
      <el-table-column prop="statusLabel" label="状态" width="100" />
      <el-table-column prop="createdAt" label="提交时间" width="170" />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="goDetail(row)">查看</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-else-if="!loading" description="暂无举报工单" />

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
import { fetchReportList } from '@/api/report-review'
import { REPORT_TABS } from '@/constants/report-review'

const router = useRouter()
const activeTab = ref('pending')
const loading = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filters = reactive({ keyword: '' })

async function loadList() {
  loading.value = true
  try {
    const data = await fetchReportList({
      tab: activeTab.value,
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword || undefined,
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
  router.push({ name: 'report-detail', params: { reportId: row.id } })
}

onMounted(loadList)
</script>

<style scoped>
.page-title {
  margin: 0 0 16px;
  font-size: 20px;
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
