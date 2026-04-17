import { useState } from 'react'
import type { ReactNode } from 'react'
import { Sidebar, type Page } from './Sidebar'
import { Menu } from 'lucide-react'

interface DashboardLayoutProps {
  children: ReactNode
  userName?: string
  userRole?: 'admin' | 'manager' | 'cashier'
  currentPage: Page
  onPageChange: (page: Page) => void
  pageTitle?: string
  pageDescription?: string
}

export function DashboardLayout({
  children,
  userName,
  userRole,
  currentPage,
  onPageChange,
  pageTitle,
  pageDescription,
}: DashboardLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Titres par défaut selon la page
  const defaultTitles: Record<Page, { title: string; description: string }> = {
    dashboard: { title: 'Tableau de bord', description: 'Vue d\'ensemble de votre activité' },
    sales: { title: 'Caisse', description: 'Enregistrez vos ventes' },
    stock: { title: 'Gestion du Stock', description: 'Suivez et gérez votre inventaire' },
    reports: { title: 'Rapports', description: 'Analysez vos performances' },
    safe: { title: 'Gestion du Coffre', description: 'Gérez les fonds et versements' },
    admin: { title: 'Administration', description: 'Gérez les utilisateurs et les paramètres' },
  }

  const title = pageTitle || defaultTitles[currentPage].title
  const description = pageDescription || defaultTitles[currentPage].description

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <Sidebar
        currentPage={currentPage}
        onPageChange={onPageChange}
        userRole={userRole}
        userName={userName}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-14 sm:h-16 bg-white border-b border-gray-100 px-4 sm:px-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Bouton menu hamburger - mobile only */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden w-10 h-10 flex items-center justify-center -ml-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{title}</h1>
              <p className="text-xs sm:text-sm text-gray-500 truncate hidden sm:block">{description}</p>
            </div>
          </div>

          {/* Date */}
          <div className="text-right hidden md:block flex-shrink-0">
            <p className="text-sm font-medium text-gray-900">
              {new Date().toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </p>
            <p className="text-xs text-gray-500">
              {new Date().toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-gray-50/50">
          {children}
        </main>
      </div>
    </div>
  )
}

export type { Page }
