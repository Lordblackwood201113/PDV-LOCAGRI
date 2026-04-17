# Workflow d'Implémentation - PDV LOCAGRI

> **Projet**: Système de Point de Vente pour Riz 4.5 Kg
> **Stack**: React/Vite + Tailwind/shadcn + Convex + Clerk

---

## Vue d'Ensemble des Phases

```
Phase 1        Phase 2           Phase 3         Phase 4          Phase 5
SETUP    -->  CLERK+CONVEX  --> MODULE     --> STOCK &      --> ADMIN
PROJET        (CRITIQUE)        CAISSE         RAPPORTS

[2-3h]        [3-4h]            [4-5h]         [4-5h]           [3-4h]
```

---

## PHASE 1 : Setup du Projet

### Étape 1.1 : Créer le projet Vite

```bash
npm create vite@latest . -- --template react-ts
npm install
```

**Fichiers créés**: `package.json`, `vite.config.ts`, `src/`, `index.html`

---

### Étape 1.2 : Installer et configurer Tailwind CSS

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

**Configurer `tailwind.config.js`**:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1B4332',
          light: '#40916C',
        },
        accent: '#F4A261',
        danger: '#E63946',
      },
    },
  },
  plugins: [],
}
```

**Remplacer `src/index.css`**:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

### Étape 1.3 : Initialiser shadcn/ui

```bash
npx shadcn@latest init
```

**Réponses recommandées**:
- Style: Default
- Base color: Neutral
- CSS variables: Yes

**Installer les composants nécessaires**:
```bash
npx shadcn@latest add button card input dialog toast table badge tabs select
```

---

### Étape 1.4 : Structure des dossiers

Créer la structure suivante:
```
src/
├── components/
│   ├── ui/          # (créé par shadcn)
│   ├── layout/
│   ├── sales/
│   ├── stock/
│   ├── reports/
│   └── admin/
├── pages/
├── hooks/
├── lib/
└── convex/          # (créé par Convex)
```

```bash
mkdir -p src/components/layout src/components/sales src/components/stock src/components/reports src/components/admin src/pages src/hooks
```

---

## PHASE 2 : Configuration Clerk + Convex

### Étape 2.1 : Initialiser Convex

```bash
npm install convex
npx convex dev
```

**Actions dans le terminal**:
1. Créer un compte Convex (si nécessaire)
2. Créer un nouveau projet "pdv-locagri"
3. Convex crée automatiquement le dossier `convex/`

**Fichier `.env.local` créé** (ne jamais commit):
```env
VITE_CONVEX_URL=https://votre-projet.convex.cloud
```

---

### Étape 2.2 : Configurer Clerk

#### A. Créer l'application Clerk

1. Aller sur [clerk.com](https://clerk.com) > Dashboard
2. Créer une nouvelle application "PDV Locagri"
3. Activer uniquement "Email" comme méthode d'authentification
4. Copier la **Publishable Key**

#### B. Créer le JWT Template pour Convex

1. Dashboard Clerk > **JWT Templates**
2. Cliquer "New template"
3. Sélectionner **Convex**
4. Nom: `convex`
5. Copier l'**Issuer URL** (format: `https://votre-app.clerk.accounts.dev`)
6. Sauvegarder

#### C. Variables d'environnement

**Ajouter à `.env.local`**:
```env
VITE_CONVEX_URL=https://votre-projet.convex.cloud
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
```

**Configurer Convex Dashboard**:
1. Dashboard Convex > Settings > Environment Variables
2. Ajouter: `CLERK_JWT_ISSUER_DOMAIN` = `https://votre-app.clerk.accounts.dev`

---

### Étape 2.3 : Configurer l'authentification Convex

**Créer `convex/auth.config.ts`**:
```typescript
const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ]
};

export default authConfig;
```

---

### Étape 2.4 : Installer les packages et configurer les Providers

```bash
npm install @clerk/clerk-react convex
```

**Modifier `src/main.tsx`**:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider, useAuth } from '@clerk/clerk-react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { ConvexReactClient } from 'convex/react'
import App from './App'
import './index.css'

// Validation des variables d'environnement
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL

if (!PUBLISHABLE_KEY) {
  throw new Error('VITE_CLERK_PUBLISHABLE_KEY manquant dans .env.local')
}
if (!CONVEX_URL) {
  throw new Error('VITE_CONVEX_URL manquant dans .env.local')
}

