import { useEffect, useState } from 'react'
import { SignInButton, SignOutButton, useUser } from '@clerk/clerk-react'
import { Authenticated, Unauthenticated, AuthLoading, useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import { DashboardLayout, type Page } from '@/components/layout'
import { DashboardPage, SalesPage, StockPage, ReportsPage, AdminPage, SafePage } from '@/pages'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, UserCheck } from 'lucide-react'

function App() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>

      <Unauthenticated>
        <LoginScreen />
      </Unauthenticated>

      <Authenticated>
        <AuthenticatedApp />
      </Authenticated>

      <Toaster position="top-center" richColors />
    </>
  )
}

// ============================================
// Écran de chargement
// ============================================

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <div className="w-10 h-10 sm:w-12 sm:h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3 sm:mb-4" />
        <p className="text-muted-foreground text-sm sm:text-base">Chargement...</p>
      </div>
    </div>
  )
}

// ============================================
// Écran de connexion
// ============================================

function LoginScreen() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-5xl flex flex-col lg:flex-row rounded-2xl sm:rounded-3xl shadow-xl sm:shadow-2xl overflow-hidden bg-white border border-gray-100">
        {/* Panneau gauche - Branding (plus compact) */}
        <div className="hidden lg:flex lg:w-2/5 bg-gradient-to-br from-[#016124] to-[#017a2e] relative p-10">
          {/* Motif décoratif subtil */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-10 right-10 w-32 h-32 bg-white rounded-full blur-2xl" />
            <div className="absolute bottom-10 left-10 w-40 h-40 bg-white rounded-full blur-2xl" />
          </div>

          {/* Contenu */}
          <div className="relative z-10 flex flex-col justify-center w-full text-white">
            <div className="mb-6">
              <img
                src="/logo-locagri.png"
                alt="Locagri"
                className="h-16 w-auto filter brightness-0 invert"
              />
            </div>
            <h1 className="text-2xl font-bold mb-3">
              Point de Vente
            </h1>
            <p className="text-sm text-white/80 leading-relaxed">
              Gérez vos ventes, votre stock et suivez vos performances en temps réel
            </p>

            {/* Features compactes */}
            <div className="mt-8 space-y-3">
              <div className="flex items-center gap-3 text-white/90 text-sm">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span>Ventes rapides</span>
              </div>
              <div className="flex items-center gap-3 text-white/90 text-sm">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <span>Rapports détaillés</span>
              </div>
              <div className="flex items-center gap-3 text-white/90 text-sm">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <span>Gestion du coffre</span>
              </div>
            </div>
          </div>
        </div>

        {/* Panneau droit - Formulaire (plus large) */}
        <div className="w-full lg:w-3/5 flex items-center justify-center p-6 sm:p-8 lg:p-12">
          <div className="w-full max-w-sm">
            {/* Logo */}
            <div className="text-center mb-6 sm:mb-8">
              <img
                src="/logo-locagri.png"
                alt="Locagri"
                className="h-10 sm:h-14 w-auto mx-auto mb-4 sm:mb-6"
              />
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                Bienvenue
              </h2>
              <p className="text-gray-500 mt-2 text-xs sm:text-sm">
                Connectez-vous pour accéder à votre espace
              </p>
            </div>

            {/* Bouton de connexion */}
            <SignInButton mode="modal">
              <Button className="w-full h-10 sm:h-12 text-sm sm:text-base font-semibold bg-[#016124] hover:bg-[#017a2e] transition-all duration-200 rounded-xl">
                Se connecter
              </Button>
            </SignInButton>

            {/* Séparateur */}
            <div className="my-5 sm:my-6 flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-[10px] sm:text-xs text-gray-400">PDV Locagri</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Info */}
            <p className="text-center text-[10px] sm:text-xs text-gray-400">
              Système de gestion de point de vente
            </p>

            {/* Footer */}
            <p className="mt-6 sm:mt-8 text-center text-[10px] sm:text-xs text-gray-300">
              © {new Date().getFullYear()} Locagri
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Application authentifiée
// ============================================

