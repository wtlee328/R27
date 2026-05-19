import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { AppRouter } from './router'
import { useAuthListener } from './lib/auth'

export default function App() {
  useAuthListener()

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
