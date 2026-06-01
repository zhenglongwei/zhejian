<template>
  <div class="review-bar">
    <el-select v-model="reasonType" placeholder="原因类型" clearable style="width: 200px">
      <el-option v-for="r in rejectReasons" :key="r" :label="r" :value="r" />
    </el-select>
    <el-input
      v-model="comment"
      placeholder="审核意见（驳回/要求修改时建议填写）"
      style="flex: 1; min-width: 200px"
    />
    <el-button type="success" :loading="loading" :disabled="!canReview" @click="$emit('approve')">
      {{ approveLabel }}
    </el-button>
    <el-button type="warning" :loading="loading" :disabled="!canReview" @click="$emit('request-modify')">
      要求修改
    </el-button>
    <el-button type="danger" :loading="loading" :disabled="!canReview" @click="$emit('reject')">
      驳回
    </el-button>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { REJECT_REASONS as DEFAULT_REJECT_REASONS } from '@/constants/case-review'

const props = defineProps({
  loading: { type: Boolean, default: false },
  canReview: { type: Boolean, default: true },
  approveLabel: { type: String, default: '通过并公开' },
  reasonOptions: { type: Array, default: null },
})

defineEmits(['approve', 'reject', 'request-modify'])

const reasonType = ref('')
const comment = ref('')

const rejectReasons = computed(() => props.reasonOptions || DEFAULT_REJECT_REASONS)

defineExpose({
  getPayload() {
    return { reasonType: reasonType.value, comment: comment.value }
  },
  reset() {
    reasonType.value = ''
    comment.value = ''
  },
})
</script>

<style scoped>
.review-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
</style>
