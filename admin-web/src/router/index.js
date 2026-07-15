import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login/index.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/AdminLayout.vue'),
    children: [
      { path: '', redirect: '/geo' },
      {
        path: 'geo',
        name: 'geo-dashboard',
        component: () => import('@/views/geo/dashboard/index.vue'),
      },
      {
        path: 'cases',
        name: 'case-list',
        component: () => import('@/views/case-review/list/index.vue'),
      },
      {
        path: 'cases/compliance',
        name: 'album-compliance-list',
        component: () => import('@/views/album-compliance/list/index.vue'),
      },
      {
        path: 'cases/compliance/:albumId',
        name: 'album-compliance-detail',
        component: () => import('@/views/album-compliance/detail/index.vue'),
      },
      {
        path: 'cases/:caseId',
        name: 'case-detail',
        component: () => import('@/views/case-review/detail/index.vue'),
      },
      {
        path: 'merchants',
        name: 'merchant-list',
        component: () => import('@/views/merchant-review/list/index.vue'),
      },
      {
        path: 'merchants/:merchantId',
        name: 'merchant-detail',
        component: () => import('@/views/merchant-review/detail/index.vue'),
      },
      {
        path: 'services',
        name: 'service-list',
        component: () => import('@/views/service-review/list/index.vue'),
      },
      {
        path: 'services/:planId',
        name: 'service-detail',
        component: () => import('@/views/service-review/detail/index.vue'),
      },
      {
        path: 'geo-pages',
        name: 'geo-page-list',
        component: () => import('@/views/geo-pages/list/index.vue'),
      },
      {
        path: 'geo-pages/new',
        name: 'geo-page-create',
        component: () => import('@/views/geo-pages/edit/index.vue'),
      },
      {
        path: 'geo-pages/:pageId',
        name: 'geo-page-edit',
        component: () => import('@/views/geo-pages/edit/index.vue'),
      },
      {
        path: 'geo/crawler-stats',
        name: 'geo-crawler-stats',
        component: () => import('@/views/geo/crawler-stats/index.vue'),
      },
      {
        path: 'geo/probe-report',
        name: 'geo-probe-report',
        component: () => import('@/views/geo/probe-report/index.vue'),
      },
      {
        path: 'geo/citation-gaps',
        name: 'geo-citation-gaps',
        component: () => import('@/views/geo/citation-gaps/index.vue'),
      },
      {
        path: 'geo/topic-health',
        name: 'geo-topic-health',
        component: () => import('@/views/geo/topic-health/index.vue'),
      },
      {
        path: 'reports',
        name: 'report-list',
        component: () => import('@/views/report-review/list/index.vue'),
      },
      {
        path: 'reports/:reportId',
        name: 'report-detail',
        component: () => import('@/views/report-review/detail/index.vue'),
      },
      {
        path: 'authorization-logs',
        name: 'authorization-log-list',
        component: () => import('@/views/authorization-logs/list/index.vue'),
      },
      {
        path: 'authorization-logs/:logId',
        name: 'authorization-log-detail',
        component: () => import('@/views/authorization-logs/detail/index.vue'),
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory('/admin/'),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.token) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.token) {
    return { name: 'geo-dashboard' }
  }
  return true
})

export default router
