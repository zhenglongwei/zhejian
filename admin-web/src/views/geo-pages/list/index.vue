<template>
  <div v-loading="loading">
    <div class="page-head">
      <div>
        <h2 class="page-title">专题工作台</h2>
        <p class="page-desc">
          先搜索平台是否已有专题；没有则新建。可用「导出案例包」交给外部大模型写初稿，再回填定稿发布。
        </p>
      </div>
      <div class="page-actions">
        <el-button @click="exportVisible = true">导出案例包</el-button>
        <el-button type="primary" @click="goCreate">新建专题</el-button>
      </div>
    </div>

    <el-form :inline="true" class="filter-form" @submit.prevent="onSearch">
      <el-form-item label="搜索专题">
        <el-input
          v-model="filters.keyword"
          clearable
          placeholder="标题 / slug / 城市"
          style="width: 260px"
          @keyup.enter="onSearch"
        />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="filters.status" clearable style="width: 140px">
          <el-option
            v-for="opt in GEO_PAGE_STATUS_OPTIONS"
            :key="opt.value || 'all'"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="onSearch">搜索</el-button>
      </el-form-item>
    </el-form>

    <el-alert
      v-if="searched && !loading && !list.length"
      class="mb-16"
      type="warning"
      :closable="false"
      title="未找到匹配专题。可点击右上角「新建专题」，或先导出相关案例包用外部工具写稿。"
      show-icon
    />

    <el-table v-if="list.length" :data="list" border stripe @row-click="goEdit">
      <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
      <el-table-column prop="slug" label="slug" width="200" show-overflow-tooltip />
      <el-table-column prop="city" label="城市" width="100" />
      <el-table-column label="类型" width="120">
        <template #default="{ row }">{{ pageTypeLabel(row.pageType) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="row.status === 'published' ? 'success' : row.status === 'draft' ? 'info' : 'warning'">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updatedAt" label="更新时间" width="170" />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="goEdit(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-else-if="!loading && !searched" description="输入关键词搜索已有专题，或直接新建" />
    <el-empty v-else-if="!loading" description="暂无专题" />

    <el-pagination
      v-if="total > 0"
      class="pager"
      layout="total, prev, pager, next"
      :total="total"
      :page-size="pageSize"
      :current-page="page"
      @current-change="onPageChange"
    />

    <el-dialog v-model="exportVisible" title="导出相关案例包" width="560px" destroy-on-close>
      <el-alert
        class="mb-16"
        type="info"
        :closable="false"
        title="导出内容仅为已审核公开摘要与结构化字段，不含单据原图。复制 Markdown 后可粘贴到外部免费大模型生成专题初稿。"
        show-icon
      />
      <el-form label-width="88px">
        <el-form-item label="城市">
          <el-input v-model="exportForm.city" clearable placeholder="如：杭州" />
        </el-form-item>
        <el-form-item label="服务">
          <el-input v-model="exportForm.serviceName" clearable placeholder="如：小保养、刹车片" />
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="exportForm.keyword" clearable placeholder="可选，匹配标题/摘要" />
        </el-form-item>
        <el-form-item label="条数">
          <el-input-number v-model="exportForm.limit" :min="1" :max="50" />
        </el-form-item>
      </el-form>
      <div v-if="exportResult" class="export-result">
        <p>已匹配 {{ exportResult.caseCount || 0 }} 条案例</p>
        <el-input
          v-model="exportResult.markdown"
          type="textarea"
          :rows="12"
          readonly
        />
      </div>
      <template #footer>
        <el-button @click="exportVisible = false">关闭</el-button>
        <el-button :loading="exporting" @click="onExport">生成导出</el-button>
        <el-button
          type="primary"
          :disabled="!exportResult?.markdown"
          @click="copyMarkdown"
        >
          复制 Markdown
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { fetchGeoPageList } from '@/api/geo-pages'
import { exportGeoCasePack } from '@/api/geo-obs'
import {
  GEO_PAGE_STATUS_OPTIONS,
  statusLabel,
  pageTypeLabel,
} from '@/constants/geo-pages'

const router = useRouter()
const loading = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const searched = ref(false)
const filters = reactive({ keyword: '', status: '' })

const exportVisible = ref(false)
const exporting = ref(false)
const exportResult = ref(null)
const exportForm = reactive({
  city: '',
  serviceName: '',
  keyword: '',
  limit: 20,
})

async function loadList() {
  loading.value = true
  try {
    const data = await fetchGeoPageList({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword || undefined,
      status: filters.status || undefined,
    })
    list.value = data.list || []
    total.value = data.total || 0
  } finally {
    loading.value = false
  }
}

function onSearch() {
  searched.value = true
  page.value = 1
  loadList()
}

function onPageChange(p) {
  page.value = p
  loadList()
}

function goCreate() {
  router.push({ name: 'geo-page-create' })
}

function goEdit(row) {
  const id = row.id || row.slug
  if (!id) return
  router.push({ name: 'geo-page-edit', params: { pageId: id } })
}

async function onExport() {
  exporting.value = true
  try {
    exportResult.value = await exportGeoCasePack({
      city: exportForm.city || undefined,
      serviceName: exportForm.serviceName || undefined,
      keyword: exportForm.keyword || undefined,
      limit: exportForm.limit,
    })
    ElMessage.success(`已生成 ${exportResult.value.caseCount || 0} 条案例包`)
  } catch (err) {
    ElMessage.error(err?.message || '导出失败')
  } finally {
    exporting.value = false
  }
}

async function copyMarkdown() {
  const text = exportResult.value?.markdown || ''
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.warning('复制失败，请手动全选复制')
  }
}

onMounted(loadList)
</script>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.page-title {
  margin: 0 0 4px;
}
.page-desc {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  max-width: 560px;
}
.page-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.filter-form {
  margin-bottom: 16px;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
.mb-16 {
  margin-bottom: 16px;
}
.export-result {
  margin-top: 12px;
}
</style>
