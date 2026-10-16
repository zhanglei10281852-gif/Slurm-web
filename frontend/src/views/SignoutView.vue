<!--
  Copyright (c) 2023-2024 Rackslab

  This file is part of Slurm-web.

  SPDX-License-Identifier: MIT
-->

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthSession } from '@/composables/AuthSession'
import { useRuntimeStore } from '@/stores/runtime'
import { useRuntimeConfiguration } from '@/plugins/runtimeConfiguration'

const { terminate } = useAuthSession()
const runtimeStore = useRuntimeStore()
const router = useRouter()
const runtimeConfiguration = useRuntimeConfiguration()

onMounted(() => {
  /* Invalidate the session atomically before entering the login flow: stop
   * pollers, abort in-flight requests and clear credentials together with the
   * persisted cluster permission snapshot. Safe to call repeatedly. */
  terminate()
  runtimeStore.reportInfo('You have been signed out')

  if (runtimeConfiguration.authentication) {
    router.push({ name: 'login' })
  } else {
    router.push({ name: 'anonymous' })
  }
})
</script>

<template>
  <main>Bye!</main>
</template>
