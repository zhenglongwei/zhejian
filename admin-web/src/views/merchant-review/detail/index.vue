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
            <el-descriptions-item label="负责人手机">{{ detail.phoneMasked || '—' }}</el-descriptions-item>
            <el-descriptions-item label="门店电话">{{ detail.storePhone || '—' }}</el-descriptions-item>
            <el-descriptions-item label="地址">{{ detail.address }}</el-descriptions-item>
            <el-descriptions-item label="坐标">
              <span v-if="detail.latitude != null">{{ detail.latitude }}, {{ detail.longitude }}</span>
              <span v-else>—</span>
            </el-descriptions-item>
            <el-descriptions-item label="营业时间">{{ detail.businessHours || '—' }}</el-descriptions-item>
            <el-descriptions-item label="提交时间">{{ detail.submittedAt || '—' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>商家主体</template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="主体名称">{{ detail.legalName || '—' }}</el-descriptions-item>
            <el-descriptions-item label="信用代码">{{ detail.creditCode || '—' }}</el-descriptions-item>
            <el-descriptions-item label="联系邮箱">{{ detail.contactEmail || '—' }}</el-descriptions-item>
            <el-descriptions-item label="门店简介">{{ detail.intro || '—' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
        <el-card shadow="never" class="sub-card">
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
          <template #header>维修资质</template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="类型">{{ detail.qualification?.typeLabel || '—' }}</el-descriptions-item>
            <el-descriptions-item label="编号">{{ detail.qualification?.certNo || '—' }}</el-descriptions-item>
            <el-descriptions-item label="有效期至">{{ detail.qualification?.validUntil || '—' }}</el-descriptions-item>
          </el-descriptions>
          <div v-if="detail.qualification?.photoUrl" class="photo-block">
            <div class="photo-label">资质照片</div>
            <el-image :src="detail.qualification.photoUrl" fit="cover" class="review-photo" :preview-src-list="[detail.qualification.photoUrl]" />
          </div>
        </el-card>
      </el-col>
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
    </el-row>

    <el-card shadow="never" class="section">
      <template #header>资质与门店照片</template>
      <el-row :gutter="16">
        <el-col v-if="detail.licensePhotoUrl" :span="6">
          <div class="photo-label">营业执照</div>
          <el-image :src="detail.licensePhotoUrl" fit="cover" class="review-photo" :preview-src-list="[detail.licensePhotoUrl]" />
        </el-col>
        <el-col v-if="detail.photos?.facadeUrl" :span="6">
          <div class="photo-label">门头</div>
          <el-image :src="detail.photos.facadeUrl" fit="cover" class="review-photo" :preview-src-list="[detail.photos.facadeUrl]" />
        </el-col>
        <el-col v-for="(url, idx) in detail.photos?.workshopUrls || []" :key="'w-' + idx" :span="6">
          <div class="photo-label">工位 {{ idx + 1 }}</div>
          <el-image :src="url" fit="cover" class="review-photo" :preview-src-list="[url]" />
        </el-col>
        <el-col v-if="detail.photos?.receptionUrl" :span="6">
          <div class="photo-label">接待区</div>
          <el-image :src="detail.photos.receptionUrl" fit="cover" class="review-photo" :preview-src-list="[detail.photos.receptionUrl]" />
        </el-col>
        <el-col v-if="detail.photos?.brandAuthUrl" :span="6">
          <div class="photo-label">品牌授权</div>
          <el-image :src="detail.photos.brandAuthUrl" fit="cover" class="review-photo" :preview-src-list="[detail.photos.brandAuthUrl]" />
        </el-col>
      </el-row>
      <el-descriptions v-if="detail.brandAuthValidUntil || detail.photos?.brandAuthUrl" :column="2" border size="small" class="sub-desc">
        <el-descriptions-item label="授权有效期至">{{ detail.brandAuthValidUntil || '—' }}</el-descriptions-item>
        <el-descriptions-item label="能力变更状态">{{ detail.capabilityReviewStatus || '—' }}</el-descriptions-item>
      </el-descriptions>
      <el-empty
        v-if="!detail.licensePhotoUrl && !detail.photos?.facadeUrl"
        description="未上传资质材料"
        :image-size="48"
      />
    </el-card>

    <el-card shadow="never" class="section">
      <template #header>能力资料（入驻/展示，卷十一）</template>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="擅长品牌">
          {{ (detail.specialtyBrands || []).join('、') || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="暂不承接">
          {{ (detail.notAccepting || []).join('、') || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="设备/场" :span="2">
          {{
            (detail.equipmentTags || [])
              .map((item) => item.label || item)
              .filter(Boolean)
              .join('、') || '—'
          }}
        </el-descriptions-item>
      </el-descriptions>
      <el-table
        v-if="detail.technicians?.length"
        :data="detail.technicians"
        border
        size="small"
        class="tech-table"
      >
        <el-table-column prop="name" label="称呼" width="120" />
        <el-table-column prop="role" label="角色" width="120" />
        <el-table-column prop="years" label="年限" width="100" />
        <el-table-column label="资质标签">
          <template #default="{ row }">
            {{ (row.credentials || []).join('、') || '—' }}
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="未填写技师公示卡" :image-size="48" />
      <p class="capability-tip">入驻通过后，技师/设备/授权变更走「门店能力变更」队列审后亮。</p>
    </el-card>

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
.sub-card {
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
.photo-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}
.photo-block {
  margin-top: 12px;
}
.review-photo {
  width: 100%;
  max-width: 220px;
  height: 140px;
  border-radius: 6px;
  border: 1px solid var(--el-border-color-lighter);
}
.sub-desc {
  margin-top: 12px;
}
.tech-table {
  margin-top: 12px;
}
.capability-tip {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
