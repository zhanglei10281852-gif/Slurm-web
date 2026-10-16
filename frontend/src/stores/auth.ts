/*
 * Copyright (c) 2023-2024 Rackslab
 *
 * This file is part of Slurm-web.
 *
 * SPDX-License-Identifier: MIT
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { SESSION_ID_KEY } from '@/stores/session'

const CREDENTIAL_KEYS = ['token', 'username', 'fullname', 'groups']

function clearStoredCredentials() {
  CREDENTIAL_KEYS.forEach((key) => localStorage.removeItem(key))
}

/*
 * Credentials may be restored only when they are sealed by a persisted session
 * identifier. Legacy localStorage data (no session id) cannot be attributed to
 * the current identity: migrate it to a safe empty state instead.
 */
function restoreCredential(key: string): string | null {
  if (localStorage.getItem(SESSION_ID_KEY) === null) return null
  return localStorage.getItem(key)
}

export const useAuthStore = defineStore('auth', () => {
  if (localStorage.getItem(SESSION_ID_KEY) === null) {
    clearStoredCredentials()
  }

  const token: Ref<string | null> = ref(restoreCredential('token'))
  const username: Ref<string | null> = ref(restoreCredential('username'))
  const fullname: Ref<string | null> = ref(restoreCredential('fullname'))
  const groups: Ref<Array<string> | null> = ref(
    JSON.parse(restoreCredential('groups') || '[]') as string[]
  )
  const returnUrl: Ref<string | null> = ref(null)

  function setSession(_token: string, _username: string, _fullname: string, _groups: string[]) {
    token.value = _token
    username.value = _username
    fullname.value = _fullname
    groups.value = _groups

    localStorage.setItem('token', _token)
    localStorage.setItem('username', _username)
    localStorage.setItem('fullname', _fullname)
    localStorage.setItem('groups', JSON.stringify(_groups))
  }

  function takePostLoginRoute(): string | RouteLocationRaw {
    const redirectUrl = returnUrl.value || { name: 'clusters' }
    returnUrl.value = null
    return redirectUrl
  }

  function logout() {
    token.value = null
    username.value = null
    fullname.value = null
    groups.value = null
    clearStoredCredentials()
  }

  return { token, username, fullname, groups, returnUrl, setSession, takePostLoginRoute, logout }
})
