<!--
  Copyright (c) 2023-2024 Rackslab

  This file is part of Slurm-web.

  SPDX-License-Identifier: MIT
-->

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import type { Ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useRuntimeStore } from '@/stores/runtime'
import { useAuthStore } from '@/stores/auth'
import { useRuntimeConfiguration } from '@/plugins/runtimeConfiguration'
import { AuthenticationError, CanceledRequestError } from '@/composables/HTTPErrors'
import { useErrorsHandler } from '@/composables/ErrorsHandler'
import ClusterListItem from '@/components/clusters/ClustersListItem.vue'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import InfoAlert from '@/components/InfoAlert.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import { ArrowRightStartOnRectangleIcon } from '@heroicons/vue/24/outline'
import { useGatewayAPI } from '@/composables/GatewayAPI'
import { type ClusterDescription } from '@/composables/gateway/types/cluster'

const runtimeStore = useRuntimeStore()
const authStore = useAuthStore()
const runtimeConfiguration = useRuntimeConfiguration()
const gateway = useGatewayAPI()
const { reportAuthenticationError, reportServerError } = useErrorsHandler()
const clusters: Ref<Array<ClusterDescription>> = ref([])
const loaded: Ref<boolean> = ref(false)
const unable: Ref<boolean> = ref(false)
const router = useRouter()
const awaitingAutoRedirect = ref<boolean>(false)
const awaitingClusterName = ref<string | null>(null)
/* Check if there is at least one cluster with error. This is useful when there
 * is only one cluster with permissions but this cluster is not available. In
 * this case, we want to display the list of clusters with the error to the
 * user. */
const clusterWithError = computed(() => {
  return clusters.value.find((cluster) => cluster.error)
})

/*
 * After login the router may bounce a saved cluster URL back here because the
 * current session snapshot was still empty. Once the current session cluster
 * list has been successfully published, resume that URL when its cluster is
 * available and allowed in this session. Anything else is dropped rather than
 * served from a previous user's permissions.
 */
function consumePostLoginRoute(allowedClusterNames: Array<string>): boolean {
  if (authStore.returnUrl === null) return false
  const target = authStore.returnUrl
  const resolved = router.resolve(target)
  const targetCluster = resolved.params.cluster as string | undefined
  if (targetCluster !== undefined && !allowedClusterNames.includes(targetCluster)) {
    /* Target cluster is unknown or denied in the current session. */
    authStore.returnUrl = null
    return false
  }
  router.push(authStore.takePostLoginRoute())
  return true
}

async function getClustersDescriptions() {
  try {
    const descriptions = await gateway.clusters()
    /* Consider this cluster does not have error at this stage. It could be
     * set to true if stats retrieval fail later on.
     */
    descriptions.forEach((element) => {
      element.error = false
    })
    /* Atomically publish clusters and permissions of the current session.
     * The previous (possibly empty) state is replaced only on success: a load
     * failure keeps the no-permission state and stays retryable instead of
     * falling back to another user's snapshot. */
    runtimeStore.setAvailableClusters(descriptions)
    clusters.value = descriptions
    loaded.value = true

    /* Get list of clusters with permissions. If there is only one, set some
     * refs to make handleClusterPing() redirect automatically to the
     * dashboard of this cluster. */
    const clustersWithPermissions = descriptions.filter(
      (cluster) => cluster.permissions.actions.length > 0
    )
    const allowedClusterNames = clustersWithPermissions.map((cluster) => cluster.name)
    if (consumePostLoginRoute(allowedClusterNames)) {
      return
    }
    if (clustersWithPermissions.length === 1) {
      awaitingAutoRedirect.value = true
      awaitingClusterName.value = clustersWithPermissions[0].name
    }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      reportAuthenticationError(error)
    } else if (error instanceof CanceledRequestError) {
      /* Response from an expired session or an aborted request: discard it
       * without touching state, error notifications or the route. */
    } else if (error instanceof Error) {
      reportServerError(error)
      unable.value = true
    }
  }
}

/* Handle cluster ping response. If there is only one cluster with permissions,
 * redirect to the dashboard of this cluster if the ping response is successful. */
function handleClusterPing(cluster: ClusterDescription) {
  /* If we are not awaiting auto redirect or the cluster name is not the one
   * we are awaiting, return. */
  if (!awaitingAutoRedirect.value || awaitingClusterName.value !== cluster.name) {
    return
  }

  /* If the cluster has an error, set loaded to true to remove the loading spinner
   * and skip the redirect. */
  if (cluster.error) {
    loaded.value = true
    return
  }

  /* Redirect to the dashboard of the cluster. */
  router.push({ name: 'dashboard', params: { cluster: cluster.name } })
}

onMounted(() => {
  getClustersDescriptions()
})
</script>

<template>
  <main>
    <RouterLink
      v-if="runtimeConfiguration.authentication"
      :to="{ name: 'signout' }"
      custom
      v-slot="{ navigate }"
    >
      <button
        @click="navigate"
        role="link"
        class="absolute right-0 m-2 flex p-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 hover:dark:text-gray-200"
      >
        Signout
        <ArrowRightStartOnRectangleIcon class="h-6 w-6" />
      </button>
    </RouterLink>
    <section
      class="bg-slurmweb-light flex h-screen items-center justify-center gap-y-6 dark:bg-gray-900"
    >
      <div v-if="unable" class="w-full lg:w-[60%]">
        <ErrorAlert :show-errors-link="false">
          <strong>Unable to load cluster list</strong>
          <br />
          Try to refresh…
        </ErrorAlert>
      </div>
      <div
        v-else-if="!loaded"
        class="flex h-24 w-full animate-pulse items-center justify-center rounded-xl bg-slate-200 text-sm text-gray-600 lg:w-[60%] dark:text-gray-400"
      >
        <LoadingSpinner :size="5" />
        Loading clusters…
      </div>
      <div v-else-if="!clusters.length" class="w-full lg:w-[60%]">
        <InfoAlert>
          <strong>Empty cluster list</strong>
          <br />
          Try to refresh…
        </InfoAlert>
      </div>
      <div
        v-else
        v-show="!awaitingAutoRedirect || clusterWithError"
        class="flex w-full flex-col lg:w-[80%] xl:w-[60%]"
      >
        <h1 class="flex px-4 text-left text-lg font-medium text-gray-700 dark:text-gray-400">
          Select a cluster
        </h1>
        <ul
          role="list"
          class="divide-y divide-gray-100 overflow-hidden bg-white shadow-xs ring-1 ring-gray-100 lg:rounded-xl dark:divide-gray-700 dark:bg-gray-800 dark:ring-gray-700"
        >
          <ClusterListItem
            v-for="cluster in clusters"
            :key="cluster.name"
            :cluster-name="cluster.name"
            @pinged="handleClusterPing"
          />
        </ul>
      </div>
    </section>
  </main>
</template>
