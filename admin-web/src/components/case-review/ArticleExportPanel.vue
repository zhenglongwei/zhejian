<template>
  <el-card shadow="never" class="article-export">
    <template #header>
      <div class="article-export__head">
        <span>公众号文章导出</span>
        <el-button
          v-if="canMarkWechat"
          size="small"
          type="success"
          :loading="marking"
          @click="onMarkPublishedWechat"
        >
          标记已发公众号
        </el-button>
      </div>
    </template>

    <el-alert
      title="与 H5 案例页同源；文末转化仅链本店 H5。复制 HTML 后粘贴至公众号图文编辑器。"
      type="info"
      :closable="false"
      show-icon
      class="article-export__notice"
    />

    <div v-loading="loading">
      <template v-if="exportData">
        <p class="article-export__title">
          <strong>文章标题（填至公众号标题栏）：</strong>{{ exportData.title }}
        </p>
        <p v-if="exportData.h5Url" class="article-export__meta">
          H5 案例：
          <a :href="exportData.h5Url" target="_blank" rel="noopener">{{ exportData.h5Url }}</a>
        </p>

        <el-tabs v-model="activeTab">
          <el-tab-pane label="HTML" name="html">
            <el-input
              v-model="exportData.html"
              type="textarea"
              :rows="14"
              readonly
              class="article-export__textarea"
            />
            <el-button type="primary" @click="copyField('html')">复制 HTML</el-button>
          </el-tab-pane>
          <el-tab-pane label="Markdown" name="markdown">
            <el-input
              v-model="exportData.markdown"
              type="textarea"
              :rows="14"
              readonly
              class="article-export__textarea"
            />
            <el-button @click="copyField('markdown')">复制 Markdown</el-button>
          </el-tab-pane>
        </el-tabs>

        <ul class="article-export__hints">
          <li v-for="(hint, i) in exportData.hints || []" :key="i">{{ hint }}</li>
        </ul>
      </template>
      <el-empty v-else-if="!loading" :description="emptyText" :image-size="48" />
    </div>
  </el-card>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { fetchCaseArticleExport, markCaseArticlePublishedWechat } from '@/api/case-review'

const props = defineProps({
  caseId: { type: String, required: true },
  status: { type: String, default: '' },
  articleStatus: { type: String, default: '' },
})

const emit = defineEmits(['marked-wechat'])

const loading = ref(false)
const marking = ref(false)
const exportData = ref(null)
const activeTab = ref('html')
const loadError = ref('')

const emptyText = computed(() => loadError.value || '暂无导出内容')
const canMarkWechat = computed(
  () =>
    props.status === 'public_approved' &&
    exportData.value &&
    props.articleStatus !== 'published_wechat'
)

async function loadExport() {
  if (!props.caseId || props.status !== 'public_approved') {
    exportData.value = null
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    exportData.value = await fetchCaseArticleExport(props.caseId)
  } catch (e) {
    exportData.value = null
    loadError.value = e?.message || '加载导出失败'
  } finally {
    loading.value = false
  }
}

async function copyField(field) {
  const text = exportData.value && exportData.value[field]
  if (!text) {
    ElMessage.warning('内容为空')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(field === 'html' ? 'HTML 已复制' : 'Markdown 已复制')
  } catch (e) {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}

async function onMarkPublishedWechat() {
  await ElMessageBox.confirm('确认该案例已在公众号发布？', '标记确认')
  marking.value = true
  try {
    await markCaseArticlePublishedWechat(props.caseId)
    ElMessage.success('已标记为已发公众号')
    emit('marked-wechat')
  } catch (e) {
    ElMessage.error(e?.message || '标记失败')
  } finally {
    marking.value = false
  }
}

watch(
  () => [props.caseId, props.status],
  () => {
    loadExport()
  }
)

onMounted(loadExport)
</script>

<style scoped>
.article-export__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.article-export__notice {
  margin-bottom: 12px;
}
.article-export__title {
  margin: 0 0 8px;
  font-size: 14px;
}
.article-export__meta {
  margin: 0 0 12px;
  font-size: 13px;
  color: #666;
  word-break: break-all;
}
.article-export__textarea {
  margin-bottom: 12px;
}
.article-export__hints {
  margin: 16px 0 0;
  padding-left: 18px;
  font-size: 13px;
  color: #666;
}
</style>
