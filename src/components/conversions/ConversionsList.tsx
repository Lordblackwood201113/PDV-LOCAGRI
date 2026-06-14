import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Repeat, Inbox, ArrowRight } from 'lucide-react'

const formatNumber = (amount: number) => new Intl.NumberFormat('fr-FR').format(amount)

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

export function ConversionsList() {
  const [limit, setLimit] = useState(20)
  const data = useQuery(api.conversions.getConversions, { limit })

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

  const conversions = data.conversions

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <Repeat className="w-4 h-4 sm:w-5 sm:h-5 text-locagri-primary" />
          Historique des conversions
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
        {conversions.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-muted-foreground">
            <Inbox className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 text-slate-300" />
            <p className="text-sm">Aucune conversion enregistrée</p>
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {conversions.map((conversion) => (
              <div key={conversion._id} className="p-2.5 sm:p-3 bg-muted/50 rounded-lg">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    {conversion.reference} • {formatDate(conversion.date)} à {formatTime(conversion.date)}
                  </p>
                  <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                    ratio {conversion.conversionRatio}
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-1.5 text-xs sm:text-sm">
                  <span className="font-medium text-red-600 whitespace-nowrap">
                    −{conversion.sourceQuantity} {conversion.sourceProductName}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium text-locagri-success whitespace-nowrap">
                    +{formatNumber(conversion.targetQuantity)} {conversion.targetProductName}
                  </span>
                </div>

                {conversion.note && (
                  <p className="text-xs sm:text-sm mt-1 italic text-muted-foreground truncate">
                    « {conversion.note} »
                  </p>
                )}

                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1.5">
                  Par : {conversion.userName}
                </p>
              </div>
            ))}

            {data.count > conversions.length && (
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
