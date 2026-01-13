import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setMeta } from './utils/meta'
import { registerSW } from 'virtual:pwa-register'
// Initialize detection save scheduler early to ensure it's available when needed
import '~/features/data-flow/3.persist/files.writer'

// Register service worker for PWA offline support
registerSW({ immediate: true })

const rootElement = document.getElementById('root')!
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
})

setMeta({
  title: 'Mothbot Classify',
  siteName: 'Mothbot Classify',
  description: 'Local app to review and label Mothbot insect detections per night.',
  image: '/mothbot.svg',
  url: '/',
})

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
