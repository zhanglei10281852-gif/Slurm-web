import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSessionStore, SESSION_ID_KEY, CLUSTERS_SESSION_ID_KEY } from '@/stores/session'
import { useAuthStore } from '@/stores/auth'
import { useRuntimeStore } from '@/stores/runtime'

describe('Session Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  test('creates and persists a session id when none is stored', () => {
    const session = useSessionStore()
    expect(session.sessionId).toBeTruthy()
    expect(localStorage.getItem(SESSION_ID_KEY)).toBe(session.sessionId)
  })

  test('restores the persisted session id on refresh', () => {
    localStorage.setItem(SESSION_ID_KEY, 'persisted-id')
    const session = useSessionStore()
    expect(session.sessionId).toBe('persisted-id')
  })

  test('beginSession starts a new epoch and aborts registered requests', () => {
    const session = useSessionStore()
    const previousId = session.sessionId
    const controller = new AbortController()
    session.registerRequestController(controller)

    session.beginSession()

    expect(session.sessionId).not.toBe(previousId)
    expect(localStorage.getItem(SESSION_ID_KEY)).toBe(session.sessionId)
    expect(controller.signal.aborted).toBe(true)
  })

  test('invalidateSession stops pollers and aborts requests', () => {
    const session = useSessionStore()
    const controller = new AbortController()
    session.registerRequestController(controller)
    const stop = vi.fn()
    session.registerPoller(stop)

    const result = session.invalidateSession()

    expect(result).toBe(true)
    expect(stop).toHaveBeenCalledTimes(1)
    expect(controller.signal.aborted).toBe(true)
  })

  test('invalidateSession is idempotent', () => {
    const session = useSessionStore()
    const stop = vi.fn()
    session.registerPoller(stop)

    expect(session.invalidateSession()).toBe(true)
    expect(session.invalidateSession()).toBe(false)
    /* The poller stopper must be invoked only once despite repeated
     * invalidations (consecutive 401 responses). */
    expect(stop).toHaveBeenCalledTimes(1)
  })

  test('invalidateSession clears credentials and the cluster snapshot', () => {
    const session = useSessionStore()
    const auth = useAuthStore()
    const runtime = useRuntimeStore()
    auth.setSession('token', 'jdoe', 'John Doe', [])
    runtime.setAvailableClusters([
      {
        name: 'foo',
        infrastructure: 'foo',
        racksdb: false,
        metrics: false,
        cache: false,
        slurmdbd: { jobs_max_hours: 0 },
        permissions: { roles: [], actions: ['stats-view'] }
      }
    ])
    runtime.currentCluster = runtime.getCluster('foo')
    const previousId = session.sessionId

    session.invalidateSession()

    expect(auth.token).toBe(null)
    expect(auth.username).toBe(null)
    expect(localStorage.getItem('token')).toBe(null)
    expect(runtime.availableClusters).toStrictEqual([])
    expect(runtime.currentCluster).toBe(undefined)
    expect(localStorage.getItem('availableClusters')).toBe(null)
    expect(localStorage.getItem(CLUSTERS_SESSION_ID_KEY)).toBe(null)
    expect(session.sessionId).not.toBe(previousId)
  })

  test('invalidateSession followed by beginSession re-arms a live session', () => {
    const session = useSessionStore()
    session.invalidateSession()
    session.beginSession()
    expect(session.invalidateSession()).toBe(true)
  })

  test('unregistered poller is not stopped on invalidation', () => {
    const session = useSessionStore()
    const stop = vi.fn()
    const unregister = session.registerPoller(stop)
    unregister()
    session.invalidateSession()
    expect(stop).not.toHaveBeenCalled()
  })
})
