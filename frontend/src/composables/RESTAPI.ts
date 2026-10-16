import { useHttp } from '@/plugins/http'
import { useAuthStore } from '@/stores/auth'
import { useSessionStore } from '@/stores/session'
import { isAxiosError } from 'axios'
import type { ResponseType, AxiosResponse, AxiosRequestConfig } from 'axios'
import {
  AuthenticationError,
  PermissionError,
  APIServerError,
  CanceledRequestError,
  RequestError
} from '@/composables/HTTPErrors'

export function useRESTAPI() {
  const http = useHttp()
  const authStore = useAuthStore()
  const session = useSessionStore()
  let controller = newRegisteredController()

  function newRegisteredController(): AbortController {
    const newController = new AbortController()
    session.registerRequestController(newController)
    return newController
  }

  function abortController() {
    controller.abort()
    session.unregisterRequestController(controller)
    controller = newRegisteredController()
  }

  /*
   * Replace the local controller when it has been aborted, either locally or
   * globally by a session invalidation (in which case it was also removed from
   * the session registry).
   */
  function ensureController() {
    if (controller.signal.aborted) {
      session.unregisterRequestController(controller)
      controller = newRegisteredController()
    }
  }

  function requestConfig(
    withToken: boolean = true,
    responseType: ResponseType = 'json',
    withCredentials: boolean = false
  ): AxiosRequestConfig {
    ensureController()
    const config: AxiosRequestConfig = {
      responseType: responseType,
      signal: controller.signal
    }
    if (withToken === true) {
      config.headers = { Authorization: `Bearer ${authStore.token}` }
    }
    if (withCredentials === true) {
      config.withCredentials = true
    }
    return config
  }

  async function requestServer(func: () => Promise<AxiosResponse>): Promise<AxiosResponse> {
    /* Tag the request with the session epoch that issued it. */
    const requestSessionId = session.sessionId
    const isStale = () => requestSessionId !== session.sessionId
    try {
      const response = await func()
      /* Drop successful responses coming back after the session ended (logout,
       * 401 on another request or login of another user). */
      if (isStale()) {
        throw new CanceledRequestError('Discarded response from a previous session')
      }
      return response
    } catch (error) {
      /* A staleness check above or an abort triggered by session teardown:
       * silently ignore, never update state of the new session. */
      if (error instanceof CanceledRequestError) throw error
      if (!isAxiosError(error)) throw new RequestError(`Unknown error: ${error}`)
      if (error.response) {
        /* Server replied with error status code.
         *
         * If the reponse body is an arraybuffer instead of JSON, convert it
         * to JSON first.
         */
        if (error.response.data instanceof ArrayBuffer) {
          error.response.data = JSON.parse(
            new TextDecoder().decode(error.response.data as ArrayBuffer)
          )
        }
        if (error.response.status == 401) {
          /* A late 401 belonging to an already invalidated session must not be
           * surfaced as an authentication error: it would trigger a duplicate
           * signout and could log out the user of the new session. */
          if (isStale()) {
            throw new CanceledRequestError('Discarded 401 response from a previous session')
          }
          throw new AuthenticationError(error.response.data.description)
        } else if (error.response.status == 403) {
          throw new PermissionError(error.message)
        } else {
          throw new APIServerError(error.response.status, error.response.data.description)
        }
      } else if (error.request) {
        /* No reply from server */
        //console.log(error)
        if (error.code == 'ERR_CANCELED' || isStale()) {
          throw new CanceledRequestError('Canceled request')
        }
        throw new RequestError(`Request error: ${error.message}`)
      } else {
        /* Something else happening when setting up the request */
        throw new RequestError(`Setting up request error: ${error.message}`)
      }
    }
  }

  async function get<CType>(
    resource: string,
    withToken: boolean = true,
    responseType: ResponseType = 'json',
    withCredentials: boolean = false
  ): Promise<CType> {
    console.log(`Slurm-web gateway API get ${resource}`)
    return (
      await requestServer(() => {
        return http.get(resource, requestConfig(withToken, responseType, withCredentials))
      })
    ).data as CType
  }

  async function post<CType>(
    resource: string,
    data: unknown,
    withToken: boolean = true,
    responseType: ResponseType = 'json'
  ): Promise<CType> {
    console.log(`Slurm-web gateway API post ${resource}`)
    return (
      await requestServer(() => {
        return http.post(resource, data, requestConfig(withToken, responseType))
      })
    ).data as CType
  }

  async function postRaw<CType>(
    resource: string,
    data: unknown,
    withToken: boolean = true,
    responseType: ResponseType = 'json'
  ): Promise<CType> {
    console.log(`Slurm-web gateway API post ${resource}`)
    return (await requestServer(() => {
      return http.post(resource, data, requestConfig(withToken, responseType))
    })) as CType
  }
  return {
    abortController,
    get,
    post,
    postRaw
  }
}
