<template>
  <div v-loading="loading">
    <el-page-header @back="goBack">
      <template #content>
        <span class="detail-title">{{ detail.name || '服务监管' }}</span>
        <el-tag v-if="detail.saleStatusLabel" class="detail-tag">{{ detail.saleStatusLabel }}</el-tag>
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
            <el-descriptions-item label="方案 ID">{{ detail.id }}</el-descriptions-item>
            <el-descriptions-item label="门店">{{ detail.storeName }}</el-descriptions-item>
            <el-descriptions-item label="商家">{{ detail.merchantName || detail.merchantId }}</el-descriptions-item>
            <el-descriptions-item label="标准项目">{{ detail.serviceItemName }}</el-descriptions-item>
            <el-descriptions-item label="上架时间">{{ detail.publishedAt || '—' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>价格摘要（仅供参考，平台不背书）</template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="价格模式">
              {{ PRICE_MODE_LABEL[detail.priceMode] || detail.priceMode }}
            </el-descriptions-item>
            <el-descriptions-item v-if="detail.priceMode === 'fixed'" label="一口价">
              ¥{{ detail.amount }}
            </el-descriptions-item>
            <el-descriptions-item
              v-else-if="detail.amount != null"
              label="参考价"
            >
              ¥{{ detail.amount }}
            </el-descriptions-item>
            <el-descriptions-item v-else label="参考价">未填写</el-descriptions-item>
            <el-descriptions-item label="接受咨询/预约">
              {{ detail.acceptAppointment !== false ? '是' : '否（已限制）' }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="section">
      <template #header>方案内容</template>
      <p class="content-block"><strong>简介</strong>：{{ detail.summary || '—' }}</p>
      <p class="content-block"><strong>详情</strong>：{{ detail.detail || '—' }}</p>
    </el-card>

    <el-card v-if="detail.rejectReason" shadow="never" class="section">
      <template #header>处罚 / 说明</template>
      <p class="reject-reason">{{ detail.rejectReason }}</p>
    </el-card>

    <el-card shadow="never" class="section">
      <template #header>抽查与处罚</template>
      <div class="action-row">
        <el-select v-model="penaltyReason" placeholder="处罚原因类型" clearable style="width: 200px">
          <el-option v-for="r in SERVICE_PENALTY_REASONS" :key="r" :label="r" :value="r" />
        </el-select>
        <el-input v-model="comment" placeholder="说明（建议填写）" style="flex: 1; min-width: 200px" />
      </div>
      <div class="action-row actions">
        <el-select v-model="spotResult" placeholder="抽查结果" style="width: 140px">
          <el-option v-for="r in SPOT_CHECK_RESULTS" :key="r.value" :label="r.label" :value="r.value" />
        </el-select>
        <el-button :loading="submitting" @click="onSpotCheck">记录抽查</el-button>
        <el-button type="warning" :loading="submitting" @click="onForceUnpublish">要求下架</el-button>
        <el-button type="danger" :loading="submitting" @click="onSuspend">平台强制下架</el-button>
        <el-button :loading="submitting" @click="onLimitAppointment">限制预约</el-button>
        <el-button
          v-if="detail.saleStatus === 'SUSPENDED'"
          type="success"
          :loading="submitting"
          @click="onRestore"
        >
          解除处罚
        </el-button>
      </div>
    </el-card>

    <el-card shadow="never" class="section">
      <template #header>监管日志</template>
      <AuditLogTimeline :logs="detail.reviewLogs" approve-label="抽查通过" />
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  fetchServicePlanDetail,
  spotCheckServicePlan,
  suspendServicePlan,
  forceUnpublishServicePlan,
  limitAppointmentServicePlan,
  restoreServicePlan,
} from '@/api/service-review'
import {
  COMPLIANCE_NOTICES,
  SERVICE_PENALTY_REASONS,
  PRICE_MODE_LABEL,
  SPOT_CHECK_RESULTS,
} from '@/constants/service-review'
import AuditLogTimeline from '@/components/case-review/AuditLogTimeline.vue'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const submitting = ref(false)
const detail = ref({})
const penaltyReason = ref('')
const comment = ref('')
const spotResult = ref('pass')

async function loadDetail() {
  loading.value = true
  try {
    detail.value = await fetchServicePlanDetail(route.params.planId)
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push({ name: 'service-list' })
}

function buildPayload() {
  return {
    reasonType: penaltyReason.value,
    comment: comment.value,
  }
}

async function onSpotCheck() {
  submitting.value = true
  try {
    detail.value = await spotCheckServicePlan(route.params.planId, {
      result: spotResult.value,
      comment: [penaltyReason.value, comment.value].filter(Boolean).join('：'),
    })
    ElMessage.success('已记录抽查')
  } finally {
    submitting.value = false
  }
}

async function onForceUnpublish() {
  await ElMessageBox.confirm('要求商家下架：用户端将不可见，商家可自行重新上架。', '操作确认')
  submitting.value = true
  try {
    detail.value = await forceUnpublishServicePlan(route.params.planId, buildPayload())
    ElMessage.success('已要求下架')
  } finally {
    submitting.value = false
  }
}

async function onSuspend() {
  if (!penaltyReason.value && !comment.value) {
    ElMessage.warning('强制下架请填写原因')
    return
  }
  await ElMessageBox.confirm('平台强制下架：商家无法自行重新上架，须运营解除处罚。', '操作确认', {
    type: 'warning',
  })
  submitting.value = true
  try {
    detail.value = await suspendServicePlan(route.params.planId, buildPayload())
    ElMessage.success('已强制下架')
  } finally {
    submitting.value = false
  }
}

async function onLimitAppointment() {
  submitting.value = true
  try {
    detail.value = await limitAppointmentServicePlan(route.params.planId, buildPayload())
    ElMessage.success('已限制预约')
  } finally {
    submitting.value = false
  }
}

async function onRestore() {
  await ElMessageBox.confirm('解除处罚后商家可自行重新上架。', '操作确认')
  submitting.value = true
  try {
    detail.value = await restoreServicePlan(route.params.planId, { comment: comment.value })
    ElMessage.success('已解除处罚')
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
.content-block {
  margin: 0 0 12px;
  white-space: pre-wrap;
  line-height: 1.6;
}
.reject-reason {
  margin: 0;
  white-space: pre-wrap;
}
.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.actions {
  margin-top: 12px;
}
</style>
