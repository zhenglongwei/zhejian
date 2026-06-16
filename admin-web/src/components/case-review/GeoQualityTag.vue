<template>
  <el-tag v-if="level" :type="tagType" size="small" class="geo-quality-tag">
    {{ label }}
  </el-tag>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  level: { type: String, default: '' },
  summaryText: { type: String, default: '' },
})

const tagType = computed(() => {
  if (props.level === 'block') return 'danger'
  if (props.level === 'weak') return 'warning'
  if (props.level === 'ready') return 'success'
  return 'info'
})

const label = computed(() => {
  if (props.summaryText) return props.summaryText
  if (props.level === 'block') return '证据缺失'
  if (props.level === 'weak') return '可优化'
  if (props.level === 'ready') return '证据齐全'
  return '未评估'
})
</script>
