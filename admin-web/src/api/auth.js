import request from './request'

export function loginAdmin(password) {
  return request.post('/admin/auth/login', { password })
}
