/*
 * Copyright (c) 2026 Rackslab
 *
 * This file is part of Slurm-web.
 *
 * SPDX-License-Identifier: MIT
 */

import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSessionStore } from '@/stores/session'

export function useAuthSession() {
  const authStore = useAuthStore()
  const sessionStore = useSessionStore()
  const router = useRouter()

  /*
   * Open a new session epoch before publishing credentials: every request or
   * polling loop started before the login belongs to the previous epoch and is
   * canceled/discarded. Then continue to the post-login route (returnUrl or
   * clusters list).
   */
  async function login(token: string, username: string, fullname: string, groups: string[]) {
    sessionStore.beginSession()
    authStore.setSession(token, username, fullname, groups)
    return router.push(authStore.takePostLoginRoute())
  }

  async function anonymousLogin(token: string) {
    return login(token, 'anonymous', 'anonymous', [])
  }

  /*
   * Tear down the current session (stop pollers, abort in-flight requests,
   * clear credentials and the cluster permission snapshot). Returns false when
   * the session was already invalidated, so callers can stay idempotent.
   */
  function terminate(): boolean {
    return sessionStore.invalidateSession()
  }

  return { login, anonymousLogin, terminate }
}
