/**
 * CASE-DRAFT-LOCK · 确认案例稿同构展示（运营审核 / 与 H5、小程序预览同源）
 */
<template>
  <el-card shadow="never" class="confirmed-draft">
    <template #header>
      <div class="confirmed-draft__head">
        <span>公示案例稿（只读 · 与车主/H5 同源）</span>
        <el-tag v-if="draft" size="small" type="success">已定稿</el-tag>
        <el-tag v-else size="small" type="warning">无确认稿</el-tag>
      </div>
    </template>

    <el-empty
      v-if="!draft"
      description="门店尚未确认案例稿；闸门 B 审核应核对此稿。请退回商家完成「案例预览 · 确认完工」。"
      :image-size="56"
    />

    <div v-else class="confirmed-draft__body">
      <p class="confirmed-draft__hint">
        正文为商家确认稿；配图仅为脱敏图。请按此结构与车主授权预览、公网案例页对照审核。
      </p>
      <h2 class="confirmed-draft__title">{{ draft.title || '（无标题）' }}</h2>
      <section
        v-for="sec in draft.sections"
        :key="sec.key"
        class="confirmed-draft__section"
      >
        <h3 class="confirmed-draft__sec-title">{{ sec.title }}</h3>
        <p v-if="sec.body" class="confirmed-draft__sec-body">{{ sec.body }}</p>
        <p v-else class="confirmed-draft__sec-empty">（本节无正文）</p>
        <div v-if="sec.media?.length" class="confirmed-draft__media">
          <div
            v-for="(m, idx) in sec.media"
            :key="`${m.nodeId}_${m.idx}_${idx}`"
            class="confirmed-draft__media-item"
          >
            <el-image
              :src="m.maskedUrl"
              fit="cover"
              :preview-src-list="sectionPreviewList(sec)"
              :initial-index="idx"
              preview-teleported
              class="confirmed-draft__thumb"
            />
            <span v-if="m.caption" class="confirmed-draft__caption">{{ m.caption }}</span>
          </div>
        </div>
      </section>
    </div>
  </el-card>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  draft: {
    type: Object,
    default: null,
  },
})

const draft = computed(() => props.draft || null)

function sectionPreviewList(sec) {
  return (sec.media || []).map((m) => m.maskedUrl).filter(Boolean)
}
</script>

<style scoped>
.confirmed-draft__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.confirmed-draft__hint {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.confirmed-draft__title {
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
}

.confirmed-draft__section {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.confirmed-draft__section:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.confirmed-draft__sec-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
}

.confirmed-draft__sec-body {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.65;
  color: var(--el-text-color-regular);
}

.confirmed-draft__sec-empty {
  margin: 0;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}

.confirmed-draft__media {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

.confirmed-draft__media-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 160px;
}

.confirmed-draft__thumb {
  width: 160px;
  height: 160px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.confirmed-draft__caption {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}
</style>
