/*
 * Copyright (c) 2026 Rackslab
 *
 * This file is part of Slurm-web.
 *
 * SPDX-License-Identifier: MIT
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRuntimeStore } from '@/stores/runtime'

/*
 * localStorage key holding the identifier of the authentication session that
 * owns both the persisted credentials (token/username/...) and the persisted
 * cluster permission snapshot. A page refresh may restore these data only when
 * this identifier is present and matches the data it seals.
 */
export const SESSION_ID_KEY = 'sessionId'
export const CLUSTERS_SESSION_ID_KEY = 'clustersSessionId'

/**
 * A poller stopper registered by useClusterDataPoller so the session manager
 * can synchronously stop every polling loop before navigating away.
 */
type PollerStopper = () => void

function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function readOrCreateSessionId(): string {
  const stored = localStorage.getItem(SESSION_ID_KEY)
  if (stored) return stored
  const created = generateSessionId()
  localStorage.setItem(SESSION_ID_KEY, created)
  return created
}

/**
 * The session store owns the authentication session epoch and every resource
 * that must be torn down atomically when a session ends:
 *
 * - sessionId uniquely identifies the current epoch. Every gateway request is
 *   tagged with it and a response whose tag does not match the current epoch is
 *   discarded, so late responses from a previous user can never update state,
 *   notifications, menus or the route.
 * - request controllers: all AbortController instances used by RESTAPI are
 *   registered here, allowing cancellation of every in-flight gateway request
 *   on logout or 401.
 * - poller stoppers: all running cluster data pollers are registered here, so
 *   their timers are cleared when the session is invalidated.
 */
export const useSessionStore = defineStore('session', () => {
  const sessionId: Ref<string> = ref(readOrCreateSessionId())

  /*
   * True while the current session epoch is live. beginSession() re-arms it,
   * invalidateSession() flips it to false. This makes invalidation idempotent:
   * concurrent or repeated 401 responses of the same epoch trigger the signout
   * flow exactly once.
   */
  let live = true

  const requestControllers = new Set<AbortController>()
  const pollerStoppers = new Set<PollerStopper>()

  function registerRequestController(controller: AbortController) {
    requestControllers.add(controller)
  }

  function unregisterRequestController(controller: AbortController) {
    requestControllers.delete(controller)
  }

  function registerPoller(stop: PollerStopper): () => void {
    pollerStoppers.add(stop)
    return () => {
      pollerStoppers.delete(stop)
    }
  }

  function abortAllRequests() {
    requestControllers.forEach((controller) => controller.abort())
    requestControllers.clear()
  }

  function stopAllPollers() {
    pollerStoppers.forEach((stop) => stop())
  }

  /**
   * Open a new authenticated session epoch, after a successful login
   * (LDAP, OIDC or anonymous). In-flight requests and polling loops started in
   * the pre-login epoch are canceled: their eventual responses carry the old
   * session id and are discarded.
   */
  function beginSession() {
    live = true
    stopAllPollers()
    abortAllRequests()
    sessionId.value = generateSessionId()
    localStorage.setItem(SESSION_ID_KEY, sessionId.value)
  }

  /**
   * Synchronously invalidate the current session epoch:
   *
   * 1. stop all polling loops,
   * 2. abort every in-flight gateway request,
   * 3. switch to a fresh session id,
   * 4. clear credentials,
   * 5. clear the persisted cluster permission snapshot and current cluster.
   *
   * Returns true on the first invalidation of an epoch and false afterwards,
   * so callers (401 handlers) run their navigation exactly once.
   */
  function invalidateSession(): boolean {
    if (!live) return false
    live = false
    stopAllPollers()
    abortAllRequests()
    sessionId.value = generateSessionId()
    localStorage.setItem(SESSION_ID_KEY, sessionId.value)
    useAuthStore().logout()
    useRuntimeStore().clearAvailableClusters()
    return true
  }

  return {
    sessionId,
    registerRequestController,
    unregisterRequestController,
    registerPoller,
    beginSession,
    invalidateSession
  }
})
