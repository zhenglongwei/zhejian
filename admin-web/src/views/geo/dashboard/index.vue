<template>
  <div v-loading="loading">
    <div class="page-head">
      <div>
        <h2 class="page-title">GEO 数据看板</h2>
        <p class="page-desc">总览网站被爬虫发现与抽样探测中的提及情况。爬虫访问 ≠ 被大模型引用次数。</p>
      </div>
      <el-select v-model="days" style="width: 120px" @change="loadAll">
        <el-option :value="7" label="近 7 天" />
        <el-option :value="14" label="近 14 天" />
        <el-option :value="30" label="近 30 天" />
      </el-select>
    </div>

    <el-alert
      class="mb-16"
      type="info"
      :closable="false"
      title="「爬虫访问」表示搜索/AI 机器人抓取了页面；「探测引用」表示我们主动向大模型提问时，答案里是否出现辙见链接。二者分开看。"
      show-icon
    />

    <el-row :gutter="16" class="mb-16">
      <el-col :span="6">
        <el-card shadow="never">
          <el-statistic title="爬虫总访问" :value="crawler.totalHits || 0" />
          <el-link class="mt-8" type="primary" :underline="false" @click="go('geo-crawler-stats')">
            明细 →
          </el-link>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <el-statistic title="独立 URL" :value="crawler.uniqueUrlCount || 0" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <el-statistic
            title="探测引用率"
            :value="formatRate(probe.metrics?.prompt_probe_citation_rate)"
            suffix="%"
          />
          <el-link class="mt-8" type="primary" :underline="false" @click="go('geo-probe-report')">
            验效果 →
          </el-link>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <el-statistic
            title="探测 Mention 率"
            :value="formatRate(probe.metrics?.prompt_probe_mention_rate)"
            suffix="%"
          />
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="mb-16">
      <el-col :span="6">
        <el-card shadow="never">
          <el-statistic title="已发布专题" :value="health.published_count || 0" />
          <el-link class="mt-8" type="primary" :underline="false" @click="go('geo-page-list')">
            专题工作台 →
          </el-link>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <el-statistic
            title="信息增量率"
            :value="formatRate(probe.metrics?.information_gain_rate)"
            suffix="%"
          />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <el-statistic title="高 Gap 项" :value="gaps.highGapCount || gaps.list?.length || 0" />
          <el-link class="mt-8" type="primary" :underline="false" @click="go('geo-citation-gaps')">
            下钻 →
          </el-link>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <el-statistic
            title="可收录专题"
            :value="health.indexable_count || 0"
          />
          <el-link class="mt-8" type="primary" :underline="false" @click="go('geo-topic-health')">
            健康度 →
          </el-link>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="12">
        <el-card shadow="never" header="爬虫 · 按页面类型">
          <el-table :data="crawler.pageTypeDistribution || []" size="small" border>
            <el-table-column prop="pageType" label="类型" />
            <el-table-column prop="hitCount" label="次数" width="100" />
          </el-table>
          <el-empty v-if="!(crawler.pageTypeDistribution || []).length" description="暂无数据" :image-size="64" />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never" header="爬虫 · Top URL">
          <el-table :data="(crawler.topUrls || []).slice(0, 8)" size="small" border>
            <el-table-column prop="url" label="URL" min-width="240" show-overflow-tooltip />
            <el-table-column prop="hitCount" label="次数" width="80" />
          </el-table>
          <el-empty v-if="!(crawler.topUrls || []).length" description="暂无数据" :image-size="64" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  fetchCrawlerStats,
  fetchProbeReport,
  fetchCitationGaps,
  fetchTopicHealth,
} from '@/api/geo-obs'

const router = useRouter()
const loading = ref(false)
const days = ref(7)
const crawler = ref({})
const probe = ref({})
const gaps = ref({})
const health = ref({})

function formatRate(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1000) / 10
}

function go(name) {
  router.push({ name })
}

async function loadAll() {
  loading.value = true
  try {
    const [crawlerData, probeData, gapsData, healthData] = await Promise.all([
      fetchCrawlerStats({ days: days.value, limit: 20 }),
      fetchProbeReport({ days: days.value }),
      fetchCitationGaps({ limit: 50 }).catch(() => ({})),
      fetchTopicHealth({}).catch(() => ({})),
    ])
    crawler.value = crawlerData || {}
    probe.value = probeData || {}
    gaps.value = gapsData || {}
    if (Array.isArray(gapsData?.list)) {
      gaps.value.highGapCount = gapsData.list.filter((item) => Number(item.gapScore || item.score || 0) > 0).length
    }
    health.value = healthData?.metrics || healthData?.topicHealth || healthData || {}
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)
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
}
.mb-16 {
  margin-bottom: 16px;
}
.mt-8 {
  margin-top: 8px;
  display: inline-block;
}
</style>
