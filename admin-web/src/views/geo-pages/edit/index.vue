<template>
  <div v-loading="loading">
    <el-page-header @back="goBack">
      <template #content>
        <span>{{ isCreate ? '新建专题文章' : form.title || '编辑专题文章' }}</span>
      </template>
    </el-page-header>

    <el-alert
      class="mt-16"
      type="info"
      :closable="false"
      show-icon
      title="流程：站外了解用户问题 → 本站搜索/导出案例 → 外部大模型写稿 → 回填标题、摘要、关键词、正文，并勾选关联案例。"
    />

    <el-form label-position="top" class="geo-form">
      <el-form-item label="标题" required>
        <el-input
          v-model="form.title"
          maxlength="80"
          show-word-limit
          placeholder="对 AI 搜索友好的专题标题，如：杭州吉利帝豪刹车片更换参考"
        />
      </el-form-item>

      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="城市">
            <el-input v-model="form.city" placeholder="如：杭州" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="状态">
            <el-select v-model="form.status" style="width: 100%">
              <el-option label="草稿" value="draft" />
              <el-option label="已发布" value="published" />
              <el-option label="noindex" value="noindex" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="公开地址（自动生成）">
            <el-input :model-value="slugPreview" disabled />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="摘要" required>
        <el-input
          v-model="form.summary"
          type="textarea"
          :rows="3"
          maxlength="300"
          show-word-limit
          placeholder="首屏答案段：说清楚城市/服务、能给读者什么参考。有案例时建议带「收录 N 例」等可引用事实。"
        />
      </el-form-item>

      <el-form-item label="关键词">
        <el-select
          v-model="keywordTags"
          multiple
          filterable
          allow-create
          default-first-option
          style="width: 100%"
          placeholder="输入后回车添加，如：刹车片、帝豪、杭州"
        />
      </el-form-item>

      <el-form-item label="正文" required>
        <el-input
          v-model="form.articleBody"
          type="textarea"
          :rows="16"
          placeholder="粘贴外部大模型生成的专题全文。可用空行分段。"
        />
      </el-form-item>

      <el-form-item label="关联案例">
        <div class="case-picker">
          <div class="case-picker__search">
            <el-input
              v-model="caseKeyword"
              clearable
              placeholder="按标题 / 服务 / 城市 / 门店搜索已公示案例"
              @keyup.enter="searchCases"
            />
            <el-button type="primary" :loading="caseSearching" @click="searchCases">搜索</el-button>
          </div>
          <el-table
            v-if="caseSearchList.length"
            :data="caseSearchList"
            size="small"
            border
            max-height="260"
            @selection-change="onCaseSelectionChange"
            ref="caseTableRef"
          >
            <el-table-column type="selection" width="48" :selectable="() => true" />
            <el-table-column prop="title" label="案例" min-width="200" show-overflow-tooltip />
            <el-table-column prop="serviceName" label="服务" width="120" />
            <el-table-column prop="city" label="城市" width="80" />
            <el-table-column prop="storeName" label="门店" width="140" show-overflow-tooltip />
          </el-table>
          <el-empty v-else-if="caseSearched" description="未找到案例，可先到案例审核确认已公示" :image-size="64" />

          <div v-if="selectedCases.length" class="selected-block">
            <div class="selected-title">已选 {{ selectedCases.length }} 条</div>
            <el-tag
              v-for="item in selectedCases"
              :key="item.caseId"
              class="selected-tag"
              closable
              @close="removeSelectedCase(item.caseId)"
            >
              {{ item.title || item.caseId }}
            </el-tag>
          </div>
        </div>
      </el-form-item>

      <el-form-item v-if="suggestedStores.length || suggestedServices.length" label="由案例带出">
        <div v-if="suggestedStores.length" class="suggest-row">
          <span class="suggest-label">门店</span>
          <el-checkbox-group v-model="selectedStoreIds">
            <el-checkbox v-for="store in suggestedStores" :key="store.id" :label="store.id">
              {{ store.name }}
            </el-checkbox>
          </el-checkbox-group>
        </div>
        <div v-if="suggestedServices.length" class="suggest-row">
          <span class="suggest-label">服务</span>
          <el-radio-group v-model="form.relatedServiceName">
            <el-radio v-for="name in suggestedServices" :key="name" :label="name">{{ name }}</el-radio>
          </el-radio-group>
        </div>
      </el-form-item>

      <el-form-item v-if="!isCreate && publishReadiness.checks?.length" label="发布前检查">
        <el-alert
          :type="publishReadiness.canPublish ? 'success' : 'warning'"
          :closable="false"
          show-icon
          :title="publishReadiness.canPublish ? '可发布' : '请先补齐下列项'"
        />
        <ul class="sop-list">
          <li v-for="item in publishReadiness.checks" :key="item.id">
            <el-tag :type="item.passed ? 'success' : item.required ? 'danger' : 'info'" size="small">
              {{ item.passed ? '通过' : item.required ? '必填' : '建议' }}
            </el-tag>
            <span>{{ item.label }}</span>
            <span class="sop-detail">{{ item.detail }}</span>
          </li>
        </ul>
      </el-form-item>
    </el-form>

    <div class="actions">
      <el-button @click="goBack">返回</el-button>
      <el-button
        v-if="!isCreate && form.status !== 'published'"
        type="success"
        :loading="publishing"
        :disabled="publishReadiness.canPublish === false"
        @click="onPublish"
      >
        发布
      </el-button>
      <el-button v-if="!isCreate && form.status === 'published'" :loading="publishing" @click="onUnpublish">
        下架为草稿
      </el-button>
      <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  fetchGeoPageDetail,
  createGeoPage,
  updateGeoPage,
  publishGeoPage,
  unpublishGeoPage,
} from '@/api/geo-pages'
import { fetchCaseList } from '@/api/case-review'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)
const publishReadiness = ref({ checks: [], canPublish: true })

const isCreate = computed(() => route.name === 'geo-page-create')

const form = reactive({
  title: '',
  slug: '',
  summary: '',
  articleBody: '',
  city: '杭州',
  status: 'draft',
  pageType: 'city_service',
  relatedServiceId: '',
  relatedServiceName: '',
  primaryStoreId: '',
})

const keywordTags = ref([])
const caseKeyword = ref('')
const caseSearching = ref(false)
const caseSearched = ref(false)
const caseSearchList = ref([])
const selectedCases = ref([])
const selectedStoreIds = ref([])
const caseTableRef = ref(null)
const pendingSelectionIds = ref([])

const slugPreview = computed(() => {
  if (form.slug) return `/service/… 或专题短链：${form.slug}`
  return '保存时自动生成（无需手填）'
})

const suggestedStores = computed(() => {
  const map = new Map()
  selectedCases.value.forEach((item) => {
    if (!item.storeId) return
    if (!map.has(item.storeId)) {
      map.set(item.storeId, { id: item.storeId, name: item.storeName || item.storeId })
    }
  })
  return [...map.values()]
})

const suggestedServices = computed(() => {
  const set = new Set()
  selectedCases.value.forEach((item) => {
    if (item.serviceName) set.add(item.serviceName)
  })
  return [...set]
})

watch(suggestedStores, (stores) => {
  const valid = new Set(stores.map((s) => s.id))
  selectedStoreIds.value = selectedStoreIds.value.filter((id) => valid.has(id))
  if (!selectedStoreIds.value.length && stores.length) {
    selectedStoreIds.value = stores.map((s) => s.id)
  }
  if (!form.primaryStoreId && stores[0]) form.primaryStoreId = stores[0].id
})

watch(suggestedServices, (names) => {
  if (!form.relatedServiceName && names[0]) form.relatedServiceName = names[0]
})

function goBack() {
  router.push({ name: 'geo-page-list' })
}

function mapCaseRow(row) {
  return {
    caseId: row.caseId || row.id,
    title: row.title || '',
    serviceName: row.serviceName || '',
    city: row.city || '',
    storeId: row.storeId || '',
    storeName: row.storeName || '',
  }
}

async function searchCases() {
  caseSearching.value = true
  caseSearched.value = true
  try {
    const data = await fetchCaseList({
      tab: 'approved',
      keyword: caseKeyword.value || undefined,
      page: 1,
      pageSize: 30,
    })
    caseSearchList.value = (data.list || []).map(mapCaseRow)
    await nextTick()
    syncTableSelection()
  } catch (e) {
    ElMessage.error(e?.message || '搜索失败')
  } finally {
    caseSearching.value = false
  }
}

function syncTableSelection() {
  const table = caseTableRef.value
  if (!table) return
  const selectedIds = new Set(selectedCases.value.map((item) => item.caseId))
  caseSearchList.value.forEach((row) => {
    table.toggleRowSelection(row, selectedIds.has(row.caseId))
  })
}

function onCaseSelectionChange(rows) {
  const fromSearch = (rows || []).map(mapCaseRow)
  const keepOutside = selectedCases.value.filter(
    (item) => !caseSearchList.value.some((row) => row.caseId === item.caseId),
  )
  const merged = new Map()
  ;[...keepOutside, ...fromSearch].forEach((item) => {
    if (item.caseId) merged.set(item.caseId, item)
  })
  selectedCases.value = [...merged.values()]
}

function removeSelectedCase(caseId) {
  selectedCases.value = selectedCases.value.filter((item) => item.caseId !== caseId)
  nextTick(syncTableSelection)
}

function buildPayload() {
  const relatedCaseIds = selectedCases.value.map((item) => item.caseId).filter(Boolean)
  const relatedStoreIds = selectedStoreIds.value.length
    ? selectedStoreIds.value
    : suggestedStores.value.map((s) => s.id)
  return {
    title: form.title,
    summary: form.summary,
    articleBody: form.articleBody,
    city: form.city,
    status: form.status,
    pageType: form.pageType || 'city_service',
    keywords: keywordTags.value,
    relatedCaseIds,
    relatedStoreIds,
    primaryStoreId: form.primaryStoreId || relatedStoreIds[0] || '',
    relatedServiceId: form.relatedServiceId || '',
    faq: [],
    faqLinks: [],
    scenarios: [],
    priceFactors: [],
  }
}

