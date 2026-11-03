<template>
  <div v-loading="loading">
    <el-page-header content="套餐目录价" />
    <el-alert
      class="notice"
      type="info"
      :closable="false"
      show-icon
      title="改的是四档目录价（元/月）。相册生成均为不限；案例额度本期不在此改。门店特价在商家详情里设。"
    />
    <el-card shadow="never" class="section">
      <el-table :data="plans" border size="small">
        <el-table-column prop="name" label="版本" width="120" />
        <el-table-column prop="albumLabel" label="相册生成" width="120" />
        <el-table-column prop="caseQuotaLabel" label="AI分析、公开托管" width="180" />
        <el-table-column label="目录价（元/月）">
          <template #default="{ row }">
            <el-input-number v-model="row.priceYuan" :min="0" :precision="0" :controls="false" />
          </template>
        </el-table-column>
      </el-table>
      <div class="actions">
        <el-button type="primary" :loading="saving" @click="onSave">保存目录价</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchCatalogPricing, updateCatalogPricing } from '@/api/merchant-review'

const loading = ref(false)
const saving = ref(false)
const plans = ref([])

async function load() {
  loading.value = true
  try {
    const data = await fetchCatalogPricing()
    plans.value = (data.plans || []).map((row) => ({ ...row }))
  } finally {
    loading.value = false
  }
}

async function onSave() {
  saving.value = true
  try {
    const yuan = {}
    plans.value.forEach((row) => {
      yuan[row.planCode] = row.priceYuan
    })
    const data = await updateCatalogPricing({ yuan })
    plans.value = (data.plans || []).map((row) => ({ ...row }))
    ElMessage.success('目录价已保存')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.notice {
  margin-top: 12px;
}
.section {
  margin-top: 16px;
}
.actions {
  margin-top: 16px;
}
</style>
