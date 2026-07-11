<template>
  <div v-loading="loading">
    <el-page-header @back="goBack">
      <template #content>
        <span class="detail-title">授权留痕详情</span>
        <el-tag v-if="detail.authTypeLabel" class="detail-tag">{{ detail.authTypeLabel }}</el-tag>
        <el-tag
          v-if="detail.authStatus"
          class="detail-tag"
          :type="detail.authStatus === 'authorized' ? 'success' : 'info'"
        >
          {{ authStatusLabel(detail.authStatus) }}
        </el-tag>
      </template>
    </el-page-header>

    <el-alert
      title="授权文案快照为用户当时勾选的原文，用于合规留痕；请勿对外展示完整用户标识。"
      type="info"
      :closable="false"
      show-icon
      class="notice"
    />

    <el-row :gutter="16" class="section">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>授权信息</template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="留痕 ID">{{ detail.id }}</el-descriptions-item>
            <el-descriptions-item label="授权类型">{{ detail.authTypeLabel }}</el-descriptions-item>
            <el-descriptions-item label="类型代码">{{ detail.authType }}</el-descriptions-item>
            <el-descriptions-item label="文案版本">{{ detail.authTextVersion }}</el-descriptions-item>
            <el-descriptions-item label="业务 ID">{{ detail.businessId || '—' }}</el-descriptions-item>
            <el-descriptions-item label="授权时间">{{ detail.authTime || '—' }}</el-descriptions-item>
            <el-descriptions-item label="撤回时间">{{ detail.revokeTime || '—' }}</el-descriptions-item>
            <el-descriptions-item label="备注">{{ detail.remark || '—' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>用户与上下文</template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="用户 ID">{{ detail.userId }}</el-descriptions-item>
            <el-descriptions-item label="昵称">{{ detail.userNickname || '—' }}</el-descriptions-item>
            <el-descriptions-item label="手机">{{ detail.userPhoneMasked || '—' }}</el-descriptions-item>
            <el-descriptions-item label="客户端">{{ clientTypeLabel(detail.clientType) }}</el-descriptions-item>
            <el-descriptions-item label="IP">{{ detail.ip || '—' }}</el-descriptions-item>
            <el-descriptions-item label="记录时间">{{ detail.createdAt || '—' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="section">
      <template #header>授权文案快照</template>
      <p class="content-block">{{ detail.authTextSnapshot || '—' }}</p>
    </el-card>

    <el-card v-if="detail.deviceInfo" shadow="never" class="section">
      <template #header>设备信息</template>
      <p class="content-block content-block--mono">{{ detail.deviceInfo }}</p>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchAuthorizationLogDetail } from '@/api/authorization-logs'
import { authStatusLabel, clientTypeLabel } from '@/constants/authorization-logs'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const detail = ref({})

async function loadDetail() {
  loading.value = true
  try {
    detail.value = await fetchAuthorizationLogDetail(route.params.logId)
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push({ name: 'authorization-log-list' })
}

onMounted(loadDetail)
</script>

<style scoped>
.detail-title {
  font-size: 18px;
  font-weight: 600;
}
.detail-tag {
  margin-left: 8px;
}
.notice {
  margin-top: 16px;
}
.section {
  margin-top: 16px;
}
.content-block {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.6;
}
.content-block--mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  word-break: break-all;
}
</style>
