<template>
  <div v-loading="loading" class="coach-page">
    <div class="page-head">
      <div>
        <h2 class="page-title">相册教练规则包</h2>
        <p class="page-desc">
          配置商家相册「建议拍 / 尽量别拍 / 备注怎么写」。保存后热更新，无需发版；未覆盖项回落代码内置包。
        </p>
      </div>
      <div class="page-actions">
        <el-button @click="onReload">刷新缓存</el-button>
        <el-button @click="createVisible = true">新建规则包</el-button>
      </div>
    </div>

    <el-alert
      class="mb-16"
      type="info"
      :closable="false"
      show-icon
      :title="metaHint"
    />

    <el-row :gutter="16">
      <el-col :span="7">
        <el-card shadow="never">
          <template #header>规则包列表</template>
          <el-menu :default-active="activeId" @select="onSelectPack">
            <el-menu-item v-for="pack in packs" :key="pack.id" :index="pack.id">
              <span>{{ pack.label }}</span>
              <el-tag v-if="pack.hasOverride" size="small" type="warning" class="ml-8">已覆盖</el-tag>
              <el-tag v-if="pack.isCustom" size="small" class="ml-8">自定义</el-tag>
            </el-menu-item>
          </el-menu>
        </el-card>
      </el-col>

      <el-col :span="17">
        <el-card v-if="detail" shadow="never">
          <template #header>
            <div class="card-head">
              <span>{{ detail.label || detail.id }}</span>
              <div>
                <el-button
                  v-if="detail.hasOverride || detail.isCustom"
                  type="danger"
                  plain
                  @click="onReset"
                >
                  {{ detail.isCustom ? '删除自定义包' : '恢复内置' }}
                </el-button>
                <el-button type="primary" :loading="saving" @click="onSave">保存覆盖</el-button>
              </div>
            </div>
          </template>

          <template v-if="detail.kind === 'common'">
            <el-form label-position="top">
              <el-form-item label="通用「尽量别拍」(JSON 数组)">
                <el-input v-model="form.commonAvoidText" type="textarea" :rows="10" />
              </el-form-item>
              <el-form-item label="通用阶段底稿 commonStages (JSON 对象)">
                <el-input v-model="form.commonStagesText" type="textarea" :rows="14" />
              </el-form-item>
              <el-form-item label="服务匹配 matchers (JSON 数组，可空=内置)">
                <el-input v-model="form.matchersText" type="textarea" :rows="8" />
              </el-form-item>
              <el-form-item label="完工清单 completeChecklist (JSON 数组)">
                <el-input v-model="form.checklistText" type="textarea" :rows="6" />
              </el-form-item>
            </el-form>
          </template>

          <template v-else>
            <el-form label-position="top">
              <el-form-item label="显示名称">
                <el-input v-model="form.label" />
              </el-form-item>
              <el-form-item label="GEO 金字塔提示（如 avoid_pitfall / standard_5s）">
                <el-input v-model="form.geoPyramidHint" />
              </el-form-item>
              <el-form-item label="匹配关键词（逗号分隔）">
                <el-input v-model="form.keywordsText" placeholder="底盘,异响,胶套" />
              </el-form-item>
              <el-form-item label="匹配模板 id（逗号分隔）">
                <el-input v-model="form.templatesText" placeholder="body_paint" />
              </el-form-item>
              <el-form-item label="分阶段规则 stages (JSON 对象)">
                <el-input v-model="form.stagesText" type="textarea" :rows="16" />
              </el-form-item>
            </el-form>
          </template>

          <el-divider>效果预览</el-divider>
          <el-form inline>
            <el-form-item label="服务名">
              <el-input v-model="preview.serviceName" style="width: 200px" />
            </el-form-item>
            <el-form-item label="阶段">
              <el-select v-model="preview.stageId" style="width: 140px">
                <el-option
                  v-for="s in stageOptions"
                  :key="s"
                  :label="s"
                  :value="s"
                />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button @click="onPreview">预览教练输出</el-button>
            </el-form-item>
          </el-form>
          <pre v-if="previewResult" class="preview-box">{{ previewResult }}</pre>
        </el-card>
        <el-empty v-else description="请选择左侧规则包" />
      </el-col>
    </el-row>

    <el-dialog v-model="createVisible" title="新建规则包" width="480px">
      <el-form label-position="top">
        <el-form-item label="id（字母数字下划线）">
          <el-input v-model="createForm.id" placeholder="battery" />
        </el-form-item>
        <el-form-item label="显示名称">
          <el-input v-model="createForm.label" placeholder="电瓶" />
        </el-form-item>
        <el-form-item label="匹配关键词（逗号分隔）">
          <el-input v-model="createForm.keywords" placeholder="电瓶,蓄电池" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="onCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createAlbumCoachPack,
  fetchAlbumCoachPack,
  fetchAlbumCoachPacks,
  previewAlbumCoach,
  reloadAlbumCoachConfig,
  resetAlbumCoachPack,
  saveAlbumCoachPack,
} from '@/api/album-coach'

const loading = ref(false)
const saving = ref(false)
const creating = ref(false)
const packs = ref([])
const meta = ref({})
const activeId = ref('common')
const detail = ref(null)
const createVisible = ref(false)
const previewResult = ref('')

const stageOptions = ['stage_1', 'stage_2', 'stage_3', 'stage_4', 'stage_5', 'stage_6']

