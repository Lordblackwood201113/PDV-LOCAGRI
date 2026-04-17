import { Button } from '@/components/ui/button'

export type Page = 'sales' | 'stock' | 'reports' | 'admin'

interface NavigationProps {
  currentPage: Page
  onPageChange: (page: Page) => void
  userRole?: 'admin' | 'manager' | 'cashier'
}

export function Navigation({ currentPage, onPageChange, userRole = 'cashier' }: NavigationProps) {
  const canAccessStock = userRole === 'admin' || userRole === 'manager'
  const canAccessReports = userRole === 'admin' || userRole === 'manager'
  const canAccessAdmin = userRole === 'admin'

  // Caissier n'a pas de navigation (accès caisse uniquement)
  if (userRole === 'cashier') {
    return null
  }

  return (
    <nav className="bg-white border-b border-border px-2 sm:px-4 py-1.5 sm:py-2 flex gap-1.5 sm:gap-2 overflow-x-auto">
      <NavButton
        active={currentPage === 'sales'}
        onClick={() => onPageChange('sales')}
      >
        Caisse
      </NavButton>

      {canAccessStock && (
        <NavButton
          active={currentPage === 'stock'}
          onClick={() => onPageChange('stock')}
        >
          Stock
        </NavButton>
      )}

      {canAccessReports && (
        <NavButton
          active={currentPage === 'reports'}
          onClick={() => onPageChange('reports')}
        >
          Rapports
        </NavButton>
      )}

      {canAccessAdmin && (
        <NavButton
          active={currentPage === 'admin'}
          onClick={() => onPageChange('admin')}
        >
          Admin
        </NavButton>
      )}
    </nav>
  )
}

interface NavButtonProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function NavButton({ active, onClick, children }: NavButtonProps) {
  return (
    <Button
      variant={active ? 'default' : 'ghost'}
      size="sm"
      onClick={onClick}
      className={`text-xs sm:text-sm h-7 sm:h-8 px-2 sm:px-3 ${active ? 'bg-primary text-white' : 'text-gray-600 hover:text-primary'}`}
    >
      {children}
    </Button>
  )
}
