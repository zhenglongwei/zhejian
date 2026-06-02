<template>
  <div v-loading="loading">
    <h2 class="page-title">服务监管（抽查）</h2>
    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane
        v-for="tab in SERVICE_TABS"
        :key="tab.key"
        :label="tab.label"
        :name="tab.key"
      />
    </el-tabs>

    <el-form :inline="true" class="filter-form" @submit.prevent="loadList">
      <el-form-item label="关键词">
        <el-input v-model="filters.keyword" clearable placeholder="方案名称/简介" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="loadList">查询</el-button>
      </el-form-item>
    </el-form>

    <el-table v-if="list.length" :data="list" border stripe @row-click="goDetail">
      <el-table-column prop="name" label="方案名称" min-width="160" show-overflow-tooltip />
      <el-table-column prop="storeName" label="门店" min-width="140" show-overflow-tooltip />
      <el-table-column prop="serviceItemName" label="标准项目" width="120" />
      <el-table-column label="价格模式" width="100">
        <template #default="{ row }">
          {{ PRICE_MODE_LABEL[row.priceMode] || row.priceMode }}
        </template>
      </el-table-column>
      <el-table-column prop="saleStatusLabel" label="状态" width="110" />
      <el-table-column prop="publishedAt" label="上架时间" width="170" />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="goDetail(row)">查看</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-else-if="!loading" description="暂无服务方案" />

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
import { fetchServicePlanList } from '@/api/service-review'
import { SERVICE_TABS, PRICE_MODE_LABEL } from '@/constants/service-review'

const router = useRouter()
const activeTab = ref('online')
const loading = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filters = reactive({ keyword: '' })

async function loadList() {
  loading.value = true
  try {
    const data = await fetchServicePlanList({
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
  router.push({ name: 'service-detail', params: { planId: row.planId } })
}

onMounted(loadList)
</script>

<style scoped>
.page-title {
  margin: 0 0 12px;
  font-size: 20px;
}
.filter-form {
  margin-bottom: 12px;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
