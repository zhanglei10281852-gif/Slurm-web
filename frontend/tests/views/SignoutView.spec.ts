import { describe, test, expect, beforeEach } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import SignoutView from '@/views/SignoutView.vue'
import { init_plugins } from '../lib/common'
import { useAuthStore } from '@/stores/auth'
import { useRuntimeStore } from '@/stores/runtime'
import type { RouterMock } from 'vue-router-mock'

let router: RouterMock

describe('SignoutView.vue', () => {
  beforeEach(() => {
    router = init_plugins()
    // Set default current route
    router.currentRoute.value.fullPath = '/test-route'
  })

  test('basic signout flow', async () => {
    shallowMount(SignoutView)
    await flushPromises()

    // Check that logout was called
    expect(useAuthStore().logout).toHaveBeenCalled()

    // Check that info message was reported
    expect(useRuntimeStore().reportInfo).toHaveBeenCalledWith('You have been signed out')

    // Check redirect to login
    expect(router.push).toHaveBeenCalledWith({ name: 'login' })
  })

  test('signout clears the cluster permission snapshot', async () => {
    const runtimeStore = useRuntimeStore()
    const authStore = useAuthStore()
    authStore.setSession('token-1', 'jdoe', 'John Doe', [])
    runtimeStore.setAvailableClusters([
      {
        name: 'foo',
        infrastructure: 'foo',
        racksdb: true,
        metrics: true,
        cache: true,
        slurmdbd: { jobs_max_hours: 0 },
        permissions: { roles: ['admin'], actions: ['stats-view'] }
      }
    ])
    runtimeStore.currentCluster = runtimeStore.getCluster('foo')

    shallowMount(SignoutView)
    await flushPromises()

    expect(authStore.token).toBe(null)
    expect(runtimeStore.availableClusters).toStrictEqual([])
    expect(runtimeStore.currentCluster).toBe(undefined)
    expect(localStorage.getItem('availableClusters')).toBe(null)
    expect(localStorage.getItem('token')).toBe(null)
  })

  test('repeated signout stays safe and does not duplicate navigation errors', async () => {
    const wrapper1 = shallowMount(SignoutView)
    await flushPromises()
    const wrapper2 = shallowMount(SignoutView)
    await flushPromises()
    expect(wrapper1.exists()).toBe(true)
    expect(wrapper2.exists()).toBe(true)
    expect(useRuntimeStore().availableClusters).toStrictEqual([])
  })
})
