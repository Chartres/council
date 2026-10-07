import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom does not expose a usable localStorage on an opaque origin, so provide a
// deterministic in-memory one (same shim as the other kviz-stack repos).
if (typeof globalThis.localStorage === 'undefined' || globalThis.localStorage === null) {
  class MemoryStorage implements Storage {
    private store = new Map<string, string>()
    get length() {
      return this.store.size
    }
    clear() {
      this.store.clear()
    }
    getItem(key: string) {
      return this.store.has(key) ? this.store.get(key)! : null
    }
    key(index: number) {
      return Array.from(this.store.keys())[index] ?? null
    }
    removeItem(key: string) {
      this.store.delete(key)
    }
    setItem(key: string, value: string) {
      this.store.set(key, String(value))
    }
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
  })
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})
