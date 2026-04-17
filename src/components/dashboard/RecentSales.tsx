import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Clock, Banknote, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'

export function RecentSales() {
  const todaySales = useQuery(api.sales.getTodaySales, {})

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount)
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const recentSales = todaySales?.slice(0, 8) || []

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-50 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm sm:text-base">
            <Clock className="w-4 h-4 text-[#016124]" />
            Ventes récentes
          </h3>
          {todaySales && (
            <span className="text-[10px] sm:text-xs text-gray-400">{todaySales.length} aujourd'hui</span>
          )}
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-auto">
        {recentSales.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-xs sm:text-sm">
            Aucune vente aujourd'hui
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentSales.map((sale) => (
              <div
                key={sale._id}
                className="px-3 sm:px-5 py-2.5 sm:py-3 hover:bg-gray-50/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <p className="font-medium text-xs sm:text-sm text-gray-900 truncate">
                        {sale.productName || 'Produit'}
                      </p>
                      <span className="text-[10px] sm:text-xs text-gray-400 flex-shrink-0">
                        x{sale.quantity}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5">
                      <span className="text-[10px] sm:text-xs text-gray-400">
                        {formatTime(sale.date)}
                      </span>
                      <span className="text-gray-300 hidden sm:inline">·</span>
                      <span className="text-[10px] sm:text-xs text-gray-400 truncate hidden sm:block">
                        {sale.userName}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    <div className={cn(
                      'w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center',
                      sale.paymentMethod === 'cash' ? 'bg-[#7ABE4E]/10' : 'bg-[#CF761C]/10'
                    )}>
                      {sale.paymentMethod === 'cash' ? (
                        <Banknote className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#016124]" />
                      ) : (
                        <Smartphone className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#CF761C]" />
                      )}
                    </div>
                    <span className="font-semibold text-xs sm:text-sm text-gray-900 tabular-nums whitespace-nowrap">
                      {formatPrice(sale.total)} <span className="text-[10px] text-gray-400 hidden sm:inline">F</span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer si plus de ventes */}
      {todaySales && todaySales.length > 8 && (
        <div className="px-4 sm:px-5 py-2.5 sm:py-3 border-t border-gray-50 bg-gray-50/50 flex-shrink-0">
          <p className="text-[10px] sm:text-xs text-gray-500 text-center">
            +{todaySales.length - 8} autres ventes
          </p>
        </div>
      )}
    </div>
  )
}
