import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Id } from '../../../convex/_generated/dataModel'
import { History, PackagePlus, ShoppingCart, ClipboardEdit, FileText, Inbox } from 'lucide-react'

type MovementType = 'all' | 'in' | 'out' | 'adjustment'

export function StockHistory() {
  const [filter, setFilter] = useState<MovementType>('all')
  const [productFilter, setProductFilter] = useState<Id<'products'> | 'all'>('all')
  const [limit, setLimit] = useState(20)

  const products = useQuery(api.products.getProducts)
  const stockHistory = useQuery(
    api.stock.getStockHistory,
    productFilter === 'all' ? { limit: 100 } : { productId: productFilter, limit: 100 }
  )

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Filtrer les mouvements
  const filteredMovements = stockHistory?.filter((movement) => {
    if (filter === 'all') return true
    if (filter === 'in') return movement.type === 'in'
    if (filter === 'out') return movement.type === 'out'
    if (filter === 'adjustment') return movement.type === 'adjustment'
    return true
  }).slice(0, limit)

  const getMovementBadge = (type: string, quantity: number) => {
    switch (type) {
      case 'in':
        return (
          <Badge className="bg-[#7ABE4E] text-[10px] sm:text-xs">
            +{quantity} Entrée
          </Badge>
        )
      case 'out':
        return (
          <Badge className="bg-red-500 text-[10px] sm:text-xs">
            -{quantity} Sortie/Vente
          </Badge>
        )
      case 'adjustment':
        return (
          <Badge variant={quantity >= 0 ? 'default' : 'destructive'} className="text-[10px] sm:text-xs">
            {quantity >= 0 ? '+' : ''}{quantity} Ajustement
          </Badge>
        )
      default:
        return <Badge variant="outline" className="text-[10px] sm:text-xs">{type}</Badge>
    }
  }

  const getMovementIcon = (type: string) => {
    switch (type) {
      case 'in':
        return <PackagePlus className="w-4 h-4 sm:w-5 sm:h-5 text-[#7ABE4E]" />
      case 'out':
        return <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
      case 'adjustment':
        return <ClipboardEdit className="w-4 h-4 sm:w-5 sm:h-5 text-[#CF761C]" />
      default:
        return <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />
    }
  }

  if (stockHistory === undefined) {
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

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <History className="w-4 h-4 sm:w-5 sm:h-5 text-[#016124]" />
            Historique des mouvements
          </CardTitle>

          {/* Filtres */}
          <div className="flex flex-wrap gap-2">
            {/* Filtre par produit */}
            {products && products.length > 1 && (
              <Select
                value={productFilter}
                onValueChange={(value) => setProductFilter(value as Id<'products'> | 'all')}
              >
                <SelectTrigger className="w-[130px] sm:w-[160px] h-8 sm:h-9 text-xs sm:text-sm">
                  <SelectValue placeholder="Produit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les produits</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Filtre par type */}
            <Select
              value={filter}
              onValueChange={(value) => setFilter(value as MovementType)}
            >
              <SelectTrigger className="w-[110px] sm:w-[140px] h-8 sm:h-9 text-xs sm:text-sm">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous types</SelectItem>
                <SelectItem value="in">Entrées</SelectItem>
                <SelectItem value="out">Sorties/Ventes</SelectItem>
                <SelectItem value="adjustment">Ajustements</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
        {filteredMovements && filteredMovements.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-muted-foreground">
            <Inbox className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 text-slate-300" />
            <p className="text-sm">Aucun mouvement de stock</p>
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {filteredMovements?.map((movement) => (
              <div
                key={movement._id}
                className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 bg-muted/50 rounded-lg"
              >
                {/* Icône */}
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  {getMovementIcon(movement.type)}
                </div>

                {/* Détails */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    {getMovementBadge(movement.type, movement.quantity)}
                    <span className="text-[10px] sm:text-xs text-muted-foreground">
                      {formatDate(movement.date)} à {formatTime(movement.date)}
                    </span>
                  </div>
                  {/* Nom du produit */}
                  {movement.productName && (
                    <p className="text-xs sm:text-sm font-medium text-primary">{movement.productName}</p>
                  )}
                  <p className="text-xs sm:text-sm mt-0.5 sm:mt-1 truncate">{movement.reason}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
                    Stock après: <span className="font-medium">{movement.newStock}</span>
                    {movement.userName && (
                      <span className="ml-1 sm:ml-2">• Par: {movement.userName}</span>
                    )}
                  </p>
                </div>
              </div>
            ))}

            {/* Bouton charger plus */}
            {filteredMovements && stockHistory && filteredMovements.length < stockHistory.filter((m) => {
              if (filter === 'all') return true
              if (filter === 'in') return m.type === 'in'
              if (filter === 'out') return m.type === 'out'
              if (filter === 'adjustment') return m.type === 'adjustment'
              return true
            }).length && (
              <Button
                variant="outline"
                className="w-full mt-3 sm:mt-4 text-sm h-8 sm:h-9"
                onClick={() => setLimit((prev) => prev + 20)}
              >
                Afficher plus
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
