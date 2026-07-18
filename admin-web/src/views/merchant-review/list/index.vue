<template>
  <div v-loading="loading">
    <h2 class="page-title">商家审核</h2>
    <MerchantHubNav active="onboarding" />
    <p class="page-desc">
      审核商家首次入驻申请（主体、执照、门店基础信息）。已通过商家的技师/设备/品牌授权变更请切换到「能力变更」。
    </p>
    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane
        v-for="tab in MERCHANT_TABS"
        :key="tab.key"
        :label="tab.label"
        :name="tab.key"
      />
    </el-tabs>

    <el-form :inline="true" class="filter-form" @submit.prevent="loadList">
      <el-form-item label="关键词">
        <el-input v-model="filters.keyword" clearable placeholder="门店/地址/负责人" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="loadList">查询</el-button>
      </el-form-item>
    </el-form>

    <el-table v-if="list.length" :data="list" border stripe @row-click="goDetail">
      <el-table-column prop="storeName" label="门店名称" min-width="160" show-overflow-tooltip />
      <el-table-column prop="contactName" label="负责人" width="100" />
      <el-table-column prop="phoneMasked" label="手机号" width="130" />
      <el-table-column prop="address" label="地址" min-width="200" show-overflow-tooltip />
      <el-table-column prop="serviceCount" label="擅长服务" width="90" />
      <el-table-column prop="statusLabel" label="状态" width="100" />
      <el-table-column prop="submittedAt" label="提交时间" width="170" />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="goDetail(row)">审核</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-else-if="!loading" description="暂无商家入驻申请" />

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
import { fetchMerchantList } from '@/api/merchant-review'
import { MERCHANT_TABS } from '@/constants/merchant-review'
import MerchantHubNav from '@/components/merchant-review/MerchantHubNav.vue'

const router = useRouter()
const activeTab = ref('pending')
const loading = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filters = reactive({
  keyword: '',
})

async function loadList() {
  loading.value = true
  try {
    const data = await fetchMerchantList({
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
  const merchantId = row.merchantId || row.id
  router.push({ name: 'merchant-detail', params: { merchantId } })
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
