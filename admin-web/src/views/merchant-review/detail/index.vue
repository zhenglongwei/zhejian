<template>
  <div v-loading="loading">
    <el-page-header @back="goBack">
      <template #content>
        <span class="detail-title">{{ detail.storeName || '商家审核' }}</span>
        <el-tag v-if="detail.statusLabel" class="detail-tag">{{ detail.statusLabel }}</el-tag>
      </template>
    </el-page-header>

    <el-alert
      v-for="(line, i) in COMPLIANCE_NOTICES"
      :key="i"
      :title="line"
      type="info"
      :closable="false"
      show-icon
      class="notice"
    />

    <el-row :gutter="16" class="section">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>基础信息</template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="商家 ID">{{ detail.merchantId }}</el-descriptions-item>
            <el-descriptions-item label="门店 ID">{{ detail.storeId }}</el-descriptions-item>
            <el-descriptions-item label="状态">{{ detail.statusLabel }}</el-descriptions-item>
            <el-descriptions-item label="门店名称">{{ detail.storeName }}</el-descriptions-item>
            <el-descriptions-item label="负责人">{{ detail.contactName }}</el-descriptions-item>
            <el-descriptions-item label="手机号">{{ detail.phoneMasked || '—' }}</el-descriptions-item>
            <el-descriptions-item label="地址">{{ detail.address }}</el-descriptions-item>
            <el-descriptions-item label="提交时间">{{ detail.submittedAt || '—' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>擅长服务</template>
          <div v-if="detail.services?.length" class="service-tags">
            <el-tag v-for="name in detail.services" :key="name" class="service-tag">{{ name }}</el-tag>
          </div>
          <el-empty v-else description="未选择擅长服务" :image-size="48" />
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="section">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>辙见要求确认</template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="已同意平台要求">
              {{ detail.agreedAt ? '是' : '否' }}
            </el-descriptions-item>
            <el-descriptions-item v-if="detail.agreedAt" label="确认时间">
              {{ detail.agreedAt }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>资质材料</template>
          <el-empty description="完整资质审核见 B-MERCH-03（营业执照/门头照等）" :image-size="48" />
        </el-card>
      </el-col>
    </el-row>

    <el-card v-if="detail.rejectReason" shadow="never" class="section">
      <template #header>审核意见</template>
      <p class="reject-reason">{{ detail.rejectReason }}</p>
    </el-card>

    <el-card shadow="never" class="section">
      <template #header>审核操作</template>
      <ReviewActionBar
        ref="actionRef"
        :loading="submitting"
        :can-review="detail.status === 'PENDING_AUDIT'"
        :approve-label="APPROVE_ACTION_LABEL"
        :reason-options="MERCHANT_REJECT_REASONS"
        @approve="onApprove"
        @reject="onReject"
        @request-modify="onRequestModify"
      />
    </el-card>

    <el-card shadow="never" class="section">
      <template #header>审核日志</template>
      <AuditLogTimeline :logs="detail.reviewLogs" :approve-label="APPROVE_ACTION_LABEL" />
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  fetchMerchantDetail,
  approveMerchant,
  rejectMerchant,
  requestModifyMerchant,
} from '@/api/merchant-review'
import {
  COMPLIANCE_NOTICES,
  MERCHANT_REJECT_REASONS,
  APPROVE_ACTION_LABEL,
} from '@/constants/merchant-review'
import ReviewActionBar from '@/components/case-review/ReviewActionBar.vue'
import AuditLogTimeline from '@/components/case-review/AuditLogTimeline.vue'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const submitting = ref(false)
const detail = ref({})
const actionRef = ref(null)

async function loadDetail() {
  loading.value = true
  try {
    detail.value = await fetchMerchantDetail(route.params.merchantId)
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push({ name: 'merchant-list' })
}

async function onApprove() {
  await ElMessageBox.confirm('确认通过并开通该商家工作台？', '审核确认')
  submitting.value = true
  try {
    const payload = actionRef.value?.getPayload() || {}
    detail.value = await approveMerchant(route.params.merchantId, {
      comment: payload.comment,
    })
    ElMessage.success('已通过并开通')
    actionRef.value?.reset()
  } finally {
    submitting.value = false
  }
}

async function onReject() {
  const payload = actionRef.value?.getPayload() || {}
  if (!payload.comment && !payload.reasonType) {
    ElMessage.warning('请填写驳回原因')
    return
  }
  await ElMessageBox.confirm('确认驳回该入驻申请？', '审核确认', { type: 'warning' })
  submitting.value = true
  try {
    detail.value = await rejectMerchant(route.params.merchantId, payload)
    ElMessage.success('已驳回')
    actionRef.value?.reset()
  } finally {
    submitting.value = false
  }
}

async function onRequestModify() {
  const payload = actionRef.value?.getPayload() || {}
  if (!payload.comment && !payload.reasonType) {
    ElMessage.warning('请填写修改说明')
    return
  }
  submitting.value = true
  try {
    detail.value = await requestModifyMerchant(route.params.merchantId, payload)
    ElMessage.success('已标记为要求修改')
    actionRef.value?.reset()
  } finally {
    submitting.value = false
  }
}

onMounted(loadDetail)
</script>

<style scoped>
.detail-title {
  font-size: 18px;
  font-weight: 600;
  margin-right: 8px;
}
.detail-tag {
  vertical-align: middle;
}
.notice {
  margin-top: 12px;
}
.section {
  margin-top: 16px;
}
.service-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.service-tag {
  margin: 0;
}
.reject-reason {
  margin: 0;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
}
</style>
