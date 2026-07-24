<template>
  <el-card shadow="never" class="case-geo">
    <template #header>
      <div class="case-geo__head">
        <div class="case-geo__head-main">
          <span>{{ snapshotFrozen ? '提炼层（SEO / 摘要）' : 'GEO 文案（模板稿）' }}</span>
          <GeoQualityTag
            v-if="geoQuality"
            :level="geoQuality.level"
            :summary-text="geoQuality.summaryText"
            :informational="detail.source === 'user_authorized'"
          />
        </div>
        <div class="case-geo__actions">
          <el-button size="small" :loading="regenerating" @click="onRegenerate">
            模板重生成
          </el-button>
          <el-button size="small" type="primary" :loading="saving" @click="onSave">
            保存文案
          </el-button>
        </div>
      </div>
    </template>

    <el-alert
      v-if="snapshotFrozen"
      title="案例正文已冻结（商家确认稿）。下方「案例摘要」来自商家确认，运营仅可做合规修订（去金额/营销等）；搜索描述由摘要自动派生，不再单独填写。"
      type="warning"
      :closable="false"
      show-icon
      class="case-geo__notice"
    />
    <el-alert
      v-else
      title="案例摘要由商家在完工预览确认；此处仅临时编辑。搜索描述由摘要自动派生。"
      type="info"
      :closable="false"
      show-icon
      class="case-geo__notice"
    />

    <el-form label-position="top" class="case-geo__form">
      <el-form-item label="案例摘要（100–250 字 · 页内与搜索共用）">
        <el-input
          v-model="form.aiSummary"
          type="textarea"
          :rows="5"
          maxlength="250"
          show-word-limit
          placeholder="商家确认的案例摘要；勿写金额。保存后搜索描述自动派生。"
        />
      </el-form-item>
      <p class="case-geo__derived">
        搜索描述（自动派生，只读）：{{ derivedSeoDescription || '（保存摘要后生成）' }}
      </p>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="故障现象（聚合）">
            <el-input
              v-model="form.faultDesc"
              type="textarea"
              :rows="3"
              :disabled="snapshotFrozen"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="检测结论（聚合）">
            <el-input
              v-model="form.inspectResult"
              type="textarea"
              :rows="3"
              :disabled="snapshotFrozen"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="维修方案（聚合）">
            <el-input
              v-model="form.repairPlan"
              type="textarea"
              :rows="3"
              :disabled="snapshotFrozen"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="完工确认（聚合）">
            <el-input
              v-model="form.resultConfirm"
              type="textarea"
              :rows="3"
              :disabled="snapshotFrozen"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="SEO 标题">
        <el-input v-model="form.seoTitle" maxlength="80" show-word-limit />
      </el-form-item>

      <el-form-item v-if="!snapshotFrozen" label="正文（次级，过程段）">
        <el-input
          v-model="form.articleBody"
          type="textarea"
          :rows="8"
          :disabled="snapshotFrozen"
        />
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { updateCaseGeoContent, updateCaseEnrichment, regenerateCaseArticle } from '@/api/case-review'
import GeoQualityTag from './GeoQualityTag.vue'

const props = defineProps({
  caseId: { type: String, required: true },
  detail: { type: Object, default: () => ({}) },
  editable: { type: Boolean, default: true },
})

const emit = defineEmits(['saved'])

const saving = ref(false)
const regenerating = ref(false)
const form = reactive({
  aiSummary: '',
  faultDesc: '',
  inspectResult: '',
  repairPlan: '',
  resultConfirm: '',
  seoTitle: '',
  articleBody: '',
})

const geoQuality = ref(null)
const snapshotFrozen = computed(() => Boolean(props.detail?.snapshotFrozen))

const derivedSeoDescription = computed(() => {
  const text = String(form.aiSummary || '').trim()
  if (!text) return ''
  if (text.length <= 160) return text
  return `${text.slice(0, 157)}…`
})

function buildSavePayload() {
  if (snapshotFrozen.value) {
    return {
      aiSummary: form.aiSummary,
      seoTitle: form.seoTitle,
    }
  }
  return {
    aiSummary: form.aiSummary,
    faultDesc: form.faultDesc,
    inspectResult: form.inspectResult,
    repairPlan: form.repairPlan,
    resultConfirm: form.resultConfirm,
    seoTitle: form.seoTitle,
    articleBody: form.articleBody,
  }
}

function syncFromDetail(detail) {
  const geo = detail.geo || {}
  const draftSummary =
    (detail.confirmedCaseDraft && detail.confirmedCaseDraft.caseSummary) || ''
  form.aiSummary = detail.aiSummary || draftSummary || ''
  form.faultDesc = geo.faultDesc || detail.geoPreview?.faultDesc || ''
  form.inspectResult = geo.inspectResult || detail.geoPreview?.inspectResult || ''
  form.repairPlan = geo.repairPlan || detail.geoPreview?.repairPlan || ''
  form.resultConfirm = geo.resultConfirm || detail.geoPreview?.resultConfirm || ''
  form.seoTitle = detail.seo?.title || ''
  form.articleBody = detail.articleBody || detail.article?.body || ''
  geoQuality.value = detail.geoQuality || null
}

watch(
  () => props.detail,
  (detail) => syncFromDetail(detail || {}),
  { immediate: true, deep: true }
)

async function onSave() {
  if (!props.editable || saving.value) return
  const len = (form.aiSummary || '').trim().length
  if (len > 0 && (len < 50 || len > 250)) {
    ElMessage.warning('案例摘要建议控制在 100–250 字（当前长度可能偏离）')
  }
  saving.value = true
  try {
    const saveApi = snapshotFrozen.value ? updateCaseEnrichment : updateCaseGeoContent
    const data = await saveApi(props.caseId, buildSavePayload())
    emit('saved', data)
    ElMessage.success('已保存（搜索描述已由摘要派生）')
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function onRegenerate() {
  if (!props.editable || regenerating.value) return
  try {
    await ElMessageBox.confirm(
      snapshotFrozen.value
        ? '将基于授权快照重生成 SEO / 摘要提炼层，快照正文与节点不会被改动；手改字段会保留。是否继续？'
        : '将按最新节点 note 重新生成模板稿；你已手改的字段会保留。是否继续？',
      snapshotFrozen.value ? '提炼层重生成' : '模板重生成',
      { type: 'warning' }
    )
  } catch {
    return
  }
  regenerating.value = true
  try {
    const data = await regenerateCaseArticle(props.caseId)
    emit('saved', data)
    ElMessage.success('已重生成（手改字段已保留）')
  } catch (e) {
    ElMessage.error(e?.message || '重生成失败')
  } finally {
    regenerating.value = false
  }
}
</script>

<style scoped>
.case-geo__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.case-geo__head-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.case-geo__actions {
  display: flex;
  gap: 8px;
}

.case-geo__notice {
  margin-bottom: 16px;
}

.case-geo__derived {
  margin: -8px 0 16px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}
</style>
