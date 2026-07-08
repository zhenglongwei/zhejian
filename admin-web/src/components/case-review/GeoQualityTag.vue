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
  /** 用户授权案例：仅作参考，不表示应拦截通过 */
  informational: { type: Boolean, default: false },
})

const tagType = computed(() => {
  if (props.informational && (props.level === 'block' || props.level === 'weak')) {
    return 'info'
  }
  if (props.level === 'block') return 'danger'
  if (props.level === 'weak') return 'warning'
  if (props.level === 'ready') return 'success'
  return 'info'
})

const label = computed(() => {
  if (props.informational && (props.level === 'block' || props.level === 'weak')) {
    if (props.summaryText) return `${props.summaryText}（仅供参考）`
    return '证据偏弱（仅供参考）'
  }
  if (props.summaryText) return props.summaryText
  if (props.level === 'block') return '证据缺失'
  if (props.level === 'weak') return '可优化'
  if (props.level === 'ready') return '证据齐全'
  return '未评估'
})
</script>
