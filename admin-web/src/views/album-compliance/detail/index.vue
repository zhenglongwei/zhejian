<template>
  <div v-loading="loading">
    <GateReviewNav />
    <el-page-header @back="goBack">
      <template #content>
        <span>相册完工合规 · {{ albumId }}</span>
      </template>
    </el-page-header>

    <template v-if="detail">
      <el-alert
        v-for="(line, idx) in ALBUM_COMPLIANCE_NOTICES"
        :key="idx"
        type="info"
        :closable="false"
        show-icon
        class="notice"
        :title="line"
      />

      <el-descriptions title="相册信息" :column="2" border class="block">
        <el-descriptions-item label="服务项目">{{ detail.album.serviceName }}</el-descriptions-item>
        <el-descriptions-item label="门店">{{ detail.album.storeName || detail.album.store?.name }}</el-descriptions-item>
        <el-descriptions-item label="合规状态">
          {{ ALBUM_COMPLIANCE_STATUS_LABEL[detail.compliance.status] || detail.compliance.status }}
        </el-descriptions-item>
        <el-descriptions-item label="审核方式">{{ detail.compliance.reviewMode || '—' }}</el-descriptions-item>
        <el-descriptions-item label="图片数">{{ detail.album.imageCount }}</el-descriptions-item>
        <el-descriptions-item label="商家备注" :span="2">{{ detail.album.storeNote || '—' }}</el-descriptions-item>
      </el-descriptions>

      <el-card v-if="detail.compliance.autoEvaluation" class="block" header="自动规则评估">
        <p>
          <strong>{{ detail.compliance.autoEvaluation.passed ? '规则通过' : '规则未通过' }}</strong>
        </p>
        <p v-if="detail.compliance.autoEvaluation.summary">{{ detail.compliance.autoEvaluation.summary }}</p>
        <ul v-if="detail.compliance.autoEvaluation.violations?.length">
          <li v-for="(v, i) in detail.compliance.autoEvaluation.violations" :key="i">
            {{ v.type }}：{{ v.detail || v.text || JSON.stringify(v) }}
          </li>
        </ul>
      </el-card>

      <el-card v-if="detail.compliance.rejectReason" class="block" header="驳回原因">
        {{ detail.compliance.rejectReason }}
      </el-card>

      <el-card class="block" header="留档节点（商家侧，含原图）">
        <div v-for="node in detail.album.nodes || []" :key="node.id || node.nodeId" class="node-block">
          <h4>{{ node.title || node.id }}</h4>
          <p v-if="node.note">{{ node.note }}</p>
          <div class="node-images">
            <el-image
              v-for="(img, idx) in node.images || []"
              :key="idx"
              :src="img"
              fit="cover"
              style="width: 120px; height: 90px; margin: 4px"
              :preview-src-list="node.images"
            />
          </div>
        </div>
      </el-card>

      <div v-if="canReview" class="review-bar block">
        <el-select v-model="rejectReason" placeholder="驳回原因" clearable style="width: 220px">
          <el-option v-for="r in ALBUM_COMPLIANCE_REJECT_REASONS" :key="r" :label="r" :value="r" />
        </el-select>
        <el-input v-model="rejectComment" placeholder="补充说明" style="flex: 1; min-width: 200px" />
        <el-button type="success" :loading="acting" @click="onApprove">抽检通过</el-button>
        <el-button type="danger" :loading="acting" @click="onReject">驳回（回商家）</el-button>
      </div>
      <el-alert v-else type="warning" :closable="false" title="当前状态不可审核" class="block" />
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  fetchAlbumComplianceDetail,
  approveAlbumCompliance,
  rejectAlbumCompliance,
} from '@/api/album-compliance'
import {
  ALBUM_COMPLIANCE_NOTICES,
  ALBUM_COMPLIANCE_REJECT_REASONS,
  ALBUM_COMPLIANCE_STATUS_LABEL,
} from '@/constants/album-compliance'
import GateReviewNav from '@/components/case-review/GateReviewNav.vue'

const route = useRoute()
const router = useRouter()
const albumId = route.params.albumId
const loading = ref(false)
const acting = ref(false)
const detail = ref(null)
const rejectReason = ref('')
const rejectComment = ref('')

const canReview = computed(() => detail.value?.compliance?.status === 'spot_check')

async function loadDetail() {
  loading.value = true
  try {
    detail.value = await fetchAlbumComplianceDetail(albumId)
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push({ name: 'album-compliance-list' })
}

async function onApprove() {
  await ElMessageBox.confirm('确认抽检通过？通过后用户端将冻结展示留档。', '通过')
  acting.value = true
  try {
    await approveAlbumCompliance(albumId)
    ElMessage.success('已通过')
    await loadDetail()
  } finally {
    acting.value = false
  }
}

async function onReject() {
  const reason = [rejectReason.value, rejectComment.value].filter(Boolean).join('：')
  if (!reason) {
    ElMessage.warning('请填写驳回原因')
    return
  }
  await ElMessageBox.confirm('确认驳回？商家需修改留档后重新提交。', '驳回')
  acting.value = true
  try {
    await rejectAlbumCompliance(albumId, { reason, comment: rejectComment.value })
    ElMessage.success('已驳回')
    await loadDetail()
  } finally {
    acting.value = false
  }
}

onMounted(loadDetail)
</script>

<style scoped>
.block {
  margin-top: 16px;
}
.notice {
  margin-top: 12px;
}
.review-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.node-block {
  margin-bottom: 16px;
}
.node-block h4 {
  margin: 0 0 8px;
}
</style>
