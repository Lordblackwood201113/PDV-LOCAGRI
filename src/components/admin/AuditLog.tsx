import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Download, ScrollText } from 'lucide-react'
import { exportAuditLogsToExcel } from '@/lib/exportUtils'
import { toast } from 'sonner'

type Category = 'user' | 'safe' | 'expense' | 'session' | 'stock' | 'product' | 'client'

const CATEGORY_LABELS: Record<Category, string> = {
  user: 'Utilisateurs',
  safe: 'Coffre',
  expense: 'Dépenses',
  session: 'Caisse',
  stock: 'Stock',
  product: 'Produits',
  client: 'Clients',
}

const CATEGORY_COLORS: Record<Category, string> = {
  user: 'bg-blue-100 text-blue-700',
  safe: 'bg-amber-100 text-amber-700',
  expense: 'bg-red-100 text-red-700',
  session: 'bg-emerald-100 text-emerald-700',
  stock: 'bg-indigo-100 text-indigo-700',
  product: 'bg-violet-100 text-violet-700',
  client: 'bg-pink-100 text-pink-700',
}

// "YYYY-MM-DD" -> timestamp (début/fin de journée)
function startOfDayTs(d: string): number {
  return new Date(d + 'T00:00:00').getTime()
}
function endOfDayTs(d: string): number {
  return new Date(d + 'T23:59:59.999').getTime()
}

export function AuditLog() {
  const [actorId, setActorId] = useState<string>('all')
  const [category, setCategory] = useState<string>('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const actors = useQuery(api.audit.getAuditActors) ?? []
  const logs = useQuery(api.audit.getAuditLogs, {
    actorId: actorId === 'all' ? undefined : actorId,
    category: category === 'all' ? undefined : (category as Category),
    startDate: startDate ? startOfDayTs(startDate) : undefined,
    endDate: endDate ? endOfDayTs(endDate) : undefined,
    limit: 500,
  })

  const formatDateTime = (ts: number) =>
    new Date(ts).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })

  const handleExport = () => {
    if (!logs || logs.length === 0) {
      toast.warning('Aucune donnée', { description: 'Aucun log à exporter' })
      return
    }
    exportAuditLogsToExcel(
      logs,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    )
    toast.success('Export réussi', { description: `${logs.length} entrée(s) exportée(s)` })
  }

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Acteur</Label>
              <Select value={actorId} onValueChange={setActorId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Tous" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les acteurs</SelectItem>
                  {actors.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Catégorie</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Toutes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Du</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Au</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9"
              />
            </div>

            <Button
              onClick={handleExport}
              variant="outline"
              className="h-9"
              disabled={!logs || logs.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Exporter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Liste */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          {logs === undefined ? (
            <p className="text-center text-muted-foreground py-8 text-sm">Chargement...</p>
          ) : logs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Aucune activité enregistrée pour ces filtres</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{logs.length} entrée(s)</p>
              {logs.map((log) => {
                const cat = log.category as Category
                return (
                  <div
                    key={log._id}
                    className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`text-[10px] border-0 ${CATEGORY_COLORS[cat] ?? 'bg-gray-100 text-gray-700'}`}>
                          {CATEGORY_LABELS[cat] ?? log.category}
                        </Badge>
                        <Badge variant="secondary" className="text-[9px] font-mono">
                          {log.reference}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDateTime(log.date)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-900 mt-1">{log.summary}</p>
                      {(log.before || log.after) && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {log.before ?? '—'} <span className="text-gray-400">→</span> {log.after ?? '—'}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-gray-700">{log.actorName}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{log.actorRole}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
