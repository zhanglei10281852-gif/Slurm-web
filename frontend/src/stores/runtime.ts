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
import type { RouteLocation } from 'vue-router'
import type { ClusterDescription } from '@/composables/gateway/types/cluster'
import { useSessionStore, CLUSTERS_SESSION_ID_KEY } from '@/stores/session'
import { useDashboardRuntimeStore } from './runtime/dashboard'
import { useJobsRuntimeStore } from './runtime/jobs'
import { useResourcesRuntimeStore } from './runtime/resources'

/*
 * Shared settings
 */

type NotificationType = 'INFO' | 'ERROR'

export class Notification {
  id: number
  type: NotificationType
  message: string
  timeout: number
  constructor(type: NotificationType, message: string, timeout: number) {
    this.id = Date.now()
    this.type = type
    this.message = message
    this.timeout = timeout
  }
}

class RuntimeError {
  timestamp: Date
  route: string
  message: string
  constructor(route: string, message: string) {
    this.timestamp = new Date()
    this.route = route
    this.message = message
  }
}

export interface RuntimeStore {
  reportError: CallableFunction
}

/*
 * Restore the persisted cluster permission snapshot only when it is owned by
 * the current authentication session. Any unattributed or foreign snapshot
 * (previous user on a shared browser, legacy localStorage data) is migrated to
 * a safe empty state.
 */
function restoreAvailableClusters(currentSessionId: string): Array<ClusterDescription> {
  const owner = localStorage.getItem(CLUSTERS_SESSION_ID_KEY)
  const raw = localStorage.getItem('availableClusters')
  if (owner === null || raw === null || owner !== currentSessionId) {
    localStorage.removeItem(CLUSTERS_SESSION_ID_KEY)
    localStorage.removeItem('availableClusters')
    return []
  }
  try {
    return JSON.parse(raw) as ClusterDescription[]
  } catch {
    localStorage.removeItem(CLUSTERS_SESSION_ID_KEY)
    localStorage.removeItem('availableClusters')
    return []
  }
}

export const useRuntimeStore = defineStore('runtime', () => {
  const session = useSessionStore()
  const routePath: Ref<string> = ref('/')
  const beforeSettingsRoute: Ref<RouteLocation | undefined> = ref(undefined)

  const dashboard = useDashboardRuntimeStore()
  const jobs = useJobsRuntimeStore()
  const resources = useResourcesRuntimeStore()

  const errors: Ref<Array<RuntimeError>> = ref([])
  const notifications: Ref<Array<Notification>> = ref([])

  const availableClusters: Ref<Array<ClusterDescription>> = ref(
    restoreAvailableClusters(session.sessionId)
  )
  const currentCluster: Ref<ClusterDescription | undefined> = ref(undefined)

  function persistAvailableClusters() {
    localStorage.setItem(CLUSTERS_SESSION_ID_KEY, session.sessionId)
    localStorage.setItem('availableClusters', JSON.stringify(availableClusters.value))
  }

  /*
   * Atomically publish the cluster list and its permissions for the current
   * session. Callers must only invoke this after a successful cluster list
   * response from the current session, so a failed load keeps the previous
   * safe empty state instead of falling back to another user's data.
   */
  function setAvailableClusters(clusters: Array<ClusterDescription>) {
    availableClusters.value = clusters
    persistAvailableClusters()
  }

  function addCluster(cluster: ClusterDescription) {
    availableClusters.value.push(cluster)
    persistAvailableClusters()
  }

  /*
   * Remove every cluster and permission of the invalidated session and detach
   * the current cluster so route permission checks and the menu cannot be
   * driven by a stale snapshot.
   */
  function clearAvailableClusters() {
    availableClusters.value = []
    currentCluster.value = undefined
    localStorage.removeItem(CLUSTERS_SESSION_ID_KEY)
    localStorage.removeItem('availableClusters')
  }

  function getCluster(name: string): ClusterDescription {
    return availableClusters.value.filter((cluster) => cluster.name === name)[0]
  }

  function getAllowedClusters() {
    return availableClusters.value.filter((cluster) => cluster.permissions.actions.length > 0)
  }

  function checkClusterAvailable(name: string): boolean {
    return availableClusters.value.filter((cluster) => cluster.name === name).length > 0
  }

  function hasPermission(permission: string): boolean {
    return (
      currentCluster.value === undefined ||
      currentCluster.value.permissions.actions.includes(permission)
    )
  }

  function hasAnyPermission(permissions: string[]): boolean {
    return permissions.some((permission) => hasPermission(permission))
  }

  function hasClusterPermission(clusterName: string, permission: string): boolean {
    const cluster = getCluster(clusterName)
    if (!cluster) return false
    return cluster.permissions.actions.includes(permission)
  }

  function addNotification(notification: Notification) {
    notifications.value.push(notification)
    setTimeout(removeNotification, notification.timeout * 1000, notification)
  }

  function removeNotification(searched: Notification) {
    console.log(`notification ${searched.id} is removed`)
    notifications.value = notifications.value.filter(
      (notification) => notification.id != searched.id
    )
  }

  function reportError(message: string) {
    errors.value.push(new RuntimeError(routePath.value, message))
    // Do not store more than 100 errors
    if (errors.value.length > 100) {
      errors.value = errors.value.slice(errors.value.length - 100)
    }
    addNotification(new Notification('ERROR', message, 5))
  }
  function reportInfo(message: string) {
    addNotification(new Notification('INFO', message, 5))
  }
  return {
    routePath,
    beforeSettingsRoute,
    dashboard,
    jobs,
    resources,
    errors,
    notifications,
    availableClusters,
    currentCluster,
    setAvailableClusters,
    addCluster,
    clearAvailableClusters,
    getCluster,
    getAllowedClusters,
    checkClusterAvailable,
    hasPermission,
    hasAnyPermission,
    hasClusterPermission,
    addNotification,
    removeNotification,
    reportError,
    reportInfo
  }
})
