import { Outlet } from 'react-router-dom'
import { Navbar } from './Navbar'

export function AppLayout() {
  return (
    <div className="min-h-screen bg-stone-950">
      <Navbar />
      <main className="lg:pl-60 pt-16">
        <div className="min-h-[calc(100vh-4rem)] bg-stone-50 rounded-tl-[2.5rem] shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  )
}
