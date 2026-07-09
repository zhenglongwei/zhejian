<template>
  <div class="gate-nav">
    <el-radio-group :model-value="activeGate" @change="onGateChange">
      <el-radio-button label="compliance">相册完工合规（A）</el-radio-button>
      <el-radio-button label="public">案例公示审核（B）</el-radio-button>
    </el-radio-group>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const activeGate = computed(() =>
  route.path.includes('/cases/compliance') ? 'compliance' : 'public'
)

function onGateChange(gate) {
  if (gate === 'compliance') {
    router.push({ name: 'album-compliance-list' })
  } else {
    router.push({ name: 'case-list' })
  }
}
</script>

<style scoped>
.gate-nav {
  margin-bottom: 16px;
}
</style>
