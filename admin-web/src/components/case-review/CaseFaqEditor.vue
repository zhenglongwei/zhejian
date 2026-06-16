<template>
  <el-card shadow="never" class="case-faq">
    <template #header>
      <div class="case-faq__head">
        <span>案例 FAQ</span>
        <el-button size="small" type="primary" :loading="saving" @click="onSave">
          保存
        </el-button>
      </div>
    </template>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="页内问答" name="inline">
        <el-alert
          title="填写问题与答案，展示在 H5 案例页并写入 FAQPage Schema；答案须合规，避免绝对承诺与营销禁词。"
          type="info"
          :closable="false"
          show-icon
          class="case-faq__notice"
        />
        <div v-for="(row, index) in inlineRows" :key="'inline-' + index" class="case-faq__row case-faq__row--inline">
          <el-input
            v-model="row.q"
            placeholder="问题，如：这个问题一定要马上修吗？"
            maxlength="120"
            show-word-limit
            class="case-faq__title"
          />
          <el-input
            v-model="row.a"
            placeholder="答案（建议含事实说明与到店检测提示）"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            class="case-faq__url"
          />
          <el-button
            v-if="inlineRows.length > 1"
            type="danger"
            link
            @click="removeInlineRow(index)"
          >
            删除
          </el-button>
        </div>
        <el-button v-if="inlineRows.length < maxInlineRows" link type="primary" @click="addInlineRow">
          + 添加页内问答
        </el-button>
      </el-tab-pane>

      <el-tab-pane label="公众号链接" name="links">
        <el-alert
          title="可选：填写标题与公众号文章链接，挂载到 H5 案例页「延伸阅读」区块；留空则不展示。"
          type="info"
          :closable="false"
          show-icon
          class="case-faq__notice"
        />
        <div v-for="(row, index) in linkRows" :key="'link-' + index" class="case-faq__row">
          <el-input
            v-model="row.title"
            placeholder="文章标题，如：刹车片多久换一次？"
            maxlength="80"
            show-word-limit
            class="case-faq__title"
          />
          <el-input
            v-model="row.url"
            placeholder="https://mp.weixin.qq.com/s/..."
            class="case-faq__url"
          />
          <el-button
            v-if="linkRows.length > 1"
            type="danger"
            link
            @click="removeLinkRow(index)"
          >
            删除
          </el-button>
        </div>
        <el-button v-if="linkRows.length < maxLinkRows" link type="primary" @click="addLinkRow">
          + 添加公众号链接
        </el-button>
      </el-tab-pane>
    </el-tabs>
  </el-card>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { updateCaseFaqLinks } from '@/api/case-review'

const props = defineProps({
  caseId: { type: String, required: true },
  faq: { type: Array, default: () => [] },
  faqInline: { type: Array, default: () => [] },
})

const emit = defineEmits(['saved'])

const maxLinkRows = 10
const maxInlineRows = 10
const saving = ref(false)
const activeTab = ref('inline')
const inlineRows = ref([{ q: '', a: '' }])
const linkRows = ref([{ title: '', url: '' }])

function syncFromProps(faq, faqInline) {
  const inlineList = Array.isArray(faqInline) && faqInline.length
    ? faqInline
    : (Array.isArray(faq) ? faq.filter((item) => item && item.q && item.a) : [])
  const linkList = Array.isArray(faq) ? faq.filter((item) => item && item.title && item.url) : []

  inlineRows.value = inlineList.length
    ? inlineList.map((item) => ({ q: item.q, a: item.a }))
    : [{ q: '', a: '' }]
  linkRows.value = linkList.length
    ? linkList.map((item) => ({ title: item.title, url: item.url }))
    : [{ title: '', url: '' }]
}

watch(
  () => [props.faq, props.faqInline],
  ([faq, faqInline]) => syncFromProps(faq, faqInline),
  { immediate: true, deep: true }
)

function addInlineRow() {
  if (inlineRows.value.length >= maxInlineRows) return
  inlineRows.value.push({ q: '', a: '' })
}

function removeInlineRow(index) {
  inlineRows.value.splice(index, 1)
  if (!inlineRows.value.length) inlineRows.value.push({ q: '', a: '' })
}

function addLinkRow() {
  if (linkRows.value.length >= maxLinkRows) return
  linkRows.value.push({ title: '', url: '' })
}

function removeLinkRow(index) {
  linkRows.value.splice(index, 1)
  if (!linkRows.value.length) linkRows.value.push({ title: '', url: '' })
}

async function onSave() {
  const inlinePayload = inlineRows.value
    .map((row) => ({
      q: String(row.q || '').trim(),
      a: String(row.a || '').trim(),
    }))
    .filter((row) => row.q || row.a)

  for (const row of inlinePayload) {
    if (!row.q || !row.a) {
      ElMessage.warning('页内问答须同时填写问题与答案')
      activeTab.value = 'inline'
      return
    }
  }

  const linkPayload = linkRows.value
    .map((row) => ({
      title: String(row.title || '').trim(),
      url: String(row.url || '').trim(),
    }))
    .filter((row) => row.title || row.url)

  for (const row of linkPayload) {
    if (!row.title || !row.url) {
      ElMessage.warning('公众号链接须同时填写标题与链接')
      activeTab.value = 'links'
      return
    }
    if (!/^https?:\/\/mp\.weixin\.qq\.com\//i.test(row.url)) {
      ElMessage.warning('链接须为 mp.weixin.qq.com 公众号文章地址')
      activeTab.value = 'links'
      return
    }
  }

  saving.value = true
  try {
    const detail = await updateCaseFaqLinks(props.caseId, {
      faqInline: inlinePayload,
      faqLinks: linkPayload,
    })
    ElMessage.success('FAQ 已保存')
    emit('saved', detail)
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.case-faq__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.case-faq__notice {
  margin-bottom: 12px;
}
.case-faq__row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 12px;
}
.case-faq__row--inline {
  display: grid;
  grid-template-columns: 1fr 2fr auto;
  align-items: start;
}
.case-faq__title {
  flex: 1 1 220px;
  min-width: 200px;
}
.case-faq__url {
  flex: 2 1 280px;
  min-width: 240px;
}
</style>
