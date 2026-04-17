import { SignOutButton } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'

interface HeaderProps {
  userName?: string
  userRole?: string
}

const roleLabels: Record<string, string> = {
  admin: 'Administrateur',
  manager: 'Manager',
  cashier: 'Caissier',
}

export function Header({ userName, userRole }: HeaderProps) {
  return (
    <header className="bg-primary text-white px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-2 sm:gap-3">
        <h1 className="text-lg sm:text-xl font-bold tracking-tight">PDV Locagri</h1>
        <span className="text-primary-light text-xs sm:text-sm hidden sm:inline">
          Riz 4.5 Kg
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {userName && (
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium">{userName}</p>
            {userRole && (
              <p className="text-xs text-primary-light">
                {roleLabels[userRole] || userRole}
              </p>
            )}
          </div>
        )}
        <SignOutButton>
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:text-white hover:bg-white/20 text-xs sm:text-sm h-8 px-2 sm:px-3"
          >
            <span className="hidden sm:inline">Déconnexion</span>
            <span className="sm:hidden">Sortie</span>
          </Button>
        </SignOutButton>
      </div>
    </header>
  )
}