const convex = new ConvexReactClient(CONVEX_URL)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <App />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  </React.StrictMode>,
)
```

---

### Étape 2.5 : Créer le schéma Convex

**Créer `convex/schema.ts`**:
```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Produit unique (Riz 4.5 Kg)
  products: defineTable({
    name: v.string(),
    price: v.number(),
    stockQuantity: v.number(),
    alertThreshold: v.number(),
    updatedAt: v.number(),
  }),

  // Ventes
  sales: defineTable({
    date: v.number(),
    quantity: v.number(),
    unitPrice: v.number(),
    total: v.number(),
    paymentMethod: v.union(v.literal("cash"), v.literal("mobile_money")),
    userId: v.string(),
    userName: v.string(),
  }).index("by_date", ["date"])
    .index("by_user", ["userId"]),

  // Mouvements de stock
  stockMovements: defineTable({
    date: v.number(),
    type: v.union(v.literal("in"), v.literal("out"), v.literal("adjustment")),
    quantity: v.number(),
    reason: v.string(),
    userId: v.string(),
    userName: v.string(),
    previousStock: v.number(),
    newStock: v.number(),
  }).index("by_date", ["date"]),

  // Utilisateurs (synchronisé avec Clerk)
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("admin"), v.literal("manager"), v.literal("cashier")),
    createdAt: v.number(),
  }).index("by_clerk_id", ["clerkId"]),
});
```

---

### Étape 2.6 : Fonctions Convex de base

**Créer `convex/users.ts`**:
```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Récupérer ou créer l'utilisateur courant
export const getOrCreateUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Non authentifié");
    }

    // Chercher l'utilisateur existant
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (existingUser) {
      return existingUser;
    }

    // Créer un nouvel utilisateur (premier = admin, autres = cashier)
    const allUsers = await ctx.db.query("users").collect();
    const role = allUsers.length === 0 ? "admin" : "cashier";

    const userId = await ctx.db.insert("users", {
      clerkId: identity.subject,
      email: identity.email ?? "",
      name: identity.name ?? identity.email ?? "Utilisateur",
      role,
      createdAt: Date.now(),
    });

    return await ctx.db.get(userId);
  },
});

// Récupérer l'utilisateur courant
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
  },
});

// Lister tous les utilisateurs (admin seulement)
export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Non authentifié");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser || currentUser.role !== "admin") {
      throw new Error("Non autorisé");
    }

    return await ctx.db.query("users").collect();
  },
});

// Modifier le rôle d'un utilisateur (admin seulement)
export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    newRole: v.union(v.literal("admin"), v.literal("manager"), v.literal("cashier")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Non authentifié");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser || currentUser.role !== "admin") {
      throw new Error("Non autorisé");
    }

    await ctx.db.patch(args.userId, { role: args.newRole });
  },
});
```

---

### Étape 2.7 : Tester l'authentification

**Modifier `src/App.tsx`**:
```tsx
import { SignInButton, SignOutButton, useUser } from '@clerk/clerk-react'
import { Authenticated, Unauthenticated, AuthLoading, useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { useEffect } from 'react'

function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <AuthLoading>
        <div className="text-gray-500">Chargement...</div>
      </AuthLoading>

      <Unauthenticated>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-primary mb-4">PDV Locagri</h1>
          <SignInButton mode="modal">
            <button className="bg-primary text-white px-6 py-3 rounded-lg text-lg">
              Se connecter
            </button>
          </SignInButton>
        </div>
      </Unauthenticated>

      <Authenticated>
        <AuthenticatedContent />
      </Authenticated>
    </div>
  )
}

function AuthenticatedContent() {
  const { user } = useUser()
  const getOrCreateUser = useMutation(api.users.getOrCreateUser)
  const currentUser = useQuery(api.users.getCurrentUser)

  useEffect(() => {
    // Créer/récupérer l'utilisateur Convex à la connexion
    getOrCreateUser()
  }, [getOrCreateUser])

  return (
    <div className="text-center">
      <h1 className="text-2xl font-bold text-primary mb-2">PDV Locagri</h1>
      <p className="text-gray-600 mb-2">Bienvenue, {user?.firstName || user?.emailAddresses[0].emailAddress}</p>
      {currentUser && (
        <p className="text-sm text-gray-500 mb-4">Rôle: {currentUser.role}</p>
      )}
      <SignOutButton>
        <button className="bg-gray-200 text-gray-700 px-4 py-2 rounded">
          Se déconnecter
        </button>
      </SignOutButton>
    </div>
  )
}

