import { SignOutButton } from '@clerk/clerk-react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Vault,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useState, useEffect } from 'react'

export type Page = 'dashboard' | 'sales' | 'stock' | 'reports' | 'admin' | 'safe' | 'clients'

interface SidebarProps {
  currentPage: Page
  onPageChange: (page: Page) => void
  userRole?: 'admin' | 'manager' | 'cashier' | 'pending'
  userName?: string
  /** Mobile: contrôle l'ouverture du drawer */
  mobileOpen?: boolean
  /** Mobile: callback pour fermer le drawer */
  onMobileClose?: () => void
}

const roleLabels: Record<string, string> = {
  admin: 'Administrateur',
  manager: 'Manager',
  cashier: 'Caissier',
  pending: 'En attente',
}

export function Sidebar({
  currentPage,
  onPageChange,
  userRole = 'cashier',
  userName,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  // Fermer le menu mobile quand on change de page
  const handlePageChange = (page: Page) => {
    onPageChange(page)
    onMobileClose?.()
  }

  // Empêcher le scroll du body quand le menu mobile est ouvert
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  // Récupérer le nombre d'utilisateurs en attente (admin seulement)
  const pendingUsersCount = useQuery(api.users.getPendingUsersCount) ?? 0
  const pendingExpensesCount = useQuery(api.expenses.getPendingExpensesCount) ?? 0
  const pendingCount = pendingUsersCount + pendingExpensesCount

  // Récupérer les demandes en attente pour le coffre
  const pendingFundRequests = useQuery(api.safe.getPendingFundRequests)
  const pendingDeposits = useQuery(api.safe.getPendingDeposits)
  const safePendingCount = (pendingFundRequests?.length ?? 0) + (pendingDeposits?.length ?? 0)

  const canAccessStock = userRole === 'admin' || userRole === 'manager'
  // Rapports : tous les rôles actifs (le contenu s'adapte, cashier = ses ventes)
  const canAccessReports = userRole === 'admin' || userRole === 'manager' || userRole === 'cashier'
  const canAccessAdmin = userRole === 'admin'
  const canAccessSafe = userRole === 'admin' || userRole === 'manager'
  // Répertoire clients : accessible à tous (cashier en lecture, manager+ en édition)
  const canAccessClients = userRole === 'admin' || userRole === 'manager' || userRole === 'cashier'

  const navItems = [
    {
      id: 'dashboard' as Page,
      label: 'Tableau de bord',
      icon: LayoutDashboard,
      visible: true,
    },
    {
      id: 'sales' as Page,
      label: 'Caisse',
      icon: ShoppingCart,
      visible: true,
    },
    {
      id: 'clients' as Page,
      label: 'Clients',
      icon: Users,
      visible: canAccessClients,
    },
    {
      id: 'stock' as Page,
      label: 'Stock',
      icon: Package,
      visible: canAccessStock,
    },
    {
      id: 'reports' as Page,
      label: 'Rapports',
      icon: BarChart3,
      visible: canAccessReports,
    },
    {
      id: 'safe' as Page,
      label: 'Coffre',
      icon: Vault,
      visible: canAccessSafe,
      badge: safePendingCount > 0 ? safePendingCount : undefined,
    },
    {
      id: 'admin' as Page,
      label: 'Admin',
      icon: Settings,
      visible: canAccessAdmin,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
  ]

  return (
    <>
      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={cn(
          'bg-white border-r border-gray-100 flex flex-col transition-all duration-300 ease-in-out z-50',
          // Desktop: relative, toujours visible
          'hidden lg:flex lg:relative lg:h-screen',
          collapsed ? 'lg:w-16' : 'lg:w-64',
          // Mobile: fixed, drawer depuis la gauche
          mobileOpen && 'fixed inset-y-0 left-0 flex w-64 h-full'
        )}
      >
        {/* Bouton fermer mobile */}
        <button
          onClick={onMobileClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 lg:hidden"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Logo */}
        <div className={cn(
          "flex items-center border-b border-gray-100",
          collapsed ? "lg:h-16 lg:justify-center lg:px-2" : "h-20 px-4",
          // Mobile: toujours expanded
          "h-20 px-4"
        )}>
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <img
              src="/logo-locagri.png"
              alt="Locagri"
              className="h-12 w-auto object-contain"
            />
          </div>
        ) : (
          <img
            src="/logo-locagri.png"
            alt="Locagri"
            className="h-8 w-8 object-contain"
          />
        )}
      </div>

      {/* Toggle button - desktop only */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-white border border-gray-200 rounded-full hidden lg:flex items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors z-10 shadow-sm"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {navItems
          .filter((item) => item.visible)
          .map((item) => {
            const Icon = item.icon
            const isActive = currentPage === item.id

            return (
              <button
                key={item.id}
                onClick={() => handlePageChange(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 relative',
                  isActive
                    ? 'bg-[#016124] text-white shadow-sm font-semibold'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                )}
              >
                <Icon className={cn('w-5 h-5 flex-shrink-0', isActive ? 'text-white' : 'text-gray-400')} />
                {/* Mobile: toujours afficher le label, Desktop: selon collapsed */}
                <span className={cn(
                  'font-medium text-sm',
                  collapsed ? 'lg:hidden' : ''
                )}>{item.label}</span>
                {/* Badge de notification */}
                {'badge' in item && item.badge && (
                  <span className={cn(
                    'absolute flex items-center justify-center text-[10px] font-bold text-white bg-[#CF761C] rounded-full min-w-[18px] h-[18px] px-1',
                    collapsed ? 'lg:top-0 lg:right-0 right-3' : 'right-3'
                  )}>
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-gray-100">
        <div className={cn(
          'flex items-center gap-3 mb-3',
          collapsed && 'lg:justify-center'
        )}>
          <div className="w-9 h-9 bg-[#016124]/10 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-medium text-[#016124]">
              {userName?.charAt(0)?.toUpperCase() || 'U'}
            </span>
          </div>
          {/* Mobile: toujours afficher, Desktop: selon collapsed */}
          <div className={cn(
            'min-w-0 flex-1',
            collapsed && 'lg:hidden'
          )}>
            <p className="text-sm font-medium text-gray-900 truncate">{userName || 'Utilisateur'}</p>
            <p className="text-xs text-gray-400">{roleLabels[userRole || 'cashier']}</p>
          </div>
        </div>

        <SignOutButton>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'w-full text-gray-500 hover:text-gray-700 hover:bg-gray-50',
              collapsed ? 'lg:px-2' : 'justify-start'
            )}
          >
            <LogOut className="w-4 h-4" />
            <span className={cn('ml-2', collapsed && 'lg:hidden')}>Déconnexion</span>
          </Button>
        </SignOutButton>
      </div>
      </aside>
    </>
  )
}
