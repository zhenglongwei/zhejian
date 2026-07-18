<template>
  <el-tabs :model-value="active" class="merchant-hub-nav" @tab-change="onChange">
    <el-tab-pane label="入驻审核" name="onboarding" />
    <el-tab-pane label="能力变更" name="capability" />
    <el-tab-pane label="资质到期" name="expiry" />
  </el-tabs>
</template>

<script setup>
import { useRouter } from 'vue-router'

defineProps({
  active: {
    type: String,
    required: true,
  },
})

const router = useRouter()

function onChange(name) {
  if (name === 'onboarding') {
    router.push({ name: 'merchant-list' })
    return
  }
  if (name === 'capability') {
    router.push({ name: 'store-capability-list' })
    return
  }
  if (name === 'expiry') {
    router.push({ name: 'store-expiry-list' })
  }
}
</script>

<style scoped>
.merchant-hub-nav {
  margin-bottom: 8px;
}
</style>
