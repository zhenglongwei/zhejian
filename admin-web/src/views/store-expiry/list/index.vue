<template>
  <div v-loading="loading">
    <h2 class="page-title">商家审核</h2>
    <MerchantHubNav active="expiry" />
    <p class="page-desc">
      系统按「有效期 vs 今天」自动扫描，无需人工录入。品牌授权或维修资质：即将过期（≤30 天）或已过期会出现在此列表。过期授权已在公示页自动隐藏，并参与列表轻降权；运营据此联系商家续期即可。
    </p>
    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane label="全部" name="all" />
      <el-tab-pane label="即将过期" name="expiring" />
      <el-tab-pane label="已过期" name="expired" />
    </el-tabs>

    <el-alert
      v-if="asOfDate"
      class="asof"
      type="info"
      :closable="false"
      :title="`自动扫描截至 ${asOfDate}（刷新页面即可更新）`"
    />

    <el-table v-if="list.length" :data="list" border stripe>
      <el-table-column prop="storeName" label="门店" min-width="160" show-overflow-tooltip />
      <el-table-column prop="merchantName" label="商家" width="140" show-overflow-tooltip />
      <el-table-column prop="contactName" label="联系人" width="100" />
      <el-table-column prop="kindLabel" label="类型" width="100" />
      <el-table-column prop="validUntil" label="有效期至" width="120" />
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="row.expiryStatus === 'expired' ? 'danger' : 'warning'" size="small">
            {{ row.expiryStatusLabel }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="剩余天数" width="100">
        <template #default="{ row }">
          {{ row.daysLeft == null ? '—' : row.daysLeft }}
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-else-if="!loading" description="当前没有即将到期或已过期的资质/授权" />

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
import { fetchStoreExpiryFollowUps } from '@/api/store-expiry'
import MerchantHubNav from '@/components/merchant-review/MerchantHubNav.vue'

const activeTab = ref('all')
const loading = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const asOfDate = ref('')

async function loadList() {
  loading.value = true
  try {
    const data = await fetchStoreExpiryFollowUps({
      tab: activeTab.value,
      page: page.value,
      pageSize: pageSize.value,
    })
    list.value = data.list || []
    total.value = data.total || 0
    asOfDate.value = data.asOfDate || ''
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
.asof {
  margin-bottom: 12px;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
