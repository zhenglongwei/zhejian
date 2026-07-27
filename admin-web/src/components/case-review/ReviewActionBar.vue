<template>
  <div class="review-bar">
    <el-select
      v-if="showReasonType"
      v-model="reasonType"
      placeholder="原因类型"
      clearable
      style="width: 200px"
    >
      <el-option
        v-for="r in rejectReasons"
        :key="r"
        :label="GATE_B_REJECT_LABEL[r] || r"
        :value="r"
      />
    </el-select>
    <el-input
      v-model="comment"
      :placeholder="commentPlaceholder"
      style="flex: 1; min-width: 200px"
    />
    <el-button type="success" :loading="loading" :disabled="!canReview" @click="$emit('approve')">
      {{ approveLabel }}
    </el-button>
    <el-button
      v-if="showRequestModify"
      type="warning"
      :loading="loading"
      :disabled="!canReview"
      @click="$emit('request-modify')"
    >
      要求修改
    </el-button>
    <el-button type="danger" :loading="loading" :disabled="!canReview" @click="$emit('reject')">
      驳回
    </el-button>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { REJECT_REASONS as DEFAULT_REJECT_REASONS, GATE_B_REJECT_LABEL } from '@/constants/case-review'

const props = defineProps({
  loading: { type: Boolean, default: false },
  canReview: { type: Boolean, default: true },
  approveLabel: { type: String, default: '通过' },
  reasonOptions: { type: Array, default: null },
  showRequestModify: { type: Boolean, default: false },
  showReasonType: { type: Boolean, default: true },
  commentPlaceholder: { type: String, default: '审核意见（驳回时建议填写）' },
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
