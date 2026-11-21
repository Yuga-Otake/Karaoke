// Home-screen web apps on iPhone keep serving the page they first loaded.
// Check /version.json (never cached) on launch and whenever the app comes back
// to the foreground; if a newer build is deployed, reload onto it.

const CHECK_INTERVAL_MS = 60_000
let lastCheck = 0

async function check() {
  if (import.meta.env.DEV) return
  const now = Date.now()
  if (now - lastCheck < CHECK_INTERVAL_MS) return
  lastCheck = now
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${now}`, { cache: 'no-store' })
    if (!res.ok) return
    const { build } = await res.json()
    if (build && build !== __BUILD_ID__) {
      // Guard against a reload loop if the CDN still serves the old page
      try {
        if (sessionStorage.getItem('reloadedFor') === build) return
        sessionStorage.setItem('reloadedFor', build)
      } catch { /* ignore */ }
      // A fresh query string bypasses the cached index.html
      const url = new URL(window.location.href)
      url.searchParams.set('v', build)
      window.location.replace(url.toString())
    }
  } catch { /* offline: keep the current version */ }
}

export function startAutoUpdate() {
  check()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  window.addEventListener('pageshow', () => check())
  window.addEventListener('focus', () => check())
}

export const BUILD_ID = __BUILD_ID__
