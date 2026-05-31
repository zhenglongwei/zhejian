<template>
  <el-tag v-if="level" :type="tagType" size="small">{{ label }}</el-tag>
  <span v-else class="text-muted">—</span>
</template>

<script setup>
import { computed } from 'vue'
import { RISK_LEVEL_LABEL } from '@/constants/case-review'

const props = defineProps({
  level: { type: String, default: '' },
})

const label = computed(() => RISK_LEVEL_LABEL[props.level] || props.level || '—')

const tagType = computed(() => {
  const map = {
    low: 'success',
    medium: 'warning',
    high: 'danger',
    forbidden: 'danger',
  }
  return map[props.level] || 'info'
})
</script>

<style scoped>
.text-muted {
  color: var(--el-text-color-secondary);
}
</style>
