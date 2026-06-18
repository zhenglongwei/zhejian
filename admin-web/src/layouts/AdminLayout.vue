<template>
  <el-container class="admin-layout">
    <el-aside width="200px" class="admin-layout__aside">
      <div class="admin-layout__brand">辙见运营</div>
      <el-menu :default-active="activeMenu" router>
        <el-menu-item index="/cases">案例审核</el-menu-item>
        <el-menu-item index="/geo-pages">GEO 专题</el-menu-item>
        <el-menu-item index="/geo/crawler-stats">GEO 爬虫</el-menu-item>
        <el-menu-item index="/geo/probe-report">GEO 探测</el-menu-item>
        <el-menu-item index="/merchants">商家审核</el-menu-item>
        <el-menu-item index="/services">服务监管</el-menu-item>
        <el-menu-item index="/reports">举报管理</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="admin-layout__header">
        <span>平台运营后台</span>
        <el-button link type="danger" @click="onLogout">退出</el-button>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const activeMenu = computed(() => {
  if (route.path.startsWith('/cases')) return '/cases'
  if (route.path.startsWith('/geo-pages')) return '/geo-pages'
  if (route.path.startsWith('/geo/crawler-stats')) return '/geo/crawler-stats'
  if (route.path.startsWith('/geo/probe-report')) return '/geo/probe-report'
  if (route.path.startsWith('/merchants')) return '/merchants'
  if (route.path.startsWith('/services')) return '/services'
  if (route.path.startsWith('/reports')) return '/reports'
  return route.path
})

function onLogout() {
  auth.clear()
  router.push({ name: 'login' })
}
</script>

<style scoped>
.admin-layout {
  min-height: 100vh;
}
.admin-layout__aside {
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-light);
}
.admin-layout__brand {
  padding: 20px 16px;
  font-weight: 700;
  font-size: 16px;
}
.admin-layout__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--el-border-color-light);
}
</style>
