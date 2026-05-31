<template>
  <el-tag size="small" effect="plain">{{ label }}</el-tag>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  source: { type: String, default: '' },
  sourceLabel: { type: String, default: '' },
})

const label = computed(() => props.sourceLabel || props.source || '—')
</script>
