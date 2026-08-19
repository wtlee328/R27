import { Toaster } from 'sonner'
import { AppRouter } from './router'
import { useAuthListener } from './lib/auth'
import { useVersionGuard } from './hooks/useVersionGuard'

export default function App() {
  useAuthListener()
  useVersionGuard()

  return (
    <>
      <AppRouter />
      <Toaster
        position="top-right"
        toastOptions={{
          classNames: {
            toast: 'font-sans',
          },
        }}
      />
    </>
  )
}
