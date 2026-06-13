// Configuration de l'authentification Convex avec Clerk
// Le domain doit correspondre à l'Issuer URL du JWT Template "convex" dans Clerk

const authConfig = {
  providers: [
    {
      // L'URL de l'issuer Clerk (production) - variable d'environnement du backend Convex
      // Format: https://clerk.votre-domaine.com
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      // Doit correspondre au nom du JWT Template dans Clerk
      applicationID: "convex",
    },
    // Issuer Clerk de développement (optionnel) - permet de tester en local
    // avec les clés pk_test, car les clés pk_live sont bloquées sur localhost
    ...(process.env.CLERK_JWT_ISSUER_DOMAIN_DEV
      ? [
          {
            domain: process.env.CLERK_JWT_ISSUER_DOMAIN_DEV,
            applicationID: "convex",
          },
        ]
      : []),
  ],
};

export default authConfig;
