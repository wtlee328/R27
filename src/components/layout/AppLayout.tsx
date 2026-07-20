import { Outlet, useLocation } from 'react-router-dom'
import { Navbar } from './Navbar'
import { motion, AnimatePresence } from 'framer-motion'

export function AppLayout() {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-white dark:bg-[#1e2832]">
      <Navbar />
      <main className="lg:pl-60 pt-16">
        <div className="min-h-[calc(100vh-4rem)] bg-white dark:bg-[#1e2832]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  )
}
