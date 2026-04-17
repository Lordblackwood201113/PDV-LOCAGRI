// Configuration de l'authentification Convex avec Clerk
// Le domain doit correspondre à l'Issuer URL du JWT Template "convex" dans Clerk

const authConfig = {
  providers: [
    {
      // L'URL de l'issuer Clerk - configurée dans Convex Dashboard > Settings > Environment Variables
      // Format: https://votre-app.clerk.accounts.dev
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      // Doit correspondre au nom du JWT Template dans Clerk
      applicationID: "convex",
    },
  ],
};

export default authConfig;
