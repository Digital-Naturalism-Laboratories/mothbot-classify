import '@testing-library/jest-dom/vitest'

// Polyfill ResizeObserver for cmdk / radix components in jsdom
class ResizeObserver {
  callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserver
