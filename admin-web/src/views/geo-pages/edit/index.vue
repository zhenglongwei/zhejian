<template>
  <div v-loading="loading">
    <el-page-header @back="goBack">
      <template #content>
        <span>{{ isCreate ? '新建 GEO 专题' : form.title || '编辑 GEO 专题' }}</span>
      </template>
    </el-page-header>

    <el-form label-position="top" class="geo-form">
      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="标题" required>
            <el-input v-model="form.title" maxlength="80" show-word-limit />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="slug" required>
            <el-input v-model="form.slug" placeholder="hangzhou-brake-pad" :disabled="!isCreate" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="页面类型">
            <el-select v-model="form.pageType" style="width: 100%">
              <el-option
                v-for="opt in GEO_PAGE_TYPE_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="城市">
            <el-input v-model="form.city" />
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
      </el-row>

      <el-form-item label="摘要">
        <el-input v-model="form.summary" type="textarea" :rows="3" maxlength="500" show-word-limit />
      </el-form-item>

      <el-form-item label="AI 摘要（H5 首屏）">
        <el-input v-model="form.aiSummary" type="textarea" :rows="4" maxlength="300" show-word-limit />
      </el-form-item>

      <el-form-item label="关键词（逗号分隔）">
        <el-input v-model="keywordsText" placeholder="刹车片, 杭州" />
      </el-form-item>

      <el-form-item label="适用场景（每行一条）">
        <el-input v-model="scenariosText" type="textarea" :rows="3" />
      </el-form-item>

      <el-form-item label="价格影响因素（每行一条）">
        <el-input v-model="priceFactorsText" type="textarea" :rows="3" />
      </el-form-item>

      <el-form-item label="页内 FAQ">
        <div class="faq-toolbar">
          <el-button size="small" :loading="templateLoading" @click="onApplyFaqTemplate">
            应用合规模板
          </el-button>
        </div>
        <div v-for="(item, index) in form.faq" :key="index" class="faq-row">
          <el-input v-model="item.q" placeholder="问题" class="faq-q" />
          <el-input v-model="item.a" placeholder="答案" type="textarea" :rows="2" class="faq-a" />
          <el-button link type="danger" @click="removeFaq(index)">删除</el-button>
        </div>
        <el-button link type="primary" @click="addFaq">+ 添加问答</el-button>
      </el-form-item>

      <el-form-item label="延伸阅读（公众号链接）">
        <div v-for="(item, index) in form.faqLinks" :key="'link-' + index" class="faq-row faq-row--link">
          <el-input v-model="item.title" placeholder="文章标题" class="faq-q" />
          <el-input v-model="item.url" placeholder="https://mp.weixin.qq.com/s/..." class="faq-a" />
          <el-button link type="danger" @click="removeFaqLink(index)">删除</el-button>
        </div>
        <el-button link type="primary" @click="addFaqLink">+ 添加链接</el-button>
      </el-form-item>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="关联案例 ID（逗号分隔）">
            <el-input v-model="relatedCaseIdsText" placeholder="case_001, case_002" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="关联门店 ID（逗号分隔）">
            <el-input v-model="relatedStoreIdsText" placeholder="store_demo_1" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="主门店 ID">
            <el-input v-model="form.primaryStoreId" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="关联服务 ID">
            <el-input v-model="form.relatedServiceId" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="SEO 标题">
        <el-input v-model="form.seoTitle" maxlength="80" show-word-limit />
      </el-form-item>
      <el-form-item label="SEO 描述">
        <el-input v-model="form.seoDescription" type="textarea" :rows="2" maxlength="160" show-word-limit />
      </el-form-item>
    </el-form>

    <div class="actions">
      <el-button @click="goBack">返回</el-button>
      <el-button v-if="!isCreate && form.status !== 'published'" type="success" :loading="publishing" @click="onPublish">
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
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  fetchGeoPageDetail,
  createGeoPage,
  updateGeoPage,
  publishGeoPage,
  unpublishGeoPage,
  fetchGeoFaqTemplate,
} from '@/api/geo-pages'
import { GEO_PAGE_TYPE_OPTIONS } from '@/constants/geo-pages'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)
const templateLoading = ref(false)

const isCreate = computed(() => route.name === 'geo-page-create')

