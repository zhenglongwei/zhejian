<template>
  <div v-loading="loading">
    <el-page-header @back="goBack">
      <template #content>
        <span class="detail-title">{{ detail.title || '案例审核' }}</span>
        <CaseSourceTag
          v-if="detail.source"
          class="detail-source"
          :source="detail.source"
          :source-label="detail.sourceLabel"
        />
        <RiskLevelTag :level="detail.riskLevel" />
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

    <el-alert
      v-if="desensitizeAlert"
      :title="desensitizeAlert"
      type="warning"
      :closable="false"
      show-icon
      class="notice"
    />

    <el-row :gutter="16" class="section">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>基础信息</template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="案例 ID">{{ detail.caseId }}</el-descriptions-item>
            <el-descriptions-item label="相册 ID">{{ detail.albumId }}</el-descriptions-item>
            <el-descriptions-item label="状态">{{ detail.status }}</el-descriptions-item>
            <el-descriptions-item label="门店">{{ detail.storeName }}</el-descriptions-item>
            <el-descriptions-item label="服务">{{ detail.serviceName }}</el-descriptions-item>
            <el-descriptions-item label="价格">{{ priceText }}</el-descriptions-item>
            <el-descriptions-item label="提交时间">{{ detail.submittedAt }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>授权记录</template>
          <el-descriptions v-if="detail.authorization" :column="1" border size="small">
            <el-descriptions-item label="状态">{{ detail.authorization.status }}</el-descriptions-item>
            <el-descriptions-item label="档位">{{ detail.authorization.tier }}</el-descriptions-item>
            <el-descriptions-item label="已同意">{{ detail.authorization.agreed ? '是' : '否' }}</el-descriptions-item>
          </el-descriptions>
          <el-empty v-else description="无授权记录（冷启动）" :image-size="48" />
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="section">
      <template #header>
        <div class="section-head">
          <span>脱敏图审核 · OCR 风险</span>
          <el-button
            v-if="hasRetryableAssets"
            size="small"
            type="warning"
            :loading="retryAllLoading"
            @click="onRetryAll"
          >
            全部重试脱敏
          </el-button>
        </div>
      </template>
      <DesensitizeComparePanel
        v-for="asset in detail.mediaAssets"
        :key="`${asset.nodeId}_${asset.idx}`"
        :asset="asset"
        :retry-loading="retryingAssetId === asset.assetId"
        @retry="onRetryAsset"
      />
      <el-empty v-if="!detail.mediaAssets?.length" description="暂无图片素材" />
    </el-card>

    <el-card shadow="never" class="section">
      <template #header>审核操作</template>
      <ReviewActionBar
        ref="actionRef"
        :loading="submitting"
        :can-review="canReview"
        :approve-label="approveLabel"
        @approve="onApprove"
        @reject="onReject"
        @request-modify="onRequestModify"
      />
    </el-card>

    <el-card shadow="never" class="section">
      <template #header>审核日志</template>
      <AuditLogTimeline :logs="detail.reviewLogs" />
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  fetchCaseDetail,
  approveCase,
  rejectCase,
  requestModifyCase,
  retryCaseAssetDesensitize,
  retryAllCaseDesensitize,
} from '@/api/case-review'
import { COMPLIANCE_NOTICES } from '@/constants/case-review'
import CaseSourceTag from '@/components/case-review/CaseSourceTag.vue'
import RiskLevelTag from '@/components/case-review/RiskLevelTag.vue'
import DesensitizeComparePanel from '@/components/case-review/DesensitizeComparePanel.vue'
import ReviewActionBar from '@/components/case-review/ReviewActionBar.vue'
import AuditLogTimeline from '@/components/case-review/AuditLogTimeline.vue'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const submitting = ref(false)
const retryAllLoading = ref(false)
const retryingAssetId = ref('')
const detail = ref({})
const actionRef = ref(null)

const priceText = computed(() => {
  const p = detail.value.price
  if (!p) return '—'
  if (p.label) return p.label
  if (p.minAmount != null && p.maxAmount != null) {
    return `¥${p.minAmount} - ¥${p.maxAmount}`
  }
  return p.priceMode || '—'
})

const desensitizeSummary = computed(() => detail.value.desensitizeSummary || {})
const hasRetryableAssets = computed(() =>
  (detail.value.mediaAssets || []).some((a) => a.canRetry)
)
const canReview = computed(
  () =>
    detail.value.status === 'pending_review' &&
    !desensitizeSummary.value.hasBlockingIssues
)
const approveLabel = computed(() =>
  desensitizeSummary.value.hasBlockingIssues ? '脱敏未完成' : '通过并公开'
)
const desensitizeAlert = computed(() => {
  const s = desensitizeSummary.value
  if (!s.hasBlockingIssues) return ''
  const parts = []
  if (s.needManualCount) parts.push(`${s.needManualCount} 张需人工`)
  if (s.failedCount) parts.push(`${s.failedCount} 张脱敏失败`)
  if (s.pendingCount) parts.push(`${s.pendingCount} 张待脱敏`)
  return `脱敏未完成：${parts.join('、')}。请重试脱敏或要求商家修改后再审核通过。`
})

async function loadDetail() {
  loading.value = true
  try {
    detail.value = await fetchCaseDetail(route.params.caseId)
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push({ name: 'case-list' })
}

async function onRetryAsset(assetId) {
  if (!assetId || retryingAssetId.value) return
  retryingAssetId.value = assetId
  try {
    detail.value = await retryCaseAssetDesensitize(route.params.caseId, assetId)
    ElMessage.success('已重新执行脱敏')
  } catch (e) {
    ElMessage.error(e?.message || '重试失败')
  } finally {
    retryingAssetId.value = ''
  }
}

async function onRetryAll() {
  if (retryAllLoading.value) return
  await ElMessageBox.confirm('将对所有失败/需人工图片重新执行脱敏，是否继续？', '重试确认')
  retryAllLoading.value = true
  try {
    detail.value = await retryAllCaseDesensitize(route.params.caseId)
    ElMessage.success('批量重试已完成')
  } catch (e) {
    ElMessage.error(e?.message || '批量重试失败')
  } finally {
    retryAllLoading.value = false
  }
}

async function onApprove() {
  await ElMessageBox.confirm('确认通过并公开该案例？', '审核确认')
  submitting.value = true
  try {
    const payload = actionRef.value?.getPayload() || {}
    detail.value = await approveCase(route.params.caseId, {
      comment: payload.comment,
    })
    ElMessage.success('已通过并公开')
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
  await ElMessageBox.confirm('确认驳回该案例？', '审核确认', { type: 'warning' })
  submitting.value = true
  try {
    detail.value = await rejectCase(route.params.caseId, payload)
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
    detail.value = await requestModifyCase(route.params.caseId, payload)
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
.detail-source {
  margin-right: 8px;
}
.notice {
  margin-top: 12px;
}
.section {
  margin-top: 16px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
