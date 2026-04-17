import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider, useAuth } from '@clerk/clerk-react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { ConvexReactClient } from 'convex/react'
import App from './App.tsx'
import './index.css'

// ============================================
// Configuration des variables d'environnement
// ============================================

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL

// Validation en développement
if (!PUBLISHABLE_KEY) {
  throw new Error(
    'VITE_CLERK_PUBLISHABLE_KEY manquant.\n' +
    'Créez un fichier .env.local avec votre clé Clerk.\n' +
    'Voir .env.example pour le format.'
  )
}

if (!CONVEX_URL) {
  throw new Error(
    'VITE_CONVEX_URL manquant.\n' +
    'Exécutez `npx convex dev` pour initialiser Convex.\n' +
    'Voir .env.example pour le format.'
  )
}

// ============================================
// Initialisation du client Convex
// ============================================

const convex = new ConvexReactClient(CONVEX_URL)

// ============================================
// Rendu de l'application
// ============================================

// IMPORTANT: L'ordre des providers est critique
// ClerkProvider DOIT envelopper ConvexProviderWithClerk

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      appearance={{
        // Personnalisation du thème Clerk pour correspondre au design PDV
        variables: {
          colorPrimary: '#1B4332',
          colorText: '#1F2937',
          colorBackground: '#FFFFFF',
          colorInputBackground: '#F8F9FA',
          borderRadius: '0.625rem',
        },
        elements: {
          formButtonPrimary: {
            backgroundColor: '#1B4332',
            '&:hover': {
              backgroundColor: '#0D2818',
            },
          },
        },
      }}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <App />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  </StrictMode>,
)