export default App
```

**Lancer le projet**:
```bash
npm run dev
```

**Test**: Vérifier que:
1. La page de connexion s'affiche
2. L'inscription/connexion fonctionne
3. Le premier utilisateur devient "admin"
4. Les utilisateurs suivants sont "cashier"

---

## PHASE 3 : Module Caisse (MVP)

### Étape 3.1 : Fonctions Convex pour les produits et ventes

**Créer `convex/products.ts`**:
```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Récupérer le produit (unique)
export const getProduct = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const products = await ctx.db.query("products").collect();
    return products[0] ?? null;
  },
});

// Initialiser le produit (admin)
export const initProduct = mutation({
  args: {
    name: v.string(),
    price: v.number(),
    stockQuantity: v.number(),
    alertThreshold: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non authentifié");

    // Vérifier qu'aucun produit n'existe
    const existing = await ctx.db.query("products").collect();
    if (existing.length > 0) {
      throw new Error("Le produit existe déjà");
    }

    return await ctx.db.insert("products", {
      ...args,
      updatedAt: Date.now(),
    });
  },
});

// Mettre à jour le prix (admin)
export const updatePrice = mutation({
  args: {
    productId: v.id("products"),
    price: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non authentifié");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "admin") {
      throw new Error("Non autorisé");
    }

    await ctx.db.patch(args.productId, {
      price: args.price,
      updatedAt: Date.now(),
    });
  },
});
```

**Créer `convex/sales.ts`**:
```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Créer une vente
export const createSale = mutation({
  args: {
    quantity: v.number(),
    paymentMethod: v.union(v.literal("cash"), v.literal("mobile_money")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non authentifié");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("Utilisateur non trouvé");

    // Récupérer le produit
    const products = await ctx.db.query("products").collect();
    const product = products[0];
    if (!product) throw new Error("Produit non configuré");

    // Vérifier le stock
    if (product.stockQuantity < args.quantity) {
      throw new Error("Stock insuffisant");
    }

    const total = product.price * args.quantity;
    const now = Date.now();

    // Créer la vente
    const saleId = await ctx.db.insert("sales", {
      date: now,
      quantity: args.quantity,
      unitPrice: product.price,
      total,
      paymentMethod: args.paymentMethod,
      userId: user.clerkId,
      userName: user.name,
    });

    // Mettre à jour le stock
    const newStock = product.stockQuantity - args.quantity;
    await ctx.db.patch(product._id, {
      stockQuantity: newStock,
      updatedAt: now,
    });

    // Enregistrer le mouvement de stock
    await ctx.db.insert("stockMovements", {
      date: now,
      type: "out",
      quantity: args.quantity,
      reason: "Vente",
      userId: user.clerkId,
      userName: user.name,
      previousStock: product.stockQuantity,
      newStock,
    });

    return saleId;
  },
});

// Récupérer les ventes du jour
export const getTodaySales = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) return [];

    // Début du jour (minuit)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfDay = today.getTime();

    const sales = await ctx.db
      .query("sales")
      .withIndex("by_date")
      .filter((q) => q.gte(q.field("date"), startOfDay))
      .collect();

    // Filtrer par utilisateur si c'est un caissier
    if (user.role === "cashier") {
      return sales.filter((s) => s.userId === user.clerkId);
    }

    return sales;
  },
});

// Statistiques du jour
export const getTodayStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfDay = today.getTime();

    const sales = await ctx.db
      .query("sales")
      .withIndex("by_date")
      .filter((q) => q.gte(q.field("date"), startOfDay))
      .collect();

    const totalAmount = sales.reduce((sum, s) => sum + s.total, 0);
    const totalQuantity = sales.reduce((sum, s) => sum + s.quantity, 0);
    const cashSales = sales.filter((s) => s.paymentMethod === "cash");
    const mobileSales = sales.filter((s) => s.paymentMethod === "mobile_money");

    return {
      salesCount: sales.length,
      totalAmount,
      totalQuantity,
      cashAmount: cashSales.reduce((sum, s) => sum + s.total, 0),
      mobileAmount: mobileSales.reduce((sum, s) => sum + s.total, 0),
    };
  },
});
```

---

### Étape 3.2 : Composant de Caisse (Interface Tactile)

**Créer `src/components/sales/CashRegister.tsx`**:
```tsx
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

