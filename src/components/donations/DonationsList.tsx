import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Gift, Inbox, HandHeart } from 'lucide-react'

const formatPrice = (amount: number) => new Intl.NumberFormat('fr-FR').format(amount)

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })

export function DonationsList() {
  const [limit, setLimit] = useState(20)
  const data = useQuery(api.donations.getDonations, { limit })

  if (data === undefined) {
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

  const donations = data.donations

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Récapitulatif */}
      <Card className="border-locagri-accent/30">
        <CardContent className="p-3 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-muted-foreground">Total des dons</p>
              <p className="text-xl sm:text-2xl font-bold text-locagri-accent mt-0.5">
                {formatPrice(data.totalValue)} <span className="text-sm font-normal">FCFA</span>
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                {data.count} don{data.count > 1 ? 's' : ''} • {data.totalQuantity} unité
                {data.totalQuantity > 1 ? 's' : ''}
              </p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-locagri-accent/10 rounded-xl flex items-center justify-center shrink-0">
              <HandHeart className="w-5 h-5 sm:w-6 sm:h-6 text-locagri-accent" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Liste des dons */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Gift className="w-4 h-4 sm:w-5 sm:h-5 text-locagri-accent" />
            Historique des dons
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          {donations.length === 0 ? (
            <div className="text-center py-6 sm:py-8 text-muted-foreground">
              <Inbox className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 text-slate-300" />
              <p className="text-sm">Aucun don enregistré</p>
            </div>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {donations.map((donation) => (
                <div key={donation._id} className="p-2.5 sm:p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-primary truncate">
                        {donation.donorName}
                      </p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        {donation.reference} • {formatDate(donation.date)} à {formatTime(donation.date)}
                      </p>
                    </div>
                    <span className="text-sm sm:text-base font-bold text-locagri-accent whitespace-nowrap">
                      {formatPrice(donation.totalValue)} F
                    </span>
                  </div>

                  {donation.motif && (
                    <p className="text-xs sm:text-sm mt-1 italic text-muted-foreground truncate">
                      « {donation.motif} »
                    </p>
                  )}

                  <ul className="mt-1.5 space-y-0.5">
                    {donation.items.map((item, i) => (
                      <li
                        key={i}
                        className="text-[11px] sm:text-xs text-slate-600 flex justify-between gap-2"
                      >
                        <span className="truncate">
                          {item.productName} × {item.quantity}
                        </span>
                        <span className="text-muted-foreground whitespace-nowrap">
                          {formatPrice(item.lineValue)} F
                        </span>
                      </li>
                    ))}
                  </ul>

                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-1.5">
                    Par : {donation.userName}
                  </p>
                </div>
              ))}

              {data.count > donations.length && (
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
    </div>
  )
}
