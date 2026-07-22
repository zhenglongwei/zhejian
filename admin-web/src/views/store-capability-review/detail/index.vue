<template>
  <div v-loading="loading">
    <el-page-header @back="goBack" content="能力变更详情" />
    <template v-if="detail">
      <el-descriptions title="门店" :column="2" border class="block">
        <el-descriptions-item label="门店">{{ detail.storeName }}</el-descriptions-item>
        <el-descriptions-item label="商家">{{ detail.merchantName }}</el-descriptions-item>
        <el-descriptions-item label="地址" :span="2">{{ detail.address }}</el-descriptions-item>
        <el-descriptions-item label="审核状态">{{ detail.reviewStatus }}</el-descriptions-item>
      </el-descriptions>

      <el-card class="block" header="待审内容">
        <template v-if="detail.pending">
          <h4>技师</h4>
          <el-table :data="detail.pending.technicians || []" border size="small">
            <el-table-column prop="name" label="称呼" />
            <el-table-column prop="role" label="角色" />
            <el-table-column prop="years" label="年限" />
            <el-table-column label="资质标签">
              <template #default="{ row }">
                {{ (row.credentials || []).join('、') }}
              </template>
            </el-table-column>
          </el-table>

          <h4 class="mt">设备/场</h4>
          <el-table :data="detail.pending.equipmentTags || []" border size="small">
            <el-table-column prop="label" label="标签" />
            <el-table-column label="实景">
              <template #default="{ row }">
                <el-image
                  v-if="row.imageUrl"
                  :src="row.imageUrl"
                  style="width: 64px; height: 64px"
                  fit="cover"
                  :preview-src-list="[row.imageUrl]"
                />
                <span v-else>—</span>
              </template>
            </el-table-column>
          </el-table>

          <h4 class="mt">品牌授权</h4>
          <el-table
            :data="detail.pending.brandAuthItems || []"
            border
            size="small"
            empty-text="无品牌授权变更"
          >
            <el-table-column prop="brandName" label="品牌" min-width="120" />
            <el-table-column prop="validUntil" label="有效期" width="140" />
            <el-table-column label="证明" width="100">
              <template #default="{ row }">
                <el-image
                  v-if="row.imageUrl"
                  :src="row.imageUrl"
                  style="width: 64px; height: 64px"
                  fit="cover"
                  :preview-src-list="[row.imageUrl]"
                />
                <span v-else>—</span>
              </template>
            </el-table-column>
          </el-table>
          <template v-if="!(detail.pending.brandAuthItems || []).length && detail.pending.brandAuthUrl">
            <p>有效期：{{ detail.pending.brandAuthValidUntil || '—' }}</p>
            <el-image
              :src="detail.pending.brandAuthUrl"
              style="width: 160px; height: 120px"
              fit="cover"
              :preview-src-list="[detail.pending.brandAuthUrl]"
            />
          </template>
        </template>
        <el-empty v-else description="无待审快照" />
      </el-card>

      <el-card class="block" header="当前已公开">
        <p>技师 {{ (detail.published?.technicians || []).length }} · 设备 {{ (detail.published?.equipmentTags || []).length }}</p>
        <el-table
          class="mt"
          :data="detail.published?.brandAuthItems || []"
          border
          size="small"
          empty-text="暂无已公开品牌授权"
        >
          <el-table-column prop="brandName" label="品牌" min-width="120" />
          <el-table-column prop="validUntil" label="有效期" width="140" />
          <el-table-column label="证明" width="100">
            <template #default="{ row }">
              <el-image
                v-if="row.imageUrl"
                :src="row.imageUrl"
                style="width: 64px; height: 64px"
                fit="cover"
                :preview-src-list="[row.imageUrl]"
              />
              <span v-else>—</span>
            </template>
          </el-table-column>
        </el-table>
        <p class="mt">资料核实：{{ detail.published?.lastProfileVerifiedAt || '—' }}</p>
      </el-card>

      <div v-if="detail.reviewStatus === 'pending'" class="actions">
        <el-button type="primary" :loading="acting" @click="onApprove">通过</el-button>
        <el-button type="danger" :loading="acting" @click="onReject">驳回</el-button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  fetchStoreCapabilityDetail,
  approveStoreCapability,
  rejectStoreCapability,
} from '@/api/store-capability-review'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const acting = ref(false)
const detail = ref(null)

async function loadDetail() {
  loading.value = true
  try {
    detail.value = await fetchStoreCapabilityDetail(route.params.storeId)
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push({ name: 'store-capability-list' })
}

async function onApprove() {
  acting.value = true
  try {
    detail.value = await approveStoreCapability(route.params.storeId)
    ElMessage.success('已通过，能力资料已对外展示')
  } finally {
    acting.value = false
  }
}

async function onReject() {
  const { value } = await ElMessageBox.prompt('请填写驳回原因', '驳回能力变更', {
    confirmButtonText: '确认驳回',
    cancelButtonText: '取消',
    inputPlaceholder: '原因',
  })
  acting.value = true
  try {
    detail.value = await rejectStoreCapability(route.params.storeId, { reason: value || '' })
    ElMessage.success('已驳回')
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
.mt {
  margin-top: 16px;
}
.actions {
  margin-top: 20px;
  display: flex;
  gap: 12px;
}
</style>
