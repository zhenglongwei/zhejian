<template>
  <div v-loading="loading">
    <h2 class="page-title">商家审核</h2>
    <MerchantHubNav active="capability" />
    <p class="page-desc">
      已入驻商家修改技师公示、设备/场（含实景）、品牌授权及有效期后进入本队列；通过前公示页仍显示旧版。营业时间、擅长品牌、暂不承接即时生效，不进本队列。
    </p>
    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane label="待审核" name="pending" />
      <el-tab-pane label="已驳回" name="rejected" />
    </el-tabs>

    <el-table v-if="list.length" :data="list" border stripe @row-click="goDetail">
      <el-table-column prop="storeName" label="门店" min-width="160" show-overflow-tooltip />
      <el-table-column prop="merchantName" label="商家" width="140" show-overflow-tooltip />
      <el-table-column prop="contactName" label="联系人" width="100" />
      <el-table-column prop="technicianCount" label="技师数" width="80" />
      <el-table-column prop="equipmentCount" label="设备数" width="80" />
      <el-table-column prop="reviewStatus" label="状态" width="100" />
      <el-table-column prop="submittedAt" label="提交时间" width="180" />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="goDetail(row)">审核</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-else-if="!loading" description="暂无待审能力变更" />

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
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchStoreCapabilityList } from '@/api/store-capability-review'
import MerchantHubNav from '@/components/merchant-review/MerchantHubNav.vue'

const router = useRouter()
const activeTab = ref('pending')
const loading = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

async function loadList() {
  loading.value = true
  try {
    const data = await fetchStoreCapabilityList({
      tab: activeTab.value,
      page: page.value,
      pageSize: pageSize.value,
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
  router.push({ name: 'store-capability-detail', params: { storeId: row.storeId } })
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
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
:deep(.el-table__row) {
  cursor: pointer;
}
</style>
