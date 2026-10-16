import { describe, test, beforeEach, afterEach, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSessionStore, SESSION_ID_KEY, CLUSTERS_SESSION_ID_KEY } from '@/stores/session'
import { useRuntimeStore } from '@/stores/runtime'

describe('Runtime cluster snapshot ownership', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  function seedSnapshot(ownerSessionId: string | null) {
    localStorage.setItem(
      'availableClusters',
      JSON.stringify([
        {
          name: 'foo',
          infrastructure: 'foo',
          racksdb: true,
          metrics: true,
          cache: true,
          permissions: { roles: ['admin'], actions: ['stats-view'] }
        }
      ])
    )
    if (ownerSessionId !== null) {
      localStorage.setItem(CLUSTERS_SESSION_ID_KEY, ownerSessionId)
    }
  }

  test('restores the snapshot when it belongs to the current session', () => {
    localStorage.setItem(SESSION_ID_KEY, 'same-session')
    seedSnapshot('same-session')
    setActivePinia(createPinia())

    const runtime = useRuntimeStore()
    expect(runtime.availableClusters.length).toBe(1)
    expect(runtime.getCluster('foo')).toBeTruthy()
  })

  test('drops the snapshot owned by another session id (another user)', () => {
    localStorage.setItem(SESSION_ID_KEY, 'user-B-session')
    seedSnapshot('user-A-session')
    setActivePinia(createPinia())

    const runtime = useRuntimeStore()
    expect(runtime.availableClusters).toStrictEqual([])
    /* Old data is migrated to a safe empty state. */
    expect(localStorage.getItem('availableClusters')).toBe(null)
    expect(localStorage.getItem(CLUSTERS_SESSION_ID_KEY)).toBe(null)
  })

  test('drops unattributed legacy snapshot data', () => {
    localStorage.setItem(SESSION_ID_KEY, 'current-session')
    seedSnapshot(null)
    setActivePinia(createPinia())

    const runtime = useRuntimeStore()
    expect(runtime.availableClusters).toStrictEqual([])
    expect(localStorage.getItem('availableClusters')).toBe(null)
  })

  test('published snapshot is sealed with the current session id', () => {
    localStorage.setItem(SESSION_ID_KEY, 'current-session')
    setActivePinia(createPinia())
    const session = useSessionStore()
    const runtime = useRuntimeStore()

    runtime.setAvailableClusters([
      {
        name: 'bar',
        infrastructure: 'bar',
        racksdb: false,
        metrics: false,
        cache: false,
        slurmdbd: { jobs_max_hours: 0 },
        permissions: { roles: [], actions: [] }
      }
    ])

    expect(JSON.parse(localStorage.getItem('availableClusters') || '[]')[0].name).toBe('bar')
    expect(localStorage.getItem(CLUSTERS_SESSION_ID_KEY)).toBe(session.sessionId)
  })

  test('a session switch invalidates a previously persisted snapshot on reload', () => {
    /* User A session persisted both id and snapshot. */
    localStorage.setItem(SESSION_ID_KEY, 'A-session')
    seedSnapshot('A-session')
    setActivePinia(createPinia())
    const sessionA = useSessionStore()
    expect(useRuntimeStore().availableClusters.length).toBe(1)

    /* User A logs in again / user B signs in: new epoch and snapshot cleared. */
    sessionA.beginSession()
    useRuntimeStore().setAvailableClusters([])
    expect(localStorage.getItem(CLUSTERS_SESSION_ID_KEY)).not.toBe('A-session')

    /* Simulate a refresh: stores are recreated from the new localStorage. */
    setActivePinia(createPinia())
    expect(useRuntimeStore().availableClusters).toStrictEqual([])
  })
})
