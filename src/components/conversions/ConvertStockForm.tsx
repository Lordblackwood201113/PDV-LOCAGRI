import { useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import type { Id } from '../../../convex/_generated/dataModel'
import { ArrowRight, Repeat } from 'lucide-react'

interface ConvertStockFormProps {
  onSuccess?: () => void
}

const formatNumber = (amount: number) => new Intl.NumberFormat('fr-FR').format(amount)

export function ConvertStockForm({ onSuccess }: ConvertStockFormProps) {
  const sources = useQuery(api.conversions.getConvertibleProducts)
  const convertStock = useMutation(api.conversions.convertStock)

  const [sourceId, setSourceId] = useState<string>('')
  const [targetId, setTargetId] = useState<string>('')
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const source = useMemo(
    () => (sources ?? []).find((s) => s._id === sourceId),
    [sources, sourceId]
  )
  const target = useMemo(
    () => source?.children.find((c) => c._id === targetId),
    [source, targetId]
  )

  const qtyNum = Number(quantity)
  const qtyValid = Number.isInteger(qtyNum) && qtyNum > 0
  const overStock = !!source && qtyValid && qtyNum > source.stockQuantity

  const producedQty = target && qtyValid ? qtyNum * target.conversionRatio : 0
  const sourceAfter = source && qtyValid ? source.stockQuantity - qtyNum : undefined
  const targetAfter = target && qtyValid ? target.stockQuantity + producedQty : undefined

  const canSubmit =
    !isSubmitting && !!source && !!target && qtyValid && !overStock

  const handleSourceChange = (value: string) => {
    setSourceId(value)
    setTargetId('') // réinitialiser la cible : ses enfants dépendent de la source
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!source || !target) {
      toast.error('Choisissez un produit source et un produit cible')
      return
    }
    if (!qtyValid) {
      toast.error('La quantité doit être un entier supérieur à 0')
      return
    }
    if (overStock) {
      toast.error('Stock insuffisant', {
        description: `Disponible : ${source.stockQuantity} ${source.unit}(s)`,
      })
      return
    }

    setIsSubmitting(true)
    try {
      const result = await convertStock({
        sourceProductId: source._id as Id<'products'>,
        targetProductId: target._id as Id<'products'>,
        sourceQuantity: qtyNum,
        note: note.trim() ? note.trim() : undefined,
      })

      toast.success('Conversion enregistrée', {
        description: `${result.conversionReference} — ${qtyNum} ${source.unit}(s) → ${formatNumber(result.targetQuantity)} ${target.unit}(s)`,
      })

      if (result.sourceLowStock) {
        toast.warning('Stock source bas', { description: source.name })
      }

      setQuantity('')
      setNote('')
      onSuccess?.()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (sources === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-6">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-muted-foreground">Chargement...</span>
      </div>
    )
  }

  if (sources.length === 0) {
    return (
      <div className="py-6 text-center text-muted-foreground text-sm">
        Aucun produit convertible. Liez d'abord un produit « détail » à un produit
        « source » dans la fiche produit (Administration → Produits).
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
      {/* Produit source */}
      <div className="space-y-1.5">
        <Label className="text-sm">Produit à convertir (source)</Label>
        <Select value={sourceId} onValueChange={handleSourceChange} disabled={isSubmitting}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Choisir un produit" />
          </SelectTrigger>
          <SelectContent>
            {sources.map((s) => (
              <SelectItem key={s._id} value={s._id}>
                {s.name} (stock : {s.stockQuantity} {s.unit})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Produit cible */}
      <div className="space-y-1.5">
        <Label className="text-sm">Produit obtenu (cible)</Label>
        <Select
          value={targetId}
          onValueChange={setTargetId}
          disabled={isSubmitting || !source}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder={source ? 'Choisir le produit obtenu' : 'Choisir d\'abord la source'} />
          </SelectTrigger>
          <SelectContent>
            {(source?.children ?? []).map((c) => (
              <SelectItem key={c._id} value={c._id}>
                {c.name} — {c.conversionRatio} {c.unit}(s) / {source?.unit}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Nombre de sacs */}
      <div className="space-y-1.5">
        <Label htmlFor="convert-qty" className="text-sm">
          Nombre de {source?.unit ?? 'unités'} à convertir
        </Label>
        <Input
          id="convert-qty"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Ex : 2"
          disabled={isSubmitting || !source}
          className="h-9 text-sm"
        />
        {overStock && source && (
          <p className="text-xs text-red-600">
            Stock disponible : {source.stockQuantity} {source.unit}(s)
          </p>
        )}
      </div>

      {/* Note (optionnelle) */}
      <div className="space-y-1.5">
        <Label htmlFor="convert-note" className="text-sm">
          Note <span className="text-muted-foreground">(optionnel)</span>
        </Label>
        <Input
          id="convert-note"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex : Demande client détail"
          disabled={isSubmitting}
          className="h-9 text-sm"
        />
      </div>

      {/* Aperçu */}
      {source && target && qtyValid && (
        <div className="flex items-center justify-between gap-2 p-2.5 sm:p-3 bg-muted rounded-lg text-sm">
          <div className="text-center">
            <p className="font-bold text-red-600">−{qtyNum} {source.unit}(s)</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">reste {sourceAfter}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="text-center">
            <p className="font-bold text-locagri-success">+{formatNumber(producedQty)} {target.unit}(s)</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">nouveau {targetAfter}</p>
          </div>
        </div>
      )}

      <Button
        type="submit"
        className="w-full bg-locagri-primary hover:bg-locagri-primary/90 text-white text-sm sm:text-base h-9 sm:h-10"
        disabled={!canSubmit}
      >
        {isSubmitting ? (
          <span className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Conversion...</span>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Repeat className="w-4 h-4" />
            Convertir
          </span>
        )}
      </Button>

      <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
        La conversion transforme le stock sans encaissement. Le revenu apparaît à la vente.
      </p>
    </form>
  )
}
