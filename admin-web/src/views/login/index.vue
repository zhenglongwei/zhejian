<template>
  <div class="login-page">
    <el-card class="login-card">
      <h1>辙见运营后台</h1>
      <p class="login-card__hint">OPS-MASK-01 · 案例审核</p>
      <el-form @submit.prevent="onSubmit">
        <el-form-item label="密码">
          <el-input v-model="password" type="password" show-password autocomplete="current-password" />
        </el-form-item>
        <el-button type="primary" native-type="submit" :loading="loading" style="width: 100%">
          登录
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { loginAdmin } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

const password = ref('')
const loading = ref(false)
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

async function onSubmit() {
  if (!password.value) {
    ElMessage.warning('请输入密码')
    return
  }
  loading.value = true
  try {
    const data = await loginAdmin(password.value)
    auth.setToken(data.token)
    router.replace(route.query.redirect || '/cases')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-light);
}
.login-card {
  width: 360px;
}
.login-card h1 {
  margin: 0 0 4px;
  font-size: 20px;
}
.login-card__hint {
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