export function CashRegister() {
  const [quantity, setQuantity] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mobile_money'>('cash')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const product = useQuery(api.products.getProduct)
  const createSale = useMutation(api.sales.createSale)
  const todayStats = useQuery(api.sales.getTodayStats)
  const { toast } = useToast()

  const handleQuantityChange = (delta: number) => {
    const newQty = quantity + delta
    if (newQty >= 1 && newQty <= (product?.stockQuantity ?? 1)) {
      setQuantity(newQty)
    }
  }

  const handleSale = async () => {
    if (!product) return

    setIsSubmitting(true)
    try {
      await createSale({ quantity, paymentMethod })
      toast({
        title: "Vente enregistrée",
        description: `${quantity} sac(s) - ${(product.price * quantity).toLocaleString()} FCFA`,
      })
      setQuantity(1)
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!product) {
    return (
      <Card className="max-w-md mx-auto mt-8">
        <CardContent className="pt-6 text-center text-gray-500">
          Produit non configuré. Contactez l'administrateur.
        </CardContent>
      </Card>
    )
  }

  const total = product.price * quantity
  const isLowStock = product.stockQuantity <= product.alertThreshold

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      {/* Info Stock */}
      <Card className={isLowStock ? 'border-orange-400 bg-orange-50' : ''}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{product.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between text-sm">
            <span>Stock:</span>
            <span className={isLowStock ? 'text-orange-600 font-bold' : ''}>
              {product.stockQuantity} sacs
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Prix unitaire:</span>
            <span className="font-semibold">{product.price.toLocaleString()} FCFA</span>
          </div>
        </CardContent>
      </Card>

      {/* Sélection Quantité */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-6">
            <Button
              variant="outline"
              size="lg"
              className="h-16 w-16 text-2xl"
              onClick={() => handleQuantityChange(-1)}
              disabled={quantity <= 1}
            >
              -
            </Button>
            <div className="text-center">
              <div className="text-4xl font-bold">{quantity}</div>
              <div className="text-sm text-gray-500">sac(s)</div>
            </div>
            <Button
              variant="outline"
              size="lg"
              className="h-16 w-16 text-2xl"
              onClick={() => handleQuantityChange(1)}
              disabled={quantity >= product.stockQuantity}
            >
              +
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Mode de Paiement */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant={paymentMethod === 'cash' ? 'default' : 'outline'}
          className="h-14 text-lg"
          onClick={() => setPaymentMethod('cash')}
        >
          Espèces
        </Button>
        <Button
          variant={paymentMethod === 'mobile_money' ? 'default' : 'outline'}
          className="h-14 text-lg"
          onClick={() => setPaymentMethod('mobile_money')}
        >
          Mobile Money
        </Button>
      </div>

      {/* Total et Validation */}
      <Card className="bg-primary text-white">
        <CardContent className="pt-6">
          <div className="text-center mb-4">
            <div className="text-sm opacity-80">Total</div>
            <div className="text-3xl font-bold">{total.toLocaleString()} FCFA</div>
          </div>
          <Button
            className="w-full h-14 text-lg bg-white text-primary hover:bg-gray-100"
            onClick={handleSale}
            disabled={isSubmitting || product.stockQuantity < quantity}
          >
            {isSubmitting ? 'Enregistrement...' : 'VALIDER LA VENTE'}
          </Button>
        </CardContent>
      </Card>

      {/* Stats du jour */}
      {todayStats && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Aujourd'hui</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Ventes: {todayStats.salesCount}</div>
              <div>Sacs: {todayStats.totalQuantity}</div>
              <div>Espèces: {todayStats.cashAmount.toLocaleString()}</div>
              <div>Mobile: {todayStats.mobileAmount.toLocaleString()}</div>
            </div>
            <div className="mt-2 pt-2 border-t font-semibold">
              Total: {todayStats.totalAmount.toLocaleString()} FCFA
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

---

### Étape 3.3 : Layout et Navigation

**Créer `src/components/layout/AppLayout.tsx`**:
```tsx
import { ReactNode } from 'react'
import { SignOutButton } from '@clerk/clerk-react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const currentUser = useQuery(api.users.getCurrentUser)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">PDV Locagri</h1>
        <div className="flex items-center gap-3">
          {currentUser && (
            <span className="text-sm opacity-80">
              {currentUser.name} ({currentUser.role})
            </span>
          )}
          <SignOutButton>
            <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/20">
              Déconnexion
            </Button>
          </SignOutButton>
        </div>
      </header>

      {/* Navigation (pour Manager/Admin) */}
      {currentUser && currentUser.role !== 'cashier' && (
        <nav className="bg-white border-b px-4 py-2 flex gap-2">
          <Button variant="ghost" size="sm">Caisse</Button>
          <Button variant="ghost" size="sm">Stock</Button>
          <Button variant="ghost" size="sm">Rapports</Button>
          {currentUser.role === 'admin' && (
            <Button variant="ghost" size="sm">Admin</Button>
          )}
        </nav>
      )}

      {/* Contenu */}
      <main className="pb-20">
        {children}
      </main>
    </div>
  )
}
```

---

## PHASE 4 : Modules Stock & Rapports

### Étape 4.1 : Fonctions Stock

**Créer `convex/stock.ts`**:
```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Ajouter du stock (entrée)
export const addStock = mutation({
  args: {
    quantity: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non authentifié");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role === "cashier") {
      throw new Error("Non autorisé");
    }

    const products = await ctx.db.query("products").collect();
    const product = products[0];
    if (!product) throw new Error("Produit non configuré");

    const newStock = product.stockQuantity + args.quantity;
    const now = Date.now();

    // Mettre à jour le stock
    await ctx.db.patch(product._id, {
      stockQuantity: newStock,
      updatedAt: now,
    });

    // Enregistrer le mouvement
    await ctx.db.insert("stockMovements", {
      date: now,
      type: "in",
      quantity: args.quantity,
      reason: args.reason,
      userId: user.clerkId,
      userName: user.name,
      previousStock: product.stockQuantity,
      newStock,
    });
  },
});

// Historique des mouvements
export const getStockHistory = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role === "cashier") {
      return [];
    }

    let query = ctx.db.query("stockMovements").withIndex("by_date").order("desc");

    const movements = await query.collect();
    return args.limit ? movements.slice(0, args.limit) : movements;
  },
});
```

---

### Étape 4.2 : Module Rapports (à implémenter)

Les rapports utilisent les mêmes queries avec filtres par période.

---

## PHASE 5 : Administration

### Étape 5.1 : Page Admin

Utiliser `convex/users.ts` déjà créé pour:
- Lister les utilisateurs
- Modifier les rôles
- Modifier le prix du produit

---

## Checklist de Validation

### Phase 1
- [ ] Projet Vite créé
- [ ] Tailwind fonctionne
- [ ] shadcn/ui initialisé
- [ ] Structure des dossiers créée

### Phase 2
- [ ] Convex initialisé (`npx convex dev` fonctionne)
- [ ] Clerk configuré (connexion fonctionne)
- [ ] JWT Template "convex" créé
- [ ] auth.config.ts configuré
- [ ] Premier utilisateur = admin automatique

### Phase 3
- [ ] Produit peut être créé (admin)
- [ ] Vente fonctionne
- [ ] Stock se met à jour
- [ ] Stats du jour affichées

### Phase 4
- [ ] Entrées de stock fonctionnent
- [ ] Historique des mouvements
- [ ] Rapports avec filtres

### Phase 5
- [ ] Liste des utilisateurs
- [ ] Modification des rôles
- [ ] Configuration du prix

---

## Points d'Attention Critiques

### Configuration Clerk + Convex

| Étape | Action | Où |
|-------|--------|-----|
| 1 | Créer JWT Template "convex" | Clerk Dashboard > JWT Templates |
| 2 | Copier Issuer URL | Clerk Dashboard |
| 3 | Ajouter CLERK_JWT_ISSUER_DOMAIN | Convex Dashboard > Settings > Env Vars |
| 4 | Créer auth.config.ts | `convex/auth.config.ts` |
| 5 | Ordre des Providers | ClerkProvider > ConvexProviderWithClerk |

### Erreurs Courantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| "Unauthenticated" | JWT non configuré | Vérifier JWT Template Clerk |
| "Missing env var" | .env.local manquant | Créer le fichier avec les clés |
| Stock négatif | Race condition | Utiliser mutations atomiques |

---

*Workflow généré le 27/01/2026 - Prêt pour implémentation*
