<template>
  <div class="compare-panel">
    <div class="compare-panel__head">
      <span class="compare-panel__title">{{ asset.nodeTitle }} · 图 {{ asset.idx + 1 }}</span>
      <DesensitizeStatusTag :display="asset.desensitizeDisplay" />
      <RiskLevelTag :level="asset.riskLevel" />
      <el-tag
        v-for="tag in asset.riskTags"
        :key="tag"
        size="small"
        type="info"
        class="compare-panel__tag"
      >
        {{ tag }}
      </el-tag>
      <el-button
        v-if="asset.canRetry"
        size="small"
        type="primary"
        link
        :loading="retryLoading"
        @click="$emit('retry', asset.assetId)"
      >
        重试脱敏
      </el-button>
    </div>
    <div class="compare-panel__image">
      <div class="compare-panel__label">脱敏图（审核依据）</div>
      <el-image
        v-if="asset.maskedUrl"
        :src="asset.maskedUrl"
        fit="contain"
        class="compare-panel__img"
        :preview-src-list="[asset.maskedUrl]"
      />
      <el-empty v-else description="暂无脱敏图" :image-size="48" />
    </div>
    <div v-if="detectionRows.length" class="compare-panel__ocr">
      <div class="compare-panel__label">OCR / 检测摘要</div>
      <el-table :data="detectionRows" size="small" border>
        <el-table-column prop="detectType" label="类型" width="100" />
        <el-table-column prop="riskLevel" label="风险" width="90" />
        <el-table-column prop="boxCount" label="检测框数" width="90" />
        <el-table-column prop="status" label="状态" width="100" />
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import RiskLevelTag from './RiskLevelTag.vue'
import DesensitizeStatusTag from './DesensitizeStatusTag.vue'

const props = defineProps({
  asset: { type: Object, required: true },
  retryLoading: { type: Boolean, default: false },
})

defineEmits(['retry'])

const detectionRows = computed(() =>
  (props.asset.privacyDetections || []).map((row) => ({
    detectType: row.detectType,
    riskLevel: row.riskLevel,
    boxCount: row.resultJson?.boxes?.length ?? 0,
    status: row.status,
  }))
)
</script>

<style scoped>
.compare-panel {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}
.compare-panel__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.compare-panel__title {
  font-weight: 600;
}
.compare-panel__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}
.compare-panel__img {
  width: 100%;
  max-height: 280px;
  background: var(--el-fill-color-light);
}
.compare-panel__ocr {
  margin-top: 12px;
}
</style>
