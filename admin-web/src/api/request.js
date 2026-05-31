import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const request = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
})

request.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`
  }
  config.headers['X-Client-Type'] = 'admin'
  config.headers['X-App-Version'] = '0.1.0'
  return config
})

request.interceptors.response.use(
  (res) => {
    const body = res.data
    if (body && body.code === 0) return body.data
    const message = body?.message || '请求失败'
    ElMessage.error(message)
    return Promise.reject(new Error(message))
  },
  (err) => {
    const status = err.response?.status
    if (status === 401) {
      const auth = useAuthStore()
      auth.clear()
      window.location.href = '/admin/login'
    }
    ElMessage.error(err.response?.data?.message || err.message || '网络错误')
    return Promise.reject(err)
  }
)

export default request
