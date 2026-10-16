import { describe, test, expect, beforeEach, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent } from 'vue'
import { runtimeConfiguration } from '@/plugins/runtimeConfiguration'
import type { RuntimeConfiguration } from '@/plugins/runtimeConfiguration'
import { httpPlugin } from '@/plugins/http'
import { useRESTAPI } from '@/composables/RESTAPI'
import { useSessionStore } from '@/stores/session'
import {
  AuthenticationError,
  CanceledRequestError,
  APIServerError
} from '@/composables/HTTPErrors'

const { fakeHttp } = vi.hoisted(() => ({
  fakeHttp: { get: vi.fn(), post: vi.fn() }
}))

vi.mock('axios', () => ({
  isAxiosError: (error: unknown) =>
    error !== null && typeof error === 'object' && (error as { __axios?: boolean }).__axios === true,
  default: { create: () => fakeHttp }
}))

const testConfiguration: RuntimeConfiguration = {
  api_server: 'http://localhost',
  authentication: true,
  authentication_method: 'ldap',
  racksdb_rows_labels: false,
  racksdb_racks_labels: false,
  version: 'test',
  colors: undefined,
  logo: undefined
}

type RESTAPI = ReturnType<typeof useRESTAPI>

function mountRESTAPI(): { restApi: RESTAPI } {
  let restApi: RESTAPI | undefined
  const Host = defineComponent({
    setup() {
      restApi = useRESTAPI()
      return () => null
    }
  })
  shallowMount(Host, {
    global: {
      plugins: [createPinia(), [runtimeConfiguration, testConfiguration], httpPlugin]
    }
  })
  return { restApi: restApi as RESTAPI }
}

function axiosResponse(status: number, description: string) {
  return { __axios: true, response: { status, data: { description } } }
}

describe('RESTAPI session attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  test('returns response data within the current session', async () => {
    fakeHttp.get.mockResolvedValueOnce({ data: { hello: 'world' } })
    const { restApi } = mountRESTAPI()
    expect(await restApi.get<{ hello: string }>('/ping')).toEqual({ hello: 'world' })
  })

  test('maps a same-session 401 to AuthenticationError', async () => {
    fakeHttp.get.mockRejectedValueOnce(axiosResponse(401, 'invalid token'))
    const { restApi } = mountRESTAPI()
    await expect(restApi.get('/clusters')).rejects.toBeInstanceOf(AuthenticationError)
  })

  test('maps a same-session 500 to APIServerError', async () => {
    fakeHttp.get.mockRejectedValueOnce(axiosResponse(500, 'boom'))
    const { restApi } = mountRESTAPI()
    await expect(restApi.get('/clusters')).rejects.toBeInstanceOf(APIServerError)
  })

  test('discards a successful response arriving after session invalidation', async () => {
    let resolveRequest: (value: unknown) => void = () => {}
    fakeHttp.get.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve
      })
    )
    const { restApi } = mountRESTAPI()
    const session = useSessionStore()
    const pending = restApi.get('/clusters')

    /* Session A ends (logout or 401) before the response arrives. */
    session.invalidateSession()
    resolveRequest({ data: [{ name: 'cluster-of-user-A' }] })

    await expect(pending).rejects.toBeInstanceOf(CanceledRequestError)
  })

  test('discards a late 401 from a previous session', async () => {
    let rejectRequest: (reason: unknown) => void = () => {}
    fakeHttp.get.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectRequest = reject
      })
    )
    const { restApi } = mountRESTAPI()
    const session = useSessionStore()
    const pending = restApi.get('/agents/foo/stats')

    /* User B logs in, then user A request finally completes with 401. */
    session.beginSession()
    rejectRequest(axiosResponse(401, 'user A token expired'))

    await expect(pending).rejects.toBeInstanceOf(CanceledRequestError)
  })

  test('silently ignores a request canceled by the session abort', async () => {
    fakeHttp.get.mockRejectedValueOnce({
      __axios: true,
      request: {},
      code: 'ERR_CANCELED',
      message: 'canceled'
    })
    const { restApi } = mountRESTAPI()
    await expect(restApi.get('/clusters')).rejects.toBeInstanceOf(CanceledRequestError)
  })
})
