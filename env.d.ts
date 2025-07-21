/// <reference types="vite/client" />
/// <reference types="@remix-run/node" />

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Shopify App Configuration
      SHOPIFY_API_KEY: string;
      SHOPIFY_API_SECRET: string;
      SHOPIFY_APP_URL: string;
      SCOPES: string;
      SHOP_CUSTOM_DOMAIN?: string;
      
      // AI Customer Support Configuration
      OPENAI_API_KEY: string;
      
      // Gmail API Configuration
      GMAIL_CLIENT_ID: string;
      GMAIL_CLIENT_SECRET: string;
      GMAIL_REDIRECT_URI: string;
      GMAIL_REFRESH_TOKEN: string;
      
      // ChromaDB Configuration
      CHROMADB_URL?: string;
      CHROMADB_COLLECTION_NAME?: string;
      
      // General Configuration
      NODE_ENV: "development" | "production" | "test";
      PORT?: string;
      FRONTEND_PORT?: string;
      HOST?: string;
      
      // Database
      DATABASE_URL?: string;
      
      // Security
      ENCRYPTION_KEY: string;
    }
  }
}

export {}
