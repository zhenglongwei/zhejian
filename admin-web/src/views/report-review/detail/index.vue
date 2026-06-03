<template>
  <div v-loading="loading">
    <el-page-header @back="goBack">
      <template #content>
        <span class="detail-title">举报详情</span>
        <el-tag v-if="detail.statusLabel" class="detail-tag">{{ detail.statusLabel }}</el-tag>
      </template>
    </el-page-header>

    <el-alert
      title="举报仅代表用户反馈，不代表平台已核实；处置须留痕，隐藏内容需人工确认。"
      type="info"
      :closable="false"
      show-icon
      class="notice"
    />

    <el-row :gutter="16" class="section">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>举报信息</template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="举报 ID">{{ detail.id }}</el-descriptions-item>
            <el-descriptions-item label="对象类型">{{ detail.targetTypeLabel }}</el-descriptions-item>
            <el-descriptions-item label="对象 ID">{{ detail.targetId }}</el-descriptions-item>
            <el-descriptions-item label="对象标题">{{ detail.targetTitle || '—' }}</el-descriptions-item>
            <el-descriptions-item label="举报类型">{{ detail.reportTypeLabel }}</el-descriptions-item>
            <el-descriptions-item label="提交时间">{{ detail.createdAt }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>举报人</template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="昵称">{{ detail.reporterNickname }}</el-descriptions-item>
            <el-descriptions-item label="联系手机">{{ detail.contactPhone || '—' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="section">
      <template #header>问题说明</template>
      <p class="content-block">{{ detail.description || '—' }}</p>
    </el-card>

    <el-card v-if="detail.images && detail.images.length" shadow="never" class="section">
      <template #header>凭证图片</template>
      <div class="image-grid">
        <el-image
          v-for="(url, i) in detail.images"
          :key="i"
          :src="url"
          :preview-src-list="detail.images"
          fit="cover"
          class="evidence-img"
        />
      </div>
    </el-card>

    <el-card v-if="detail.resolution" shadow="never" class="section">
      <template #header>处置结果</template>
      <p class="content-block">{{ detail.resolution }}</p>
    </el-card>

    <el-card v-if="canHandle" shadow="never" class="section">
      <template #header>处置操作</template>
      <el-input
        v-model="comment"
        type="textarea"
        :rows="3"
        placeholder="说明（驳回时必填；成立处置建议填写）"
      />
      <div class="action-row actions">
        <el-button
          v-if="detail.status === 'pending'"
          type="primary"
          :loading="submitting"
          @click="onAccept"
        >受理</el-button>
        <el-button
          v-if="detail.status === 'processing'"
          type="success"
          :loading="submitting"
          @click="onResolve(false)"
        >成立（不隐藏）</el-button>
        <el-button
          v-if="detail.status === 'processing'"
          type="warning"
          :loading="submitting"
          @click="onResolve(true)"
        >成立并隐藏内容</el-button>
        <el-button
          v-if="detail.status === 'pending' || detail.status === 'processing'"
          type="danger"
          :loading="submitting"
          @click="onReject"
        >驳回</el-button>
      </div>
    </el-card>

    <el-card v-if="detail.handleLogs && detail.handleLogs.length" shadow="never" class="section">
      <template #header>处置留痕</template>
      <el-timeline>
        <el-timeline-item
          v-for="log in detail.handleLogs"
          :key="log.id"
          :timestamp="log.createdAt"
        >
          <strong>{{ actionLabel(log.handleAction) }}</strong>
          <span v-if="log.handleComment"> — {{ log.handleComment }}</span>
        </el-timeline-item>
      </el-timeline>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  fetchReportDetail,
  acceptReport,
  rejectReport,
  resolveReport,
} from '@/api/report-review'
import { HANDLE_ACTION_LABEL } from '@/constants/report-review'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const submitting = ref(false)
const detail = ref({})
const comment = ref('')

const canHandle = computed(() => ['pending', 'processing'].includes(detail.value.status))

function actionLabel(action) {
  return HANDLE_ACTION_LABEL[action] || action
}

async function loadDetail() {
  loading.value = true
  try {
    detail.value = await fetchReportDetail(route.params.reportId)
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push({ name: 'report-list' })
}

async function onAccept() {
  submitting.value = true
  try {
    detail.value = await acceptReport(route.params.reportId, { comment: comment.value })
    ElMessage.success('已受理')
  } finally {
    submitting.value = false
  }
}

async function onReject() {
  if (!comment.value.trim()) {
    ElMessage.warning('驳回须填写原因')
    return
  }
  submitting.value = true
  try {
    detail.value = await rejectReport(route.params.reportId, { comment: comment.value })
    ElMessage.success('已驳回')
  } finally {
    submitting.value = false
  }
}

async function onResolve(hideContent) {
  const tip = hideContent
    ? '确认举报成立并隐藏被举报内容？此操作将联动下架/隐藏。'
    : '确认举报成立？'
  try {
    await ElMessageBox.confirm(tip, '确认处置', { type: 'warning' })
  } catch {
    return
  }
  submitting.value = true
  try {
    detail.value = await resolveReport(route.params.reportId, {
      comment: comment.value,
      hideContent,
    })
    ElMessage.success(hideContent ? '已成立并隐藏内容' : '已标记成立')
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
.image-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.evidence-img {
  width: 120px;
  height: 120px;
  border-radius: 4px;
}
.action-row.actions {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