function AuthenticatedApp() {
  const { user } = useUser()
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [isInitializing, setIsInitializing] = useState(true)

  // Mutations et queries Convex
  const getOrCreateUser = useMutation(api.users.getOrCreateUser)
  const currentUserData = useQuery(api.users.getCurrentUser)

  // Initialiser/récupérer l'utilisateur Convex à la connexion
  useEffect(() => {
    const initUser = async () => {
      try {
        await getOrCreateUser()
      } catch (error) {
        console.error('Erreur initialisation utilisateur:', error)
        toast.error('Erreur lors de la connexion')
      } finally {
        setIsInitializing(false)
      }
    }

    initUser()
  }, [getOrCreateUser])

  // Afficher le chargement pendant l'initialisation
  if (isInitializing || currentUserData === undefined) {
    return <LoadingScreen />
  }

  // Vérifier que l'utilisateur existe dans Convex
  if (!currentUserData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-3 sm:p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground mb-4 text-sm">
              Erreur de synchronisation du compte.
            </p>
            <SignOutButton>
              <Button variant="outline" className="text-sm">Se déconnecter</Button>
            </SignOutButton>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Vérifier si le compte est actif
  if (!currentUserData.isActive) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-3 sm:p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-center text-destructive text-lg sm:text-xl">
              Compte désactivé
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center p-4 sm:p-6 pt-0 sm:pt-0">
            <p className="text-muted-foreground mb-4 text-xs sm:text-sm">
              Votre compte a été désactivé par un administrateur.
              <br />
              Contactez votre responsable pour plus d'informations.
            </p>
            <SignOutButton>
              <Button variant="outline" className="text-sm">Se déconnecter</Button>
            </SignOutButton>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Vérifier si l'utilisateur est en attente de validation
  if (currentUserData.role === 'pending') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-3 sm:p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center p-4 sm:p-6">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[#CF761C]/10 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <Clock className="w-6 h-6 sm:w-8 sm:h-8 text-[#CF761C]" />
            </div>
            <CardTitle className="text-lg sm:text-xl text-[#CF761C]">
              Inscription en attente
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0 sm:pt-0">
            <div className="p-3 sm:p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-center gap-2 mb-1.5 sm:mb-2">
                <UserCheck className="w-4 h-4 sm:w-5 sm:h-5 text-[#016124]" />
                <span className="font-medium text-sm sm:text-base">{currentUserData.name}</span>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">{currentUserData.email}</p>
            </div>
            <p className="text-muted-foreground text-xs sm:text-sm">
              Votre compte a bien été créé mais nécessite une validation par un administrateur.
            </p>
            <p className="text-[10px] sm:text-sm text-muted-foreground">
              Vous serez notifié dès que votre accès sera activé.
              <br />
              En attendant, vous pouvez contacter votre responsable.
            </p>
            <SignOutButton>
              <Button variant="outline" className="mt-3 sm:mt-4 text-sm">Se déconnecter</Button>
            </SignOutButton>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Pour les caissiers, limiter les pages accessibles (dashboard et caisse uniquement)
  const allowedPagesForCashier: Page[] = ['dashboard', 'sales']
  const effectivePage = currentUserData.role === 'cashier' && !allowedPagesForCashier.includes(currentPage)
    ? 'dashboard'
    : currentPage

  const renderPage = () => {
    switch (effectivePage) {
      case 'dashboard':
        return <DashboardPage />
      case 'sales':
        return <SalesPage />
      case 'stock':
        return <StockPage />
      case 'reports':
        return <ReportsPage />
      case 'admin':
        return <AdminPage />
      case 'safe':
        return <SafePage />
      default:
        return <DashboardPage />
    }
  }

  return (
    <DashboardLayout
      userName={user?.firstName || user?.emailAddresses[0]?.emailAddress || currentUserData.name}
      userRole={currentUserData.role}
      currentPage={effectivePage}
      onPageChange={setCurrentPage}
    >
      {renderPage()}
    </DashboardLayout>
  )
}

export default App
