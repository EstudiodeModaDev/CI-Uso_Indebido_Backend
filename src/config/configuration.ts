export interface AppConfiguration {
  app: {
    environment: string;
    port: number;
    apiPrefix: string;
    frontendUrl: string;
  };

  supabase: {
    url: string;
    secretKey: string;
  };

  otp: {
    secret: string;
    encryptionKey: string;
    expirationMinutes: number;
    maxAttempts: number;
  };

  email: {
    provider: "console" | "graph";
  };

  graph: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    sender: string;
  };
}

export default (): AppConfiguration => ({
  app: {
    environment: process.env.NODE_ENV ?? "development",
    port: Number(process.env.PORT ?? 3000),
    apiPrefix: process.env.API_PREFIX ?? "api",
    frontendUrl:
      process.env.FRONTEND_URL ?? "http://localhost:5173",
  },

  supabase: {
    url: process.env.SUPABASE_URL ?? "",
    secretKey: process.env.SUPABASE_SECRET_KEY ?? "",
  },

  otp: {
    secret: process.env.OTP_SECRET ?? "",
    encryptionKey:
      process.env.OTP_ENCRYPTION_KEY ?? "",
    expirationMinutes: Number(
      process.env.OTP_EXPIRATION_MINUTES ?? 5,
    ),
    maxAttempts: Number(
      process.env.OTP_MAX_ATTEMPTS ?? 5,
    ),
  },

  email: {
    provider:
      process.env.EMAIL_PROVIDER === "graph"
        ? "graph"
        : "console",
  },

  graph: {
    tenantId: process.env.GRAPH_TENANT_ID ?? "",
    clientId: process.env.GRAPH_CLIENT_ID ?? "",
    clientSecret:
      process.env.GRAPH_CLIENT_SECRET ?? "",
    sender: process.env.GRAPH_MAIL_SENDER ?? "",
  },
});
