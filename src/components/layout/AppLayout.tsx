import { Outlet, useLocation } from 'react-router-dom'
import { Navbar } from './Navbar'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useAutoBackupScheduler } from '@/hooks/useAutoBackupScheduler'
import { AIAssistantDrawer } from '@/components/ai/AIAssistantDrawer'
import { useAIAssistantStore } from '@/stores/aiAssistantStore'

export function AppLayout() {
  const location = useLocation()
  useAutoBackupScheduler()
  const { toggleOpen: toggleAIOpen } = useAIAssistantStore()

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="lg:pl-60 pt-16">
        <div className="min-h-[calc(100vh-4rem)] bg-white">
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

      {/* Floating Action Button for Accounting AI Assistant */}
      <button
        onClick={toggleAIOpen}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-full bg-stone-900 hover:bg-stone-800 dark:bg-orange-500 dark:hover:bg-orange-600 text-white shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer group border border-stone-800 dark:border-orange-400"
        title="會計 AI 助理 (gpt-5.6-luna)"
      >
        <Sparkles className="w-4 h-4 text-orange-400 dark:text-white group-hover:rotate-12 transition-transform animate-pulse" />
        <span className="text-xs font-bold tracking-wide">會計 AI 助理</span>
      </button>

      {/* Slide-out Accounting AI Drawer */}
      <AIAssistantDrawer />
    </div>
  )
}

