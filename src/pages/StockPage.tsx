import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { StockOverview, AddStockForm, AdjustStockForm, StockHistory } from '@/components/stock'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PackageX } from 'lucide-react'

export function StockPage() {
  const [activeTab, setActiveTab] = useState('overview')
  const currentUser = useQuery(api.users.getCurrentUser)
  const product = useQuery(api.products.getProduct)

  // Chargement
  if (currentUser === undefined || product === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    )
  }

  // Produit non configuré
  if (!product) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <PackageX className="w-8 h-8 text-slate-500" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Produit non configuré</h2>
          <p className="text-muted-foreground">
            Le produit doit d'abord être configuré dans la section Ventes.
          </p>
        </div>
      </div>
    )
  }

  // Vérifier les permissions (caissier ne peut pas gérer le stock)
  const canManageStock = currentUser?.role === 'admin' || currentUser?.role === 'manager'

  return (
    <div className="h-full overflow-auto p-3 sm:p-4">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">Gestion du Stock</h2>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 h-auto">
            <TabsTrigger value="overview" className="text-xs sm:text-sm py-2">Vue d'ensemble</TabsTrigger>
            <TabsTrigger value="movements" disabled={!canManageStock} className="text-xs sm:text-sm py-2">
              Mouvements
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs sm:text-sm py-2">Historique</TabsTrigger>
          </TabsList>

          {/* Onglet Vue d'ensemble */}
          <TabsContent value="overview" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
            <StockOverview />
          </TabsContent>

          {/* Onglet Mouvements (entrée/ajustement) */}
          <TabsContent value="movements" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
            {canManageStock ? (
              <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                <AddStockForm onSuccess={() => setActiveTab('overview')} />
                <AdjustStockForm onSuccess={() => setActiveTab('overview')} />
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>Vous n'avez pas les permissions pour gérer le stock.</p>
              </div>
            )}
          </TabsContent>

          {/* Onglet Historique */}
          <TabsContent value="history" className="mt-4">
            <StockHistory />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
