<template>
  <div v-loading="loading">
    <GateReviewNav />
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
      v-if="isUserAuthorized"
      :title="USER_AUTHORIZED_REVIEW_NOTICE"
      type="info"
      :closable="false"
      show-icon
      class="notice"
    />

    <el-alert
      v-if="desensitizeAlert"
      :title="desensitizeAlert"
      :type="isUserAuthorized ? 'info' : 'warning'"
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

    <el-alert
      v-if="detail.snapshotFrozen"
      title="案例快照已冻结：运营台不再提供代商家 LLM 润色。商家应在授权前于小程序使用「内容优化」。"
      type="info"
      :closable="false"
      show-icon
      class="section"
    />

    <el-card v-if="detail.trustMeta" shadow="never" class="section">
      <template #header>信任元数据（只读）</template>
      <el-descriptions :column="1" border size="small">
        <el-descriptions-item label="授权档">{{ detail.trustMeta.authorizationTierLabel }}</el-descriptions-item>
        <el-descriptions-item label="快照版本">v{{ detail.trustMeta.snapshotVersion }}</el-descriptions-item>
        <el-descriptions-item label="证据级别">{{ detail.trustMeta.evidenceLevelLabel }}</el-descriptions-item>
        <el-descriptions-item label="公开图数">{{ detail.trustMeta.publicImageCount }}</el-descriptions-item>
        <el-descriptions-item label="审核时间">{{ detail.trustMeta.reviewedAt }}</el-descriptions-item>
        <el-descriptions-item label="信任说明">{{ detail.trustMeta.trustStatement }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <CaseGeoLlmReview
      v-if="showGeoEditor && !detail.snapshotFrozen"
      class="section"
      :case-id="detail.caseId"
      :editable="geoEditable"
      @changed="onGeoLlmChanged"
    />

    <CaseGeoEditor
      v-if="showGeoEditor"
      class="section"
      :case-id="detail.caseId"
      :detail="detail"
      :editable="geoEditable"
      @saved="onGeoSaved"
    />

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

    <ArticleExportPanel
      v-if="detail.status === 'public_approved'"
      class="section"
      :case-id="detail.caseId"
      :status="detail.status"
      :article-status="detail.articleStatus"
      @marked-wechat="loadDetail"
    />

    <CaseFaqEditor
      v-if="detail.status === 'public_approved'"
      class="section"
      :case-id="detail.caseId"
      :faq="detail.faq"
      :faq-inline="detail.faqInline"
      @saved="onFaqSaved"
    />

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
import { COMPLIANCE_NOTICES, USER_AUTHORIZED_REVIEW_NOTICE } from '@/constants/case-review'
import CaseSourceTag from '@/components/case-review/CaseSourceTag.vue'
import RiskLevelTag from '@/components/case-review/RiskLevelTag.vue'
import DesensitizeComparePanel from '@/components/case-review/DesensitizeComparePanel.vue'
import ReviewActionBar from '@/components/case-review/ReviewActionBar.vue'
import AuditLogTimeline from '@/components/case-review/AuditLogTimeline.vue'
import ArticleExportPanel from '@/components/case-review/ArticleExportPanel.vue'
import CaseFaqEditor from '@/components/case-review/CaseFaqEditor.vue'
import CaseGeoEditor from '@/components/case-review/CaseGeoEditor.vue'
import CaseGeoLlmReview from '@/components/case-review/CaseGeoLlmReview.vue'
import GateReviewNav from '@/components/case-review/GateReviewNav.vue'
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

const isUserAuthorized = computed(() => detail.value.source === 'user_authorized')
const desensitizeSummary = computed(() => detail.value.desensitizeSummary || {})
const hasRetryableAssets = computed(() =>
  (detail.value.mediaAssets || []).some((a) => a.canRetry)
)
const canReview = computed(() => {
  if (detail.value.status !== 'pending_review') return false
  if (isUserAuthorized.value) return true
  return !desensitizeSummary.value.hasBlockingIssues
})
const approveLabel = computed(() => {
  if (isUserAuthorized.value) return '通过并公开'
  return desensitizeSummary.value.hasBlockingIssues ? '脱敏未完成' : '通过并公开'
})
const desensitizeAlert = computed(() => {
  const s = desensitizeSummary.value
  if (!s.hasBlockingIssues) return ''
  const parts = []
  if (s.needManualCount) parts.push(`${s.needManualCount} 张需人工`)
  if (s.failedCount) parts.push(`${s.failedCount} 张脱敏失败`)
  if (s.pendingCount) parts.push(`${s.pendingCount} 张待脱敏`)
  if (isUserAuthorized.value) {
    return `部分图片脱敏未完成（${parts.join('、')}），仅供参考。用户授权案例不因脱敏进度阻断通过；请结合 OCR 判断已脱敏素材的隐私与合规风险，必要时驳回。`
  }
  return `脱敏未完成：${parts.join('、')}。请重试脱敏或要求商家修改后再审核通过。`
})
const showGeoEditor = computed(
  () =>
    detail.value.caseId &&
    (detail.value.status === 'pending_review' || detail.value.status === 'public_approved')
)
const geoEditable = computed(
  () =>
    detail.value.status === 'pending_review' || detail.value.status === 'public_approved'
)

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

function onFaqSaved(next) {
  if (next && typeof next === 'object') {
    detail.value = next
  } else {
    loadDetail()
  }
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

function onGeoSaved(next) {
  if (next && typeof next === 'object') {
    detail.value = next
  } else {
    loadDetail()
  }
}

function onGeoLlmChanged() {
  loadDetail()
}

async function onApprove() {
  if (isUserAuthorized.value) {
    await ElMessageBox.confirm(
      '用户授权案例：相册内容由商家留档负责，平台仅审核合法合规与隐私脱敏风险。确认通过并公开？',
      '审核确认'
    )
  } else {
    if (detail.value.geoQuality?.level === 'block') {
      ElMessage.warning('案例 GEO 证据缺失（block），请要求商家补全或驳回')
      return
    }
    if (detail.value.geoQuality?.level === 'weak') {
      try {
        await ElMessageBox.confirm(
          '该案例 GEO 证据完整度偏弱，公开后 AI 可引用质量可能不足。确认仍要通过？',
          '证据质量提醒',
          { type: 'warning', confirmButtonText: '仍要通过' }
        )
      } catch {
        return
      }
    } else {
      await ElMessageBox.confirm('确认通过并公开该案例？', '审核确认')
    }
  }
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
