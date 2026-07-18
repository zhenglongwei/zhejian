<template>
  <div v-loading="loading">
    <h2 class="page-title">用户授权记录</h2>

    <el-alert
      title="这是用户在小程序/H5 勾选协议时的合规留痕（如案例公开、相册关联、入驻协议等），不是「品牌授权证明」。类型多是因为不同业务场景各记一条，便于争议追溯；日常运营可按「案例公开 / 相册」筛选查看。"
      type="info"
      :closable="false"
      show-icon
      class="notice"
    />

    <el-form :inline="true" class="filter-form" @submit.prevent="onSearch">
      <el-form-item label="授权类型">
        <el-select v-model="filters.authType" clearable style="width: 160px">
          <el-option
            v-for="opt in AUTH_TYPE_OPTIONS"
            :key="opt.value || 'all'"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="用户 ID">
        <el-input v-model="filters.userId" clearable placeholder="user_xxx" style="width: 200px" />
      </el-form-item>
      <el-form-item label="业务 ID">
        <el-input v-model="filters.businessId" clearable placeholder="线索/相册/案例等" style="width: 200px" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="onSearch">查询</el-button>
        <el-button @click="onReset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table v-if="list.length" :data="list" border stripe @row-click="goDetail">
      <el-table-column prop="authTypeLabel" label="授权类型" width="120" />
      <el-table-column prop="userNickname" label="用户" width="120" show-overflow-tooltip />
      <el-table-column prop="userPhoneMasked" label="手机" width="130" />
      <el-table-column prop="businessId" label="业务 ID" min-width="140" show-overflow-tooltip />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.authStatus === 'authorized' ? 'success' : 'info'" size="small">
            {{ authStatusLabel(row.authStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="authTextVersion" label="文案版本" width="100" />
      <el-table-column prop="authTextSnapshotPreview" label="授权文案" min-width="220" show-overflow-tooltip />
      <el-table-column label="客户端" width="90">
        <template #default="{ row }">{{ clientTypeLabel(row.clientType) }}</template>
      </el-table-column>
      <el-table-column prop="ip" label="IP" width="130" show-overflow-tooltip />
      <el-table-column prop="authTime" label="授权时间" width="170" />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="goDetail(row)">查看</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-else-if="!loading" description="暂无授权留痕" />

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
import { fetchAuthorizationLogList } from '@/api/authorization-logs'
import {
  AUTH_TYPE_OPTIONS,
  authStatusLabel,
  clientTypeLabel,
} from '@/constants/authorization-logs'

const router = useRouter()
const loading = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filters = reactive({
  authType: '',
  userId: '',
  businessId: '',
})

async function loadList() {
  loading.value = true
  try {
    const data = await fetchAuthorizationLogList({
      page: page.value,
      pageSize: pageSize.value,
      authType: filters.authType || undefined,
      userId: filters.userId.trim() || undefined,
      businessId: filters.businessId.trim() || undefined,
    })
    list.value = data.list || []
    total.value = data.total || 0
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  loadList()
}

function onReset() {
  filters.authType = ''
  filters.userId = ''
  filters.businessId = ''
  page.value = 1
  loadList()
}

function onPageChange(p) {
  page.value = p
  loadList()
}

function goDetail(row) {
  router.push({ name: 'authorization-log-detail', params: { logId: row.id } })
}

onMounted(loadList)
</script>

<style scoped>
.page-title {
  margin: 0 0 16px;
  font-size: 20px;
}
.notice {
  margin-bottom: 16px;
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
