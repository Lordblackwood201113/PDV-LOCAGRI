import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Banknote, Smartphone, AlertTriangle } from 'lucide-react'

interface TodayStatsProps {
  expanded?: boolean
}

export function TodayStats({ expanded = false }: TodayStatsProps) {
  const todayStats = useQuery(api.sales.getTodayStats, {})
  const products = useQuery(api.products.getProducts)

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA'
  }

  if (!todayStats) {
    return null
  }

  // Version compacte (pour la page caisse)
  if (!expanded) {
    return (
      <Card>
        <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
          <CardTitle className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-[#7ABE4E] rounded-full animate-pulse" />
            Aujourd'hui
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
            <div>
              <p className="text-lg sm:text-2xl font-bold text-primary">{todayStats.salesCount}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">ventes</p>
            </div>
            <div>
              <p className="text-lg sm:text-2xl font-bold text-primary">{todayStats.totalQuantity}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">sacs</p>
            </div>
            <div>
              <p className="text-sm sm:text-lg font-bold text-primary">
                {formatPrice(todayStats.totalAmount)}
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">total</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Version étendue (pour le dashboard)
  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Résumé principal */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-[#7ABE4E] rounded-full animate-pulse" />
            Statistiques du jour
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
            {/* Nombre de ventes */}
            <div className="text-center p-2 sm:p-4 bg-primary/5 rounded-lg">
              <p className="text-xl sm:text-3xl font-bold text-primary">{todayStats.salesCount}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Ventes</p>
            </div>

            {/* Quantité vendue */}
            <div className="text-center p-2 sm:p-4 bg-primary/5 rounded-lg">
              <p className="text-xl sm:text-3xl font-bold text-primary">{todayStats.totalQuantity}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Sacs vendus</p>
            </div>

            {/* Chiffre d'affaires */}
            <div className="text-center p-2 sm:p-4 bg-primary/5 rounded-lg col-span-2">
              <p className="text-xl sm:text-3xl font-bold text-primary">
                {formatPrice(todayStats.totalAmount)}
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground">Chiffre d'affaires</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Répartition par mode de paiement */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-sm sm:text-base">Répartition par paiement</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          <div className="space-y-3 sm:space-y-4">
            {/* Espèces */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#7ABE4E]/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Banknote className="w-4 h-4 sm:w-5 sm:h-5 text-[#016124]" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm sm:text-base">Espèces</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {todayStats.cashCount} vente{todayStats.cashCount > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-primary text-sm sm:text-base">{formatPrice(todayStats.cashAmount)}</p>
                {todayStats.totalAmount > 0 && (
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {Math.round((todayStats.cashAmount / todayStats.totalAmount) * 100)}%
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Mobile Money */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#CF761C]/15 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Smartphone className="w-4 h-4 sm:w-5 sm:h-5 text-[#CF761C]" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm sm:text-base">Mobile Money</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {todayStats.mobileCount} vente{todayStats.mobileCount > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-primary text-sm sm:text-base">{formatPrice(todayStats.mobileAmount)}</p>
                {todayStats.totalAmount > 0 && (
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {Math.round((todayStats.mobileAmount / todayStats.totalAmount) * 100)}%
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Stock - Multi-produits */}
      {products && products.length > 0 && (
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="text-sm sm:text-base">État du stock</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 sm:space-y-3 p-3 sm:p-6 pt-0 sm:pt-0">
            {products.map((product) => {
              const isLowStock = product.stockQuantity <= product.alertThreshold
              return (
                <div
                  key={product._id}
                  className={`flex items-center justify-between gap-2 p-2 sm:p-3 rounded-lg ${
                    isLowStock ? 'bg-orange-50 border border-orange-200' : 'bg-muted/50'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm sm:text-base truncate">{product.name}</p>
                    <p className={`text-base sm:text-lg font-bold ${
                      isLowStock ? 'text-orange-600' : 'text-primary'
                    }`}>
                      {product.stockQuantity} {product.unit}s
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs sm:text-sm text-muted-foreground">Prix</p>
                    <p className="font-bold text-primary text-sm sm:text-base">
                      {formatPrice(product.price)}
                    </p>
                  </div>
                </div>
              )
            })}

            {/* Alerte globale si produits en stock bas */}
            {products.some(p => p.stockQuantity <= p.alertThreshold) && (
              <div className="p-2 sm:p-3 bg-[#CF761C]/10 rounded-lg text-xs sm:text-sm text-[#CF761C] flex items-center gap-1.5 sm:gap-2">
                <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                <span>Certains produits sont en dessous du seuil d'alerte</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