function syncFromDetail(detail) {
  form.title = detail.title || ''
  form.slug = detail.slug || ''
  form.summary = detail.summary || detail.aiSummary || ''
  form.articleBody = detail.articleBody || detail.serviceMeta?.articleBody || ''
  form.city = detail.city || ''
  form.status = detail.status || 'draft'
  form.pageType = detail.pageType || 'city_service'
  form.relatedServiceId = detail.relatedServiceId || ''
  form.primaryStoreId = detail.primaryStoreId || ''
  keywordTags.value = [...(detail.keywords || [])]
  selectedStoreIds.value = [...(detail.relatedStoreIds || [])]
  publishReadiness.value = detail.publishReadiness || { checks: [], canPublish: true }

  const fromDetailCases = (detail.relatedCases || []).map((item) =>
    mapCaseRow({
      caseId: item.id || item.caseId,
      title: item.title,
      serviceName: item.serviceName,
      city: item.city,
      storeId: item.storeId,
      storeName: item.storeName,
    }),
  )
  if (fromDetailCases.length) {
    selectedCases.value = fromDetailCases
  } else if ((detail.relatedCaseIds || []).length) {
    pendingSelectionIds.value = [...detail.relatedCaseIds]
    selectedCases.value = detail.relatedCaseIds.map((id) => ({
      caseId: id,
      title: id,
      serviceName: '',
      city: '',
      storeId: '',
      storeName: '',
    }))
  } else {
    selectedCases.value = []
  }

  if (detail.relatedCases?.[0]?.serviceName) {
    form.relatedServiceName = detail.relatedCases[0].serviceName
  }
}

async function hydratePendingCases() {
  if (!pendingSelectionIds.value.length) return
  try {
    const data = await fetchCaseList({ tab: 'approved', page: 1, pageSize: 50 })
    const map = new Map((data.list || []).map((row) => [row.caseId, mapCaseRow(row)]))
    selectedCases.value = pendingSelectionIds.value.map(
      (id) => map.get(id) || { caseId: id, title: id, serviceName: '', city: '', storeId: '', storeName: '' },
    )
  } catch {
    /* keep placeholders */
  } finally {
    pendingSelectionIds.value = []
  }
}

async function loadDetail() {
  if (isCreate.value) return
  loading.value = true
  try {
    const detail = await fetchGeoPageDetail(route.params.pageId)
    syncFromDetail(detail)
    await hydratePendingCases()
  } finally {
    loading.value = false
  }
}

async function onSave() {
  if (!form.title.trim()) {
    ElMessage.warning('请填写标题')
    return
  }
  if (!form.summary.trim()) {
    ElMessage.warning('请填写摘要')
    return
  }
  if (!form.articleBody.trim()) {
    ElMessage.warning('请填写正文')
    return
  }
  saving.value = true
  try {
    const payload = buildPayload()
    if (isCreate.value) {
      const created = await createGeoPage(payload)
      ElMessage.success('已创建')
      router.replace({ name: 'geo-page-edit', params: { pageId: created.id || created.slug } })
      syncFromDetail(created)
      return
    }
    const updated = await updateGeoPage(route.params.pageId, payload)
    syncFromDetail(updated)
    ElMessage.success('已保存')
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function onPublish() {
  publishing.value = true
  try {
    await onSave()
    const detail = await publishGeoPage(route.params.pageId)
    syncFromDetail(detail)
    ElMessage.success('已发布')
  } catch (e) {
    ElMessage.error(e?.message || '发布失败')
  } finally {
    publishing.value = false
  }
}

async function onUnpublish() {
  publishing.value = true
  try {
    const detail = await unpublishGeoPage(route.params.pageId)
    syncFromDetail(detail)
    ElMessage.success('已下架')
  } catch (e) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    publishing.value = false
  }
}

onMounted(async () => {
  await loadDetail()
  if (!isCreate.value) {
    caseKeyword.value = form.city || ''
  }
})
</script>

<style scoped>
.mt-16 {
  margin-top: 16px;
}
.geo-form {
  margin-top: 16px;
  max-width: 920px;
}
.case-picker__search {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.selected-block {
  margin-top: 12px;
}
.selected-title {
  font-size: 13px;
  margin-bottom: 8px;
  color: var(--el-text-color-secondary);
}
.selected-tag {
  margin: 0 8px 8px 0;
}
.suggest-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 8px;
}
.suggest-label {
  flex: 0 0 48px;
  color: var(--el-text-color-secondary);
  line-height: 32px;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 24px;
}
.sop-list {
  margin: 8px 0 0;
  padding-left: 0;
  list-style: none;
}
.sop-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13px;
}
.sop-detail {
  color: var(--el-text-color-secondary);
}
</style>