const form = reactive({
  title: '',
  slug: '',
  summary: '',
  aiSummary: '',
  pageType: 'city_service',
  city: '杭州',
  status: 'draft',
  primaryStoreId: '',
  relatedServiceId: '',
  seoTitle: '',
  seoDescription: '',
  faq: [{ q: '', a: '' }],
  faqLinks: [{ title: '', url: '' }],
})

const keywordsText = ref('')
const scenariosText = ref('')
const priceFactorsText = ref('')
const relatedCaseIdsText = ref('')
const relatedStoreIdsText = ref('')

function splitLines(text) {
  return String(text || '')
    .split(/[\n,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function buildPayload() {
  return {
    ...form,
    keywords: splitLines(keywordsText.value),
    scenarios: splitLines(scenariosText.value),
    priceFactors: splitLines(priceFactorsText.value),
    relatedCaseIds: splitLines(relatedCaseIdsText.value),
    faq: (form.faq || []).filter((item) => item.q && item.a),
    faqLinks: (form.faqLinks || []).filter((item) => item.title && item.url),
  }
}

function syncFromDetail(detail) {
  Object.assign(form, {
    title: detail.title || '',
    slug: detail.slug || '',
    summary: detail.summary || '',
    aiSummary: detail.aiSummary || '',
    pageType: detail.pageType || 'city_service',
    city: detail.city || '',
    status: detail.status || 'draft',
    primaryStoreId: detail.primaryStoreId || '',
    relatedServiceId: detail.relatedServiceId || '',
    seoTitle: detail.seoTitle || '',
    seoDescription: detail.seoDescription || '',
    faq: (detail.faq || []).length ? detail.faq.map((item) => ({ ...item })) : [{ q: '', a: '' }],
    faqLinks: (detail.faqLinks || []).length
      ? detail.faqLinks.map((item) => ({ ...item }))
      : [{ title: '', url: '' }],
  })
  keywordsText.value = (detail.keywords || []).join(', ')
  scenariosText.value = (detail.scenarios || []).join('\n')
  priceFactorsText.value = (detail.priceFactors || []).join('\n')
  relatedCaseIdsText.value = (detail.relatedCaseIds || []).join(', ')
  relatedStoreIdsText.value = (detail.relatedStoreIds || []).join(', ')
}

async function loadDetail() {
  if (isCreate.value) return
  loading.value = true
  try {
    const detail = await fetchGeoPageDetail(route.params.pageId)
    syncFromDetail(detail)
  } finally {
    loading.value = false
  }
}

function addFaq() {
  form.faq.push({ q: '', a: '' })
}

function removeFaq(index) {
  form.faq.splice(index, 1)
  if (!form.faq.length) form.faq.push({ q: '', a: '' })
}

function addFaqLink() {
  form.faqLinks.push({ title: '', url: '' })
}

function removeFaqLink(index) {
  form.faqLinks.splice(index, 1)
  if (!form.faqLinks.length) form.faqLinks.push({ title: '', url: '' })
}

async function onApplyFaqTemplate() {
  templateLoading.value = true
  try {
    const result = await fetchGeoFaqTemplate({
      pageType: form.pageType,
      serviceId: form.relatedServiceId || form.serviceId,
      city: form.city,
      title: form.title,
    })
    const list = result?.faq || []
    if (!list.length) {
      ElMessage.warning('暂无匹配模板')
      return
    }
    form.faq = list.map((item) => ({ q: item.q, a: item.a }))
    ElMessage.success('已填入合规 FAQ 模板，请核对后保存')
  } catch (e) {
    ElMessage.error(e?.message || '加载模板失败')
  } finally {
    templateLoading.value = false
  }
}

function goBack() {
  router.push({ name: 'geo-page-list' })
}

async function onSave() {
  if (!form.title.trim() || !form.slug.trim()) {
    ElMessage.warning('请填写标题与 slug')
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

onMounted(loadDetail)
</script>

<style scoped>
.geo-form {
  margin-top: 16px;
  max-width: 960px;
}
.faq-row {
  display: grid;
  grid-template-columns: 1fr 2fr auto;
  gap: 8px;
  margin-bottom: 8px;
  align-items: start;
}
.faq-toolbar {
  margin-bottom: 8px;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 24px;
}
</style>
