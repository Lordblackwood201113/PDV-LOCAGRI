import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { Id } from '../../../convex/_generated/dataModel'
import { Package, PackageOpen, AlertTriangle } from 'lucide-react'

export function ProductManagement() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Id<'products'> | null>(null)

  // Form state for add/edit
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [stockQuantity, setStockQuantity] = useState('')
  const [alertThreshold, setAlertThreshold] = useState('')
  const [unit, setUnit] = useState('sac')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const products = useQuery(api.products.getAllProducts)
  const currentUser = useQuery(api.users.getCurrentUser)
  const addProduct = useMutation(api.products.addProduct)
  const updateProduct = useMutation(api.products.updateProduct)
  const toggleActive = useMutation(api.products.toggleProductActive)
  const deleteProduct = useMutation(api.products.deleteProduct)

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA'
  }

  const resetForm = () => {
    setName('')
    setDescription('')
    setPrice('')
    setStockQuantity('')
    setAlertThreshold('')
    setUnit('sac')
    setEditingProduct(null)
  }

  const openEditDialog = (product: NonNullable<typeof products>[0]) => {
    setName(product.name)
    setDescription(product.description || '')
    setPrice(product.price.toString())
    setAlertThreshold(product.alertThreshold.toString())
    setUnit(product.unit)
    setEditingProduct(product._id)
    setIsAddDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const priceNum = parseInt(price)
    const stockNum = parseInt(stockQuantity)
    const thresholdNum = parseInt(alertThreshold)

    // Validations
    if (!name.trim()) {
      toast.error('Le nom du produit est requis')
      return
    }
    if (isNaN(priceNum) || priceNum <= 0) {
      toast.error('Le prix doit être un nombre positif')
      return
    }
    if (!editingProduct && (isNaN(stockNum) || stockNum < 0)) {
      toast.error('Le stock initial doit être un nombre positif ou zéro')
      return
    }
    if (isNaN(thresholdNum) || thresholdNum < 0) {
      toast.error('Le seuil d\'alerte doit être un nombre positif ou zéro')
      return
    }
    if (!unit.trim()) {
      toast.error('L\'unité de mesure est requise')
      return
    }

    setIsSubmitting(true)
    try {
      if (editingProduct) {
        await updateProduct({
          productId: editingProduct,
          name: name.trim(),
          description: description.trim() || undefined,
          price: priceNum,
          alertThreshold: thresholdNum,
          unit: unit.trim(),
        })
        toast.success('Produit mis à jour')
      } else {
        await addProduct({
          name: name.trim(),
          description: description.trim() || undefined,
          price: priceNum,
          stockQuantity: stockNum,
          alertThreshold: thresholdNum,
          unit: unit.trim(),
        })
        toast.success('Produit ajouté')
      }
      resetForm()
      setIsAddDialogOpen(false)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleActive = async (productId: Id<'products'>, currentStatus: boolean) => {
    try {
      await toggleActive({ productId, isActive: !currentStatus })
      toast.success(currentStatus ? 'Produit archivé' : 'Produit réactivé')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    }
  }

  const handleDelete = async (productId: Id<'products'>, productName: string) => {
    if (!confirm(`Voulez-vous vraiment supprimer "${productName}" ?`)) {
      return
    }
    try {
      await deleteProduct({ productId })
      toast.success('Produit supprimé')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    }
  }

  if (products === undefined || currentUser === undefined) {
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

  if (currentUser?.role !== 'admin') {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          Accès réservé aux administrateurs
        </CardContent>
      </Card>
    )
  }

  // Unités prédéfinies
  const commonUnits = ['sac', 'kg', 'pièce', 'carton', 'boîte', 'litre']

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Package className="w-4 h-4 sm:w-5 sm:h-5 text-[#016124]" />
              Gestion des produits
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {products.length} produit{products.length > 1 ? 's' : ''} enregistré{products.length > 1 ? 's' : ''}
            </CardDescription>
          </div>

          {/* Bouton Ajouter */}
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
            setIsAddDialogOpen(open)
            if (!open) resetForm()
          }}>
            <DialogTrigger asChild>
              <Button className="text-sm h-9 self-start sm:self-auto">
                + Ajouter
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-lg sm:text-xl">
                  {editingProduct ? 'Modifier le produit' : 'Ajouter un produit'}
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm">
                  {editingProduct
                    ? 'Modifiez les informations du produit'
                    : 'Remplissez les informations du nouveau produit'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                {/* Nom */}
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="product-name" className="text-sm">Nom du produit *</Label>
                  <Input
                    id="product-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Riz Premium 4.5kg"
                    disabled={isSubmitting}
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="product-desc" className="text-sm">Description (optionnelle)</Label>
                  <Input
                    id="product-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex: Riz de qualité supérieure"
                    disabled={isSubmitting}
                  />
                </div>

                {/* Prix */}
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="product-price" className="text-sm">Prix de vente (FCFA) *</Label>
                  <Input
                    id="product-price"
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="Ex: 3500"
                    min={1}
                    disabled={isSubmitting}
                  />
                </div>

                {/* Stock initial (uniquement pour nouveau produit) */}
                {!editingProduct && (
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="product-stock" className="text-sm">Stock initial *</Label>
                    <Input
                      id="product-stock"
                      type="number"
                      value={stockQuantity}
                      onChange={(e) => setStockQuantity(e.target.value)}
                      placeholder="Ex: 100"
                      min={0}
                      disabled={isSubmitting}
                    />
                  </div>
                )}

                {/* Seuil d'alerte */}
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="product-threshold" className="text-sm">Seuil d'alerte stock *</Label>
                  <Input
                    id="product-threshold"
                    type="number"
                    value={alertThreshold}
                    onChange={(e) => setAlertThreshold(e.target.value)}
                    placeholder="Ex: 10"
                    min={0}
                    disabled={isSubmitting}
                  />
                </div>

                {/* Unité */}
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="product-unit" className="text-sm">Unité de mesure *</Label>
                  <Input
                    id="product-unit"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="Ex: sac"
                    disabled={isSubmitting}
                    className="text-sm"
                  />
                  <div className="flex flex-wrap gap-1">
                    {commonUnits.map((u) => (
                      <Button
                        key={u}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-[10px] sm:text-xs h-5 sm:h-6 px-1.5 sm:px-2"
                        onClick={() => setUnit(u)}
                        disabled={isSubmitting}
                      >
                        {u}
                      </Button>
                    ))}
                  </div>
                </div>

                <DialogFooter>
                  <Button type="submit" disabled={isSubmitting} className="text-sm h-9">
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm">{editingProduct ? 'Mise à jour...' : 'Ajout...'}</span>
                      </span>
                    ) : (
                      editingProduct ? 'Mettre à jour' : 'Ajouter'
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
        {products.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-muted-foreground">
            <PackageOpen className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 text-gray-300" />
            <p className="text-sm">Aucun produit configuré</p>
            <p className="text-xs sm:text-sm">Cliquez sur "Ajouter" pour commencer</p>
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {products.map((product) => {
              const isLowStock = product.stockQuantity <= product.alertThreshold
              const isCritical = product.stockQuantity <= 5

              return (
                <div
                  key={product._id}
                  className={`p-3 bg-gray-50 rounded-lg ${!product.isActive ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm sm:text-base truncate">{product.name}</p>
                        {product.isActive ? (
                          <Badge className="bg-[#7ABE4E] text-[10px] sm:text-xs">Actif</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] sm:text-xs">Archivé</Badge>
                        )}
                      </div>
                      {product.description && (
                        <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                          {product.description}
                        </p>
                      )}
                    </div>
                    <span className="font-semibold text-sm sm:text-base text-primary whitespace-nowrap">
                      {formatPrice(product.price)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-medium text-sm ${
                        isCritical ? 'text-red-600' : isLowStock ? 'text-[#CF761C]' : 'text-[#016124]'
                      }`}>
                        {product.stockQuantity} {product.unit}s
                      </span>
                      {isLowStock && (
                        <Badge variant="outline" className="text-[10px] flex items-center gap-0.5">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          {isCritical ? 'Critique' : 'Bas'}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => openEditDialog(product)}
                      >
                        Modifier
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleToggleActive(product._id, product.isActive)}
                      >
                        {product.isActive ? 'Archiver' : 'Réactiver'}
                      </Button>
                      {!product.isActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(product._id, product.name)}
                        >
                          Suppr.
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
