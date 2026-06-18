<template>
  <div v-loading="loading">
    <div class="page-head">
      <h2 class="page-title">GEO 爬虫访问</h2>
      <el-select v-model="days" style="width: 120px" @change="loadData">
        <el-option :value="7" label="近 7 天" />
        <el-option :value="14" label="近 14 天" />
        <el-option :value="30" label="近 30 天" />
      </el-select>
    </div>

    <el-alert
      v-if="disclaimer"
      class="mb-16"
      type="info"
      :closable="false"
      :title="disclaimer"
      show-icon
    />

    <el-row :gutter="16" class="mb-16">
      <el-col :span="8">
        <el-statistic title="总访问次数" :value="stats.totalHits || 0" />
      </el-col>
      <el-col :span="8">
        <el-statistic title="独立 URL 数" :value="stats.uniqueUrlCount || 0" />
      </el-col>
      <el-col :span="8">
        <el-statistic title="Bot 类型数" :value="stats.botDistribution?.length || 0" />
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="12">
        <el-card shadow="never" header="Bot 分布">
          <el-table :data="stats.botDistribution || []" size="small" border>
            <el-table-column prop="botType" label="Bot" />
            <el-table-column prop="hitCount" label="次数" width="100" />
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never" header="页面类型">
          <el-table :data="stats.pageTypeDistribution || []" size="small" border>
            <el-table-column prop="pageType" label="类型" />
            <el-table-column prop="hitCount" label="次数" width="100" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" header="Top URL" class="mt-16">
      <el-table :data="stats.topUrls || []" border stripe>
        <el-table-column prop="url" label="URL" min-width="320" show-overflow-tooltip />
        <el-table-column prop="hitCount" label="次数" width="100" />
      </el-table>
    </el-card>

    <el-card shadow="never" header="日趋势" class="mt-16">
      <el-table :data="stats.dailyTrend || []" border size="small">
        <el-table-column prop="date" label="日期" width="140" />
        <el-table-column prop="hitCount" label="次数" width="100" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { fetchCrawlerStats } from '@/api/geo-obs'

const loading = ref(false)
const days = ref(7)
const stats = ref({})
const disclaimer = ref('')

async function loadData() {
  loading.value = true
  try {
    const data = await fetchCrawlerStats({ days: days.value, limit: 20 })
    stats.value = data
    disclaimer.value = data.disclaimer || ''
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.page-title {
  margin: 0;
  font-size: 20px;
}
.mb-16 {
  margin-bottom: 16px;
}
.mt-16 {
  margin-top: 16px;
}
</style>
