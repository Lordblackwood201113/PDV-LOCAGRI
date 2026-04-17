import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BarChart3, AlertTriangle } from 'lucide-react'

export function StockOverview() {
  const products = useQuery(api.products.getProducts)
  const stockStats = useQuery(api.stock.getStockStats, {})

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA'
  }

  if (products === undefined || stockStats === undefined) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-muted-foreground">Chargement...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!products || products.length === 0 || !stockStats) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          Aucun produit configuré
        </CardContent>
      </Card>
    )
  }

  // Calcul de la valeur totale du stock
  const totalStockValue = products.reduce((sum, p) => sum + p.stockQuantity * p.price, 0)

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Résumé global */}
      <Card>
        <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-[#016124]" />
            Vue d'ensemble
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
            <div className="p-2 sm:p-3 bg-muted rounded-lg text-center">
              <p className="text-xs sm:text-sm text-muted-foreground">Produits</p>
              <p className="text-lg sm:text-2xl font-bold text-primary">{stockStats.productsCount}</p>
            </div>
            <div className="p-2 sm:p-3 bg-muted rounded-lg text-center">
              <p className="text-xs sm:text-sm text-muted-foreground">Stock total</p>
              <p className="text-lg sm:text-2xl font-bold text-primary">{stockStats.totalStock}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">unités</p>
            </div>
            <div className="p-2 sm:p-3 bg-muted rounded-lg text-center">
              <p className="text-xs sm:text-sm text-muted-foreground">Valeur totale</p>
              <p className="text-sm sm:text-lg font-bold text-primary">{formatPrice(totalStockValue)}</p>
            </div>
            <div className={`p-2 sm:p-3 rounded-lg text-center ${stockStats.lowStockCount > 0 ? 'bg-orange-100' : 'bg-[#7ABE4E]/20'}`}>
              <p className="text-xs sm:text-sm text-muted-foreground">Alertes</p>
              <p className={`text-lg sm:text-2xl font-bold ${stockStats.lowStockCount > 0 ? 'text-[#CF761C]' : 'text-[#016124]'}`}>
                {stockStats.lowStockCount}
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">stock bas</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Liste des produits avec leur stock */}
      <Card>
        <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
          <CardTitle className="text-sm sm:text-base">Stock par produit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 sm:space-y-3 p-3 sm:p-6 pt-0 sm:pt-0">
          {products.map((product) => {
            const stockPercentage = Math.min(100, (product.stockQuantity / (product.alertThreshold * 3)) * 100)
            const isCritical = product.stockQuantity <= 5
            const isLow = product.stockQuantity <= product.alertThreshold

            return (
              <div
                key={product._id}
                className={`p-2 sm:p-3 rounded-lg border ${
                  isCritical ? 'border-red-400 bg-red-50' : isLow ? 'border-orange-400 bg-orange-50' : 'border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm sm:text-base truncate">{product.name}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      {formatPrice(product.price)} / {product.unit}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className={`text-lg sm:text-xl font-bold ${
                      isCritical ? 'text-red-600' : isLow ? 'text-[#CF761C]' : 'text-[#016124]'
                    }`}>
                      {product.stockQuantity}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">{product.unit}s</p>
                  </div>
                </div>

                {/* Jauge */}
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      isCritical ? 'bg-red-500' : isLow ? 'bg-orange-500' : 'bg-[#7ABE4E]'
                    }`}
                    style={{ width: `${stockPercentage}%` }}
                  />
                </div>

                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] sm:text-xs text-muted-foreground">
                    Seuil: {product.alertThreshold}
                  </span>
                  {isCritical ? (
                    <Badge variant="destructive" className="text-[10px] sm:text-xs">Critique</Badge>
                  ) : isLow ? (
                    <Badge className="bg-orange-500 text-[10px] sm:text-xs">Stock bas</Badge>
                  ) : (
                    <Badge className="bg-[#7ABE4E] text-[10px] sm:text-xs">OK</Badge>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Statistiques 30 jours */}
      {stockStats.last30Days && (
        <Card>
          <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-sm sm:text-base">Mouvements (30 derniers jours)</CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
              <div className="p-2 sm:p-3 bg-[#7ABE4E]/10 rounded-lg">
                <p className="text-lg sm:text-2xl font-bold text-[#016124]">+{stockStats.last30Days.totalIn}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Entrées</p>
              </div>
              <div className="p-2 sm:p-3 bg-red-50 rounded-lg">
                <p className="text-lg sm:text-2xl font-bold text-red-600">-{stockStats.last30Days.totalOut}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Sorties</p>
              </div>
              <div className={`p-2 sm:p-3 rounded-lg ${stockStats.last30Days.netChange >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
                <p className={`text-lg sm:text-2xl font-bold ${stockStats.last30Days.netChange >= 0 ? 'text-blue-600' : 'text-[#CF761C]'}`}>
                  {stockStats.last30Days.netChange >= 0 ? '+' : ''}{stockStats.last30Days.netChange}
                </p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Net</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alertes produits en stock bas */}
      {stockStats.lowStockProducts && stockStats.lowStockProducts.length > 0 && (
        <Card className="bg-[#CF761C]/10 border-[#CF761C]/30">
          <CardContent className="p-3 sm:pt-4 sm:p-6">
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#CF761C]/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-[#CF761C]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[#CF761C] text-sm sm:text-base">Réapprovisionnement recommandé</p>
                <ul className="text-xs sm:text-sm text-orange-700 mt-1 sm:mt-2 space-y-1">
                  {stockStats.lowStockProducts.map((p) => (
                    <li key={p.id} className="truncate">
                      <strong>{p.name}</strong>: {p.stock} {p.unit}s (seuil: {p.threshold})
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
