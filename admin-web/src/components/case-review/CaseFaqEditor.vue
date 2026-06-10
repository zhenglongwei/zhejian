<template>
  <el-card shadow="never" class="case-faq">
    <template #header>
      <div class="case-faq__head">
        <span>案例 FAQ（公众号外链）</span>
        <el-button size="small" type="primary" :loading="saving" @click="onSave">
          保存
        </el-button>
      </div>
    </template>

    <el-alert
      title="可选：填写标题与公众号文章链接，挂载到 H5 案例页「延伸阅读」区块；留空则不展示。不再自动生成短问答。"
      type="info"
      :closable="false"
      show-icon
      class="case-faq__notice"
    />

    <div v-for="(row, index) in rows" :key="index" class="case-faq__row">
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
        v-if="rows.length > 1"
        type="danger"
        link
        @click="removeRow(index)"
      >
        删除
      </el-button>
    </div>

    <el-button v-if="rows.length < maxRows" link type="primary" @click="addRow">
      + 添加一条
    </el-button>
  </el-card>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { updateCaseFaqLinks } from '@/api/case-review'

const props = defineProps({
  caseId: { type: String, required: true },
  faq: { type: Array, default: () => [] },
})

const emit = defineEmits(['saved'])

const maxRows = 10
const saving = ref(false)
const rows = ref([{ title: '', url: '' }])

function syncFromProps(faq) {
  const list = Array.isArray(faq) ? faq.filter((item) => item && item.title && item.url) : []
  rows.value = list.length
    ? list.map((item) => ({ title: item.title, url: item.url }))
    : [{ title: '', url: '' }]
}

watch(
  () => props.faq,
  (faq) => syncFromProps(faq),
  { immediate: true, deep: true }
)

function addRow() {
  if (rows.value.length >= maxRows) return
  rows.value.push({ title: '', url: '' })
}

function removeRow(index) {
  rows.value.splice(index, 1)
  if (!rows.value.length) rows.value.push({ title: '', url: '' })
}

async function onSave() {
  const payload = rows.value
    .map((row) => ({
      title: String(row.title || '').trim(),
      url: String(row.url || '').trim(),
    }))
    .filter((row) => row.title || row.url)

  for (const row of payload) {
    if (!row.title || !row.url) {
      ElMessage.warning('已填写的条目须同时包含标题与公众号链接')
      return
    }
    if (!/^https?:\/\/mp\.weixin\.qq\.com\//i.test(row.url)) {
      ElMessage.warning('链接须为 mp.weixin.qq.com 公众号文章地址')
      return
    }
  }

  saving.value = true
  try {
    const detail = await updateCaseFaqLinks(props.caseId, { faq: payload })
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
.case-faq__title {
  flex: 1 1 220px;
  min-width: 200px;
}
.case-faq__url {
  flex: 2 1 280px;
  min-width: 240px;
}
</style>
