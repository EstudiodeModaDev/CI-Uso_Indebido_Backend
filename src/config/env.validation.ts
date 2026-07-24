import * as Joi from "joi";

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "test", "production")
    .default("development"),

  PORT: Joi.number().port().default(3000),

  API_PREFIX: Joi.string().default("api"),

  FRONTEND_URL: Joi.string().uri().required(),

  SUPABASE_URL: Joi.string().uri().required(),

  SUPABASE_SECRET_KEY: Joi.string().min(20).required(),

  OTP_SECRET: Joi.string().min(32).required(),
  OTP_ENCRYPTION_KEY: Joi.string()
    .length(64)
    .pattern(/^[0-9a-fA-F]+$/)
    .required(),
  OTP_EXPIRATION_MINUTES: Joi.number()
    .integer()
    .min(1)
    .max(30)
    .default(5),
  OTP_MAX_ATTEMPTS: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(5),

  EMAIL_PROVIDER: Joi.string()
    .valid("console", "graph")
    .default("console"),

  GRAPH_TENANT_ID: Joi.when("EMAIL_PROVIDER", {
    is: "graph",
    then: Joi.string().required(),
    otherwise: Joi.string().allow("").optional(),
  }),

  GRAPH_CLIENT_ID: Joi.when("EMAIL_PROVIDER", {
    is: "graph",
    then: Joi.string().required(),
    otherwise: Joi.string().allow("").optional(),
  }),

  GRAPH_CLIENT_SECRET: Joi.when("EMAIL_PROVIDER", {
    is: "graph",
    then: Joi.string().required(),
    otherwise: Joi.string().allow("").optional(),
  }),

  GRAPH_MAIL_SENDER: Joi.when("EMAIL_PROVIDER", {
    is: "graph",
    then: Joi.string().email().required(),
    otherwise: Joi.string().allow("").optional(),
  }),
});
