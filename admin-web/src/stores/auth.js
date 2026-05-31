import { defineStore } from 'pinia'
import { ref } from 'vue'

const TOKEN_KEY = 'zhejian_admin_token'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || '')

  function setToken(value) {
    token.value = value || ''
    if (token.value) localStorage.setItem(TOKEN_KEY, token.value)
    else localStorage.removeItem(TOKEN_KEY)
  }

  function clear() {
    setToken('')
  }

  return { token, setToken, clear }
})
