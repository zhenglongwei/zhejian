<template>
  <el-card shadow="never" class="geo-llm">
    <template #header>
      <div class="geo-llm__head">
        <span>LLM 润色建议稿</span>
        <div class="geo-llm__actions">
          <el-tag :type="statusTag.type">{{ statusTag.label }}</el-tag>
          <el-button size="small" :loading="running" @click="onRun">重新生成</el-button>
          <el-button
            size="small"
            type="primary"
            :disabled="!diff.canAdopt"
            :loading="adopting"
            @click="onAdopt"
          >
            采用建议
          </el-button>
          <el-button
            size="small"
            :disabled="!diff.canReject"
            :loading="rejecting"
            @click="onReject"
          >
            保留模板稿
          </el-button>
        </div>
      </div>
    </template>

    <el-alert
      v-if="diff.disclaimer"
      :title="diff.disclaimer"
      type="warning"
      :closable="false"
      show-icon
      class="geo-llm__notice"
    />
    <el-alert
      v-if="diff.llmError"
      :title="diff.llmError"
      type="error"
      :closable="false"
      show-icon
      class="geo-llm__notice"
    />

    <el-row :gutter="16">
      <el-col :span="12">
        <h4 class="geo-llm__col-title">模板稿（original）</h4>
        <div class="geo-llm__block">
          <p class="geo-llm__label">AI 摘要</p>
          <p class="geo-llm__text">{{ diff.original?.aiSummary || '—' }}</p>
          <p class="geo-llm__label">故障 / 检测 / 方案</p>
          <p class="geo-llm__text">{{ originalFacts }}</p>
        </div>
      </el-col>
      <el-col :span="12">
        <h4 class="geo-llm__col-title">LLM 建议（suggestion）</h4>
        <div class="geo-llm__block geo-llm__block--suggest">
          <p class="geo-llm__label">AI 摘要</p>
          <p class="geo-llm__text">{{ diff.suggestion?.aiSummary || '生成中或暂无' }}</p>
          <p class="geo-llm__label">故障 / 检测 / 方案</p>
          <p class="geo-llm__text">{{ suggestionFacts }}</p>
          <p v-if="diff.suggestion?.confidence" class="geo-llm__meta">
            置信度：{{ diff.suggestion.confidence }}
          </p>
        </div>
      </el-col>
    </el-row>
  </el-card>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  fetchCaseGeoLlmDiff,
  runCaseGeoLlm,
  adoptCaseGeoLlm,
  rejectCaseGeoLlm,
} from '@/api/case-geo-llm'

const props = defineProps({
  caseId: { type: String, required: true },
  editable: { type: Boolean, default: true },
})

const emit = defineEmits(['changed'])

const diff = ref({
  llmStatus: 'pending',
  original: {},
  suggestion: null,
  canAdopt: false,
  canReject: false,
  disclaimer: '',
  llmError: '',
})

const running = ref(false)
const adopting = ref(false)
const rejecting = ref(false)

const statusMap = {
  pending: { label: '待生成', type: 'info' },
  generating: { label: '生成中', type: 'warning' },
  ready: { label: '待审核', type: 'success' },
  failed: { label: '生成失败', type: 'danger' },
  adopted: { label: '已采纳', type: 'success' },
  rejected: { label: '已保留模板', type: 'info' },
  skipped: { label: '未启用', type: 'info' },
}

const statusTag = computed(() => statusMap[diff.value.llmStatus] || statusMap.pending)

const originalFacts = computed(() => formatFacts(diff.value.original))
const suggestionFacts = computed(() => formatFacts(diff.value.suggestion))

function formatFacts(block) {
  if (!block) return '—'
  return [block.faultDesc, block.inspectResult, block.repairPlan]
    .filter(Boolean)
    .join(' / ')
}

async function loadDiff() {
  diff.value = await fetchCaseGeoLlmDiff(props.caseId)
}

async function onRun() {
  if (!props.editable || running.value) return
  running.value = true
  try {
    await runCaseGeoLlm(props.caseId)
    await loadDiff()
    emit('changed')
    ElMessage.success('LLM 润色任务已完成')
  } catch (e) {
    ElMessage.error(e?.message || '生成失败')
  } finally {
    running.value = false
  }
}

async function onAdopt() {
  if (!props.editable || adopting.value || !diff.value.canAdopt) return
  try {
    await ElMessageBox.confirm(
      '采纳后将写入案例 GEO 字段，但仍需点击「通过」才会公开发布。是否继续？',
      '采用 LLM 建议',
      { type: 'warning' }
    )
  } catch {
    return
  }
  adopting.value = true
  try {
    await adoptCaseGeoLlm(props.caseId)
    await loadDiff()
    emit('changed')
    ElMessage.success('已采用 LLM 建议稿')
  } catch (e) {
    ElMessage.error(e?.message || '采纳失败')
  } finally {
    adopting.value = false
  }
}

async function onReject() {
  if (!props.editable || rejecting.value || !diff.value.canReject) return
  rejecting.value = true
  try {
    await rejectCaseGeoLlm(props.caseId, { comment: '保留模板稿' })
    await loadDiff()
    emit('changed')
    ElMessage.success('已保留模板稿')
  } catch (e) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    rejecting.value = false
  }
}

onMounted(loadDiff)
</script>

<style scoped>
.geo-llm__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.geo-llm__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.geo-llm__notice {
  margin-bottom: 12px;
}
.geo-llm__col-title {
  margin: 0 0 8px;
  font-size: 14px;
}
.geo-llm__block {
  padding: 12px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  min-height: 180px;
  background: var(--el-fill-color-blank);
}
.geo-llm__block--suggest {
  background: var(--el-color-success-light-9);
}
.geo-llm__label {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.geo-llm__text {
  margin: 0 0 12px;
  white-space: pre-wrap;
  line-height: 1.6;
}
.geo-llm__meta {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
