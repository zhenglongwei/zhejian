<template>
  <div v-loading="loading">
    <GateReviewNav />
    <h2 class="page-title">相册完工合规（闸门 A）</h2>
    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane
        v-for="tab in ALBUM_COMPLIANCE_TABS"
        :key="tab.key"
        :label="tab.label"
        :name="tab.key"
      />
    </el-tabs>

    <el-form :inline="true" class="filter-form" @submit.prevent="loadList">
      <el-form-item label="关键词">
        <el-input v-model="filters.keyword" clearable placeholder="门店/服务/相册ID" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="loadList">查询</el-button>
      </el-form-item>
    </el-form>

    <el-table v-if="list.length" :data="list" border stripe @row-click="goDetail">
      <el-table-column prop="serviceName" label="服务项目" min-width="140" show-overflow-tooltip />
      <el-table-column prop="storeName" label="门店" width="140" show-overflow-tooltip />
      <el-table-column prop="albumId" label="相册ID" width="180" show-overflow-tooltip />
      <el-table-column prop="imageCount" label="图片数" width="80" />
      <el-table-column label="合规状态" width="100">
        <template #default="{ row }">
          {{ ALBUM_COMPLIANCE_STATUS_LABEL[row.complianceStatus] || row.complianceStatus }}
        </template>
      </el-table-column>
      <el-table-column prop="complianceReviewMode" label="审核方式" width="100" />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="goDetail(row)">审核</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-else-if="!loading" description="暂无待审相册" />

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
import { fetchAlbumComplianceList } from '@/api/album-compliance'
import {
  ALBUM_COMPLIANCE_TABS,
  ALBUM_COMPLIANCE_STATUS_LABEL,
} from '@/constants/album-compliance'
import GateReviewNav from '@/components/case-review/GateReviewNav.vue'

const router = useRouter()
const activeTab = ref('spot_check')
const loading = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filters = reactive({ keyword: '' })

async function loadList() {
  loading.value = true
  try {
    const data = await fetchAlbumComplianceList({
      tab: activeTab.value,
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword || undefined,
    })
    list.value = data.list || []
    total.value = data.pagination?.total || 0
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
  router.push({ name: 'album-compliance-detail', params: { albumId: row.albumId } })
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