const form = reactive({
  commonAvoidText: '',
  commonStagesText: '',
  matchersText: '',
  checklistText: '',
  label: '',
  geoPyramidHint: '',
  keywordsText: '',
  templatesText: '',
  stagesText: '',
})

const createForm = reactive({
  id: '',
  label: '',
  keywords: '',
})

const preview = reactive({
  serviceName: '底盘异响',
  stageId: 'stage_2',
})

const metaHint = computed(() => {
  const m = meta.value || {}
  if (!m.updatedAt) return '当前全部使用代码内置规则；保存后会写入覆盖文件并立即生效。'
  return `最近覆盖：${m.updatedAt}${m.updatedBy ? ` · ${m.updatedBy}` : ''}`
})

function pretty(value) {
  return JSON.stringify(value ?? null, null, 2)
}

function parseJson(text, label) {
  try {
    return JSON.parse(text || 'null')
  } catch (e) {
    throw new Error(`${label} JSON 无法解析：${e.message}`)
  }
}

function splitCsv(text) {
  return String(text || '')
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function fillFormFromDetail(data) {
  detail.value = data
  if (data.kind === 'common') {
    const merged = data.merged || {}
    form.commonAvoidText = pretty(merged.commonAvoid)
    form.commonStagesText = pretty(merged.commonStages)
    form.matchersText = pretty(merged.matchers)
    form.checklistText = pretty(merged.completeChecklist)
  } else {
    const merged = data.merged || {}
    form.label = merged.label || data.id
    form.geoPyramidHint = merged.geoPyramidHint || ''
    form.stagesText = pretty(merged.stages || {})
    const matcher = data.matcher || {}
    form.keywordsText = (matcher.keywords || []).join(',')
    form.templatesText = (matcher.templates || []).join(',')
    preview.serviceName = (matcher.keywords && matcher.keywords[0]) || form.label
  }
}

async function loadList(selectId) {
  loading.value = true
  try {
    const data = await fetchAlbumCoachPacks()
    packs.value = data.packs || []
    meta.value = data.meta || {}
    const nextId = selectId || activeId.value || packs.value[0]?.id || 'common'
    activeId.value = nextId
    await loadDetail(nextId)
  } finally {
    loading.value = false
  }
}

async function loadDetail(packId) {
  const data = await fetchAlbumCoachPack(packId)
  fillFormFromDetail(data)
}

function onSelectPack(id) {
  activeId.value = id
  loadDetail(id).catch(() => {})
}

async function onSave() {
  saving.value = true
  try {
    if (detail.value?.kind === 'common') {
      await saveAlbumCoachPack('common', {
        commonAvoid: parseJson(form.commonAvoidText, 'commonAvoid'),
        commonStages: parseJson(form.commonStagesText, 'commonStages'),
        matchers: parseJson(form.matchersText, 'matchers'),
        completeChecklist: parseJson(form.checklistText, 'completeChecklist'),
      })
    } else {
      await saveAlbumCoachPack(activeId.value, {
        pack: {
          label: form.label,
          geoPyramidHint: form.geoPyramidHint,
          stages: parseJson(form.stagesText, 'stages'),
        },
        matcherKeywords: splitCsv(form.keywordsText),
        matcherTemplates: splitCsv(form.templatesText),
      })
    }
    ElMessage.success('已保存，教练规则即时生效')
    await loadList(activeId.value)
  } catch (e) {
    if (e?.message) ElMessage.error(e.message)
  } finally {
    saving.value = false
  }
}

async function onReset() {
  await ElMessageBox.confirm(
    detail.value?.isCustom
      ? '将删除该自定义规则包，确认？'
      : '将清除运营覆盖并恢复代码内置规则，确认？',
    '确认',
  )
  await resetAlbumCoachPack(activeId.value)
  ElMessage.success('已恢复')
  await loadList(detail.value?.isCustom ? 'common' : activeId.value)
}

async function onCreate() {
  creating.value = true
  try {
    const data = await createAlbumCoachPack({
      id: createForm.id,
      label: createForm.label,
      matcherKeywords: splitCsv(createForm.keywords),
      stages: {},
    })
    createVisible.value = false
    createForm.id = ''
    createForm.label = ''
    createForm.keywords = ''
    ElMessage.success('已创建')
    await loadList(data.id)
  } finally {
    creating.value = false
  }
}

async function onReload() {
  meta.value = await reloadAlbumCoachConfig()
  ElMessage.success('已刷新缓存')
  await loadList(activeId.value)
}

async function onPreview() {
  const data = await previewAlbumCoach({
    serviceName: preview.serviceName,
    stageId: preview.stageId,
  })
  previewResult.value = pretty({
    servicePackId: data.servicePackId,
    servicePackLabel: data.servicePackLabel,
    uploadInlineHints: data.uploadInlineHints,
    notePlaceholder: data.notePlaceholder,
    avoidSummary: data.avoidSummary,
    coachCards: data.coachCards,
  })
}

onMounted(() => {
  loadList('common')
})
</script>

<style scoped>
.page-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.page-title {
  margin: 0 0 4px;
  font-size: 20px;
}
.page-desc {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.page-actions {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.mb-16 {
  margin-bottom: 16px;
}
.ml-8 {
  margin-left: 8px;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.preview-box {
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 8px;
  max-height: 360px;
  overflow: auto;
  font-size: 12px;
  white-space: pre-wrap;
}
</style>
