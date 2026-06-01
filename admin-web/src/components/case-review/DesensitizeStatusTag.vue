<template>
  <el-tag :type="tagType" size="small">{{ label }}</el-tag>
</template>

<script setup>
import { computed } from 'vue'
import { DESENSITIZE_STATUS_TAG } from '@/constants/case-review'

const props = defineProps({
  display: { type: Object, default: () => ({}) },
})

const meta = computed(() => {
  const key = props.display?.key || 'pending'
  return DESENSITIZE_STATUS_TAG[key] || DESENSITIZE_STATUS_TAG.pending
})

const label = computed(() => props.display?.label || meta.value.label)
const tagType = computed(() => meta.value.type)
</script>
