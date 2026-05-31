<template>
  <el-timeline v-if="logs.length">
    <el-timeline-item
      v-for="log in logs"
      :key="log.id"
      :timestamp="log.createdAt"
      placement="top"
    >
      <p><strong>{{ actionLabel(log.reviewAction) }}</strong> · {{ log.reviewerId }}</p>
      <p v-if="log.reviewComment" class="log-comment">{{ log.reviewComment }}</p>
      <p class="log-meta">{{ log.beforeStatus }} → {{ log.afterStatus }}</p>
    </el-timeline-item>
  </el-timeline>
  <el-empty v-else description="暂无审核记录" :image-size="64" />
</template>

<script setup>
defineProps({
  logs: { type: Array, default: () => [] },
})

function actionLabel(action) {
  const map = {
    approve: '通过并公开',
    reject: '驳回',
    request_modify: '要求修改',
  }
  return map[action] || action
}
</script>

<style scoped>
.log-comment {
  margin: 4px 0;
  color: var(--el-text-color-regular);
}
.log-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
