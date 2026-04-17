import type { ReactNode } from 'react'
import { Header } from './Header'
import { Navigation, type Page } from './Navigation'

interface AppLayoutProps {
  children: ReactNode
  userName?: string
  userRole?: 'admin' | 'manager' | 'cashier'
  currentPage: Page
  onPageChange: (page: Page) => void
}

export function AppLayout({
  children,
  userName,
  userRole,
  currentPage,
  onPageChange,
}: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header
        userName={userName}
        userRole={userRole}
      />

      <Navigation
        currentPage={currentPage}
        onPageChange={onPageChange}
        userRole={userRole}
      />

      <main className="flex-1 overflow-auto pb-6">
        {children}
      </main>
    </div>
  )
}
