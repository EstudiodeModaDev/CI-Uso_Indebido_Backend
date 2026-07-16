# Arquitectura API — Gestión de Descuentos de Empleados y Socios

---

## 1. Resumen de la arquitectura

Backend NestJS (TypeScript) desplegado en Render, actuando como capa de dominio y seguridad sobre una base de datos PostgreSQL en Supabase. Supabase Auth gestiona identidad y emisión de JWT; el backend **nunca** confía en el rol/claims que llegan desde el frontend, sino que los resuelve siempre contra las tablas `USUARIOS` / `USUARIOS_ROLES` usando la `service_role key` (que jamás sale del servidor).

Principios rectores:

- **Backend como única fuente de verdad para autorización.** React solo usa Supabase Auth para login; toda decisión de "qué puede hacer este usuario" se resuelve en NestJS.
- **Arquitectura modular por dominio** (no por capa técnica transversal), con `common/` para cross-cutting concerns.
- **Repository pattern** para desacoplar la lógica de negocio del cliente de datos concreto (Supabase JS client con `service_role`, ejecutando contra PostgreSQL).
- **OTP nunca en texto plano**, nunca retornado por HTTP, con expiración dura, límite de intentos y rate limiting.
- **Trazabilidad total**: generación, envío, redención y errores quedan auditados.
- **Sincronización idempotente** con sistemas externos (YOU y terceros), tolerante a fallos parciales.

---

## 2. Diagrama textual de componentes

```
┌─────────────────────┐        ┌──────────────────────────────────────────┐
│   React + Vite       │        │              Render (NestJS)              │
│  (Frontend SPA)       │        │                                            │
│                        │  JWT   │  ┌───────────┐   ┌─────────────────────┐ │
│  Supabase Auth SDK ────┼───────►│  │ AuthGuard │──►│ RolesGuard           │ │
│  (login, session)      │        │  └─────┬─────┘   └──────────┬──────────┘ │
│                        │        │        ▼                    ▼            │
└──────────┬─────────────┘        │  ┌───────────────────────────────────┐   │
           │                       │  │ Controllers (Persons/Otp/Stores/  │   │
           │ HTTPS (Bearer JWT)    │  │ Reports/Health)                   │   │
           └──────────────────────►│  └─────────────┬─────────────────────┘   │
                                    │                ▼                          │
                                    │  ┌───────────────────────────────────┐   │
                                    │  │ Services (lógica de dominio)      │   │
                                    │  └─────────────┬─────────────────────┘   │
                                    │                ▼                          │
                                    │  ┌───────────────────────────────────┐   │
                                    │  │ Repositories (Supabase client,     │   │
                                    │  │ service_role)                      │   │
                                    │  └─────────────┬─────────────────────┘   │
                                    │                │                          │
                                    │  ┌─────────────┼───────────────┐         │
                                    │  │ EmailsModule │ AuditModule   │         │
                                    │  │ (MS Graph)   │ (LOG)         │         │
                                    │  └──────────────┴───────────────┘         │
                                    │                                            │
                                    │  ┌───────────────────────────────────┐   │
                                    │  │ SynchronizationModule (Cron)      │───┼──► YOU DB
                                    │  └───────────────────────────────────┘   │──► Terceros DB
                                    └───────────────────┬────────────────────────┘
                                                         ▼
                                          ┌───────────────────────────┐
                                          │  Supabase PostgreSQL        │
                                          │  (PERSONAS, USUARIOS,       │
                                          │  CODIGOS_OTP, TIENDAS, ...)  │
                                          │  auth.users (Supabase Auth) │
                                          └───────────────────────────┘
```

---

## 3. Flujo de autenticación

1. React inicia sesión contra Supabase Auth (`supabase.auth.signInWithPassword`). El backend no participa aquí.
2. React adjunta el `access_token` (JWT) de Supabase en cada request al backend: `Authorization: Bearer <token>`.
3. `SupabaseAuthGuard` (global o por ruta) intercepta la request:
   a. Extrae el token del header.
   b. Verifica firma y expiración contra la clave pública/JWKS de Supabase (o usando `supabase.auth.getUser(token)` con el cliente admin).
   c. Obtiene `sub` (auth `user_id`) y `email` del JWT.
4. `AuthService.resolveCurrentUser(authUserId)`:
   a. Busca en `USUARIOS` por `auth_user_id`.
   b. Verifica `estado = ACTIVO`. Si no existe o está inactivo → `401/403 USER_INACTIVE`.
   c. Carga roles desde `USUARIOS_ROLES` + `ROLES`.
   d. Construye un objeto `CurrentUser { id, authUserId, email, personId?, roles[] }`.
5. El resultado se adjunta a `request.user` mediante el guard; el decorador `@CurrentUser()` lo expone a los controllers.
6. `RolesGuard` (aplicado con `@Roles('TIENDA', 'CONTROL_INTERNO', ...)`) valida que alguno de los roles resueltos en el paso 4 coincida con los permitidos en el endpoint. Este guard nunca lee roles del body/query — solo de `request.user` ya resuelto por el backend.

**Importante:** el rol nunca se acepta como parámetro de entrada; siempre se deriva de la base de datos.

---

## 4. Flujo de consulta de persona

1. `GET /persons/:document`, requiere rol `TIENDA` o `CONTROL_INTERNO` (guard).
2. `PersonsController` delega en `PersonsService.findActiveByDocument(document, currentUser)`.
3. `PersonsService`:
   a. Valida formato de documento (DTO/pipe).
   b. Llama a `PersonsRepository.findActiveByDocument(document)`.
   c. Si no existe o `estado != ACTIVO` → excepción de dominio `PersonNotFoundOrInactiveException` (404).
   d. Mapea la entidad a un DTO de respuesta reducido (nombre, documento, correo, teléfono, tipo, estado) — nunca expone campos sensibles adicionales (ej. IDs internos de auth, otros documentos, etc.).
4. `AuditService.log('PERSON_LOOKUP', ...)` registra la consulta (usuario que consultó, documento consultado, tienda) — sin datos sensibles extra.
5. Se retorna el DTO al frontend.

---

## 5. Flujo de generación de OTP

1. `POST /otp/generate`, rol `TIENDA`.
2. Body: `{ document: string, purchaseValue?: number }` (el valor de compra puede registrarse en generación o en redención según regla de negocio — se recomienda capturarlo en redención, ver DTOs).
3. `OtpController` → `OtpService.generate(document, currentUser)`.
4. `StoresService.resolveCurrentStore(currentUser.email)`:
   - Busca en `TIENDAS` por correo == email de sesión.
   - Valida `estado = ACTIVA`.
   - Nunca acepta un `storeId` del body — se resuelve siempre server-side.
5. `PersonsService.findActiveByDocument(document)` — igual que el flujo 4, reutilizado internamente.
6. `OtpService`:
   a. Invalida (marca `ANULADO`) cualquier OTP `PENDIENTE` previo y no vencido de esa persona (evita múltiples códigos válidos simultáneos).
   b. Aplica rate limiting (ver sección Seguridad) por persona y por tienda.
   c. Genera código de 6 dígitos con CSPRNG (`crypto.randomInt(0, 1000000)`, padded).
   d. Calcula `hash = HMAC-SHA256(otpCode, OTP_SECRET)` (nunca `bcrypt` puro para 6 dígitos — ver justificación en sección OTP).
   e. Inserta en `CODIGOS_OTP`: hash, `persona_id`, `tienda_generacion_id`, `fecha_generacion`, `fecha_expiracion = now() + 5 min`, `estado = PENDIENTE`, `intentos = 0`.
7. `EmailsModule.send(EmailPayload)`:
   a. Envía el código (texto plano, solo por este canal) al correo de la persona vía Microsoft Graph.
   b. Registra el intento en `ENVIOS_CORREO` (éxito/error, proveedor, intentos, fecha) **siempre**, incluso si el envío falla.
   c. Si falla el envío, el OTP queda igualmente registrado y trazable en `CODIGOS_OTP` (estado `PENDIENTE`) y en `ENVIOS_CORREO` (estado `FALLIDO`), permitiendo reintento manual o automático — nunca se pierde trazabilidad de un OTP generado.
8. `AuditService.log('OTP_GENERATED', ...)`.
9. Respuesta al frontend: **sin el código**, solo confirmación (`{ success: true, expiresAt, maskedEmail }`).

---

## 6. Flujo de validación y redención

Se separan intencionalmente `validate` (verificar sin consumir) y `redeem` (consumir definitivamente), porque la tienda suele querer confirmar el código antes de cerrar la venta con el valor de compra.

### Validación (`POST /otp/validate`)
1. Rol `TIENDA`.
2. Body: `{ document: string, code: string }`.
3. `OtpService.validate`:
   a. Resuelve tienda autenticada (igual que generación).
   b. Busca OTP `findValidOtp({ personDocument, storeId })` → trae el OTP `PENDIENTE` más reciente y no vencido para esa persona.
   c. Si no hay ninguno → `OTP_NOT_FOUND` (404).
   d. Si `fecha_expiracion < now()` → marca `EXPIRADO` y responde `OTP_EXPIRED` (400).
   e. Si `intentos >= OTP_MAX_ATTEMPTS` → marca `BLOQUEADO` y responde `OTP_MAX_ATTEMPTS_REACHED` (429).
   f. Calcula `HMAC-SHA256(code, OTP_SECRET)` y compara en tiempo constante (`crypto.timingSafeEqual`) contra el hash almacenado.
   g. Si no coincide → incrementa `intentos`, responde `OTP_INVALID` (400).
   h. Si coincide → responde `valid: true` **sin cambiar el estado a redimido todavía** (permite mostrar al cajero "código válido" antes de cobrar).
4. Se audita cada intento (éxito/fallo) sin registrar el código en texto plano.

### Redención (`POST /otp/redeem`)
1. Rol `TIENDA`.
2. Body: `{ document: string, code: string, purchaseValue: number }`.
3. Repite la validación anterior (nunca confiar en que el frontend ya validó) dentro de una transacción.
4. Si válido: `markAsRedeemed({ otpId, storeIdRedeem, purchaseValue, redeemedAt: now() })` → estado `REDIMIDO`, un solo `UPDATE` atómico condicionado a `estado = PENDIENTE` (evita doble redención por condición de carrera; ver "Prevención de reutilización" en Seguridad).
5. Si el `UPDATE` afecta 0 filas (porque otro request lo redimió primero) → `OTP_ALREADY_REDEEMED` (409).
6. Audita `OTP_REDEEMED` con tienda de generación, tienda de redención, valor de compra.

---

## 7. Flujo de reporte de uso indebido

1. `POST /otp/reports` (o `/reports`), rol `EMPLEADO`, `SOCIO` (reporta sobre sí mismo) o `CONTROL_INTERNO`.
2. Body: `{ otpId? , document, description, type: 'NO_SOLICITADO' | 'USO_SOSPECHOSO' }`.
3. `ReportsService`:
   a. Verifica que el OTP (si se referencia) pertenezca a la persona autenticada/reportante o que quien reporta sea `CONTROL_INTERNO`.
   b. Inserta en `REPORTES_USO_INDEBIDO` con estado `ABIERTO`, fecha, referencia a persona/otp.
4. `AuditService.log('MISUSE_REPORTED', ...)`.
5. `CONTROL_INTERNO` puede consultarlos vía `GET /admin/reports` (con filtros de estado/fecha) y actualizar su estado (`GESTIONADO`, `DESCARTADO`) por un endpoint adicional `PATCH /admin/reports/:id`.

---

## 8. Flujo de sincronización

1. Cron job (`@nestjs/schedule`, `@Cron('0 */6 * * *')` configurable) ejecuta `SynchronizationService.run()`.
2. Antes de iniciar, crea un registro en `EJECUCIONES_SINCRONIZACION` con estado `EN_PROGRESO`, `fecha_inicio`.
3. Se conecta (vía repositorio dedicado, credenciales de solo lectura si es posible) a la base **YOU** y a la de **terceros**.
4. Estrategia de idempotencia y no duplicación:
   a. Cada persona externa se identifica por una clave natural estable (documento + tipo de documento).
   b. `UPSERT` (`INSERT ... ON CONFLICT (documento, tipo_documento) DO UPDATE`) en `PERSONAS`, nunca `INSERT` ciego.
   c. Se procesa en lotes (paginado) para no cargar todo en memoria y poder reanudar tras fallo parcial.
   d. Cada lote se procesa en su propia transacción corta; un fallo en un lote no revierte los lotes ya confirmados (se registra qué lotes fallaron para reintento selectivo).
5. Al finalizar (éxito total, éxito parcial o fallo):
   - Actualiza el registro de `EJECUCIONES_SINCRONIZACION`: `fecha_fin`, `estado` (`EXITOSA` / `PARCIAL` / `FALLIDA`), `registros_procesados`, `registros_error`, `detalle_error` (resumen, no stacktrace completo con datos sensibles).
6. `AuditService`/`LOG` registra errores individuales de fila si aplica (sin bloquear el resto del lote).
7. El endpoint de sincronización manual (si existe, para reintentos) se protege con `SYNC_SECRET` o rol interno, nunca expuesto a React.
8. **Nunca se asume éxito total**: el servicio siempre debe poder responder "qué pasó" a partir de `EJECUCIONES_SINCRONIZACION`, incluso ante caída del proceso (guardar progreso incremental o al menos el resultado por lote).

---

## 9. Estructura completa de carpetas

```text
src/
├── main.ts
├── app.module.ts
├── config/
│   ├── configuration.ts          # carga y tipa variables de entorno
│   ├── env.validation.ts         # validación de env con Zod/Joi al boot
│   └── supabase.config.ts
├── common/
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   └── roles.decorator.ts
│   ├── guards/
│   │   ├── supabase-auth.guard.ts
│   │   └── roles.guard.ts
│   ├── filters/
│   │   └── all-exceptions.filter.ts
│   ├── interceptors/
│   │   ├── logging.interceptor.ts
│   │   └── timeout.interceptor.ts
│   ├── exceptions/
│   │   ├── domain.exception.ts
│   │   └── error-codes.ts
│   ├── pipes/
│   │   └── trim.pipe.ts
│   ├── middleware/
│   │   └── request-id.middleware.ts
│   └── types/
│       └── current-user.type.ts
├── database/
│   └── supabase-client.provider.ts   # provider único del SupabaseClient (service_role)
├── auth/
│   ├── auth.module.ts
│   ├── auth.service.ts
│   └── strategies/
│       └── supabase-jwt.strategy.ts
├── users/
│   ├── users.module.ts
│   ├── users.service.ts
│   └── repositories/
│       └── users.repository.ts
├── persons/
│   ├── persons.module.ts
│   ├── persons.controller.ts
│   ├── persons.service.ts
│   ├── dto/
│   │   └── person-response.dto.ts
│   └── repositories/
│       └── persons.repository.ts
├── stores/
│   ├── stores.module.ts
│   ├── stores.service.ts
│   └── repositories/
│       └── stores.repository.ts
├── otp/
│   ├── otp.module.ts
│   ├── otp.controller.ts
│   ├── otp.service.ts
│   ├── otp.crypto.ts              # generación/hash/compare
│   ├── dto/
│   │   ├── generate-otp.dto.ts
│   │   ├── validate-otp.dto.ts
│   │   └── redeem-otp.dto.ts
│   └── repositories/
│       └── otp.repository.ts
├── reports/
│   ├── reports.module.ts
│   ├── reports.controller.ts
│   ├── reports.service.ts
│   ├── dto/
│   │   └── create-report.dto.ts
│   └── repositories/
│       └── reports.repository.ts
├── emails/
│   ├── emails.module.ts
│   ├── emails.service.ts
│   ├── interfaces/
│   │   └── email-provider.interface.ts
│   ├── providers/
│   │   ├── graph-email.provider.ts
│   │   └── smtp-email.provider.ts   # alternativa configurable
│   └── repositories/
│       └── email-logs.repository.ts
├── synchronization/
│   ├── synchronization.module.ts
│   ├── synchronization.service.ts
│   ├── synchronization.scheduler.ts
│   ├── sources/
│   │   ├── you-database.source.ts
│   │   └── third-party-database.source.ts
│   └── repositories/
│       └── sync-runs.repository.ts
├── audit/
│   ├── audit.module.ts
│   ├── audit.service.ts
│   └── repositories/
│       └── audit.repository.ts
└── health/
    ├── health.module.ts
    └── health.controller.ts
```

**Cambios respecto a la propuesta base:** se agrega `database/` (provider único del cliente Supabase inyectable, evita instanciarlo repetido por módulo) y se explicita `repositories/` dentro de cada módulo de dominio para dejar clara la separación service/repository. `users/` se mantiene delgado (solo resolución de usuario+roles, usado por `auth/`), separado de `persons/` (datos de negocio de la persona/cliente).

---

## 10. Explicación de cada módulo

- **AuthModule**: única puerta de entrada de identidad. No expone `/login`. Provee `SupabaseAuthGuard`, `RolesGuard`, `@CurrentUser()`, `@Roles()`.
- **UsersModule**: encapsula el acceso a `USUARIOS`/`USUARIOS_ROLES`. Usado solo por `AuthModule` (y por `AuditModule` para resolver nombre de usuario en logs).
- **PersonsModule**: consulta acotada y de solo lectura sobre `PERSONAS`. No permite creación/edición desde este flujo (eso lo hace la sincronización).
- **StoresModule**: resuelve identidad de tienda a partir del correo de sesión. Es el módulo que "traduce" un usuario autenticado en un `storeId` de confianza para el resto del sistema.
- **OtpModule**: núcleo transaccional del negocio. Concentra generación, validación, redención y las reglas anti-abuso.
- **ReportsModule**: gestión de `REPORTES_USO_INDEBIDO`, con vista administrativa para `CONTROL_INTERNO`.
- **EmailsModule**: abstrae el proveedor de correo (interfaz `EmailProvider`), con implementación principal por Microsoft Graph y trazabilidad en `ENVIOS_CORREO`.
- **SynchronizationModule**: job periódico + fuentes externas (YOU, terceros), con control de ejecución en `EJECUCIONES_SINCRONIZACION`.
- **AuditModule**: servicio transversal inyectado por los demás módulos para escribir en `LOG` de forma consistente (nunca cada módulo escribe directo a `LOG`).
- **HealthModule**: endpoint público (o protegido ligeramente) de verificación operativa, sin secretos.

---

## 11. Endpoints y contratos

### `GET /health`
- **Rol:** público (o `API_KEY` interna opcional para monitoreo).
- **Params/Body:** ninguno.
- **Respuesta 200:** `{ status: "ok", supabase: "ok" | "degraded", timestamp }`.
- **Errores:** `503 SERVICE_UNAVAILABLE` si falla el chequeo de Supabase.
- **Servicio:** `HealthService`. **Tablas:** ninguna (o `select 1`).

### `GET /persons/:document`
- **Rol:** `TIENDA`, `CONTROL_INTERNO`.
- **Params:** `document: string` (path).
- **Respuesta 200:** `PersonResponseDto` (nombre, documento, correo, teléfono, tipo, estado).
- **Errores:** `404 PERSON_NOT_FOUND`, `400 INVALID_DOCUMENT_FORMAT`, `401/403`.
- **Validaciones:** formato de documento vía DTO/pipe; persona debe estar `ACTIVA`.
- **Servicio:** `PersonsService.findActiveByDocument`. **Tablas:** `PERSONAS`.

### `POST /otp/generate`
- **Rol:** `TIENDA`.
- **Body:** `{ document: string }`.
- **Respuesta 201:** `{ success: true, expiresAt: string, maskedEmail: string }`.
- **Errores:** `404 PERSON_NOT_FOUND`, `403 STORE_INACTIVE`, `429 RATE_LIMIT_EXCEEDED`, `502 EMAIL_SEND_FAILED` (el OTP igual se crea, se informa degradado).
- **Validaciones:** documento válido, tienda activa, rate limit por persona/tienda.
- **Servicio:** `OtpService.generate`. **Tablas:** `PERSONAS`, `TIENDAS`, `CODIGOS_OTP`, `ENVIOS_CORREO`, `LOG`.

### `POST /otp/validate`
- **Rol:** `TIENDA`.
- **Body:** `{ document: string, code: string }`.
- **Respuesta 200:** `{ valid: true, remainingAttempts?: number }`.
- **Errores:** `404 OTP_NOT_FOUND`, `400 OTP_EXPIRED`, `400 OTP_INVALID`, `429 OTP_MAX_ATTEMPTS_REACHED`.
- **Validaciones:** código de 6 dígitos numéricos, expiración, intentos, comparación en tiempo constante.
- **Servicio:** `OtpService.validate`. **Tablas:** `PERSONAS`, `TIENDAS`, `CODIGOS_OTP`, `LOG`.

### `POST /otp/redeem`
- **Rol:** `TIENDA`.
- **Body:** `{ document: string, code: string, purchaseValue: number }`.
- **Respuesta 200:** `{ success: true, redeemedAt: string }`.
- **Errores:** `404 OTP_NOT_FOUND`, `400 OTP_EXPIRED`, `400 OTP_INVALID`, `409 OTP_ALREADY_REDEEMED`, `429 OTP_MAX_ATTEMPTS_REACHED`.
- **Validaciones:** iguales a validate + `purchaseValue > 0`; transacción atómica condicionada a estado `PENDIENTE`.
- **Servicio:** `OtpService.redeem`. **Tablas:** `CODIGOS_OTP`, `TIENDAS`, `LOG`.

### `GET /otp/my-codes`
- **Rol:** `EMPLEADO`, `SOCIO` (ve solo los suyos, resuelto por `personId` ligado a su usuario).
- **Params:** query opcional `?page&limit&status`.
- **Respuesta 200:** lista paginada de `OtpHistoryItemDto` (fecha generación, fecha redención, tienda generación, tienda redención, valor de compra, estado — nunca el código ni su hash).
- **Errores:** `401/403`.
- **Servicio:** `OtpService.findHistoryForCurrentUser`. **Tablas:** `CODIGOS_OTP`, `TIENDAS`.

### `GET /admin/reports`
- **Rol:** `CONTROL_INTERNO`.
- **Params:** query `?status&from&to&document`.
- **Respuesta 200:** lista paginada de reportes.
- **Errores:** `401/403`.
- **Servicio:** `ReportsService.findAll`. **Tablas:** `REPORTES_USO_INDEBIDO`, `PERSONAS`.

---

## 12. DTO principales

```ts
// otp/dto/generate-otp.dto.ts
export class GenerateOtpDto {
  @IsString()
  @Matches(/^[0-9]{5,15}$/)
  document: string;
}

// otp/dto/validate-otp.dto.ts
export class ValidateOtpDto {
  @IsString()
  @Matches(/^[0-9]{5,15}$/)
  document: string;

  @IsString()
  @Matches(/^[0-9]{6}$/)
  code: string;
}

// otp/dto/redeem-otp.dto.ts
export class RedeemOtpDto extends ValidateOtpDto {
  @IsNumber()
  @Min(0.01)
  purchaseValue: number;
}

// reports/dto/create-report.dto.ts
export class CreateReportDto {
  @IsOptional() @IsUUID()
  otpId?: string;

  @IsString()
  document: string;

  @IsEnum(ReportType)
  type: ReportType; // NO_SOLICITADO | USO_SOSPECHOSO

  @IsString() @MaxLength(500)
  description: string;
}

// persons/dto/person-response.dto.ts
export class PersonResponseDto {
  name: string;
  document: string;
  email: string;
  phone: string;
  personType: string;
  status: string;
}
```

---

## 13. Entidades o interfaces principales

```ts
export interface Person {
  id: string;
  document: string;
  fullName: string;
  email: string;
  phone: string;
  personType: 'EMPLEADO' | 'SOCIO';
  status: 'ACTIVO' | 'INACTIVO';
}

export interface Store {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVA' | 'INACTIVA';
}

export interface OtpRecord {
  id: string;
  personId: string;
  codeHash: string;
  generationStoreId: string;
  redemptionStoreId: string | null;
  generatedAt: Date;
  expiresAt: Date;
  redeemedAt: Date | null;
  purchaseValue: number | null;
  attempts: number;
  status: 'PENDIENTE' | 'REDIMIDO' | 'EXPIRADO' | 'ANULADO' | 'BLOQUEADO';
}

export interface CurrentUser {
  id: string;          // USUARIOS.id
  authUserId: string;  // auth.users.id
  email: string;
  personId?: string;
  roles: string[];
}
```

---

## 14. Repositorios

```ts
interface PersonsRepository {
  findActiveByDocument(document: string): Promise<Person | null>;
}

interface StoresRepository {
  findActiveByEmail(email: string): Promise<Store | null>;
}

interface OtpRepository {
  invalidatePendingForPerson(personId: string): Promise<void>;
  create(input: CreateOtpInput): Promise<OtpRecord>;
  findValidOtp(input: { personId: string }): Promise<OtpRecord | null>;
  incrementAttempts(id: string): Promise<void>;
  markExpired(id: string): Promise<void>;
  markBlocked(id: string): Promise<void>;
  markAsRedeemed(input: RedeemOtpInput): Promise<{ updated: boolean }>;
  findHistoryByPersonId(personId: string, pagination: Pagination): Promise<OtpRecord[]>;
}

interface ReportsRepository {
  create(input: CreateReportInput): Promise<Report>;
  findAll(filters: ReportFilters): Promise<Report[]>;
}

interface EmailLogsRepository {
  record(input: EmailLogInput): Promise<void>;
}

interface AuditRepository {
  record(entry: AuditEntry): Promise<void>;
}

interface SyncRunsRepository {
  startRun(): Promise<{ id: string }>;
  finishRun(id: string, result: SyncRunResult): Promise<void>;
}
```

### Elección de acceso a datos: **Supabase JS Client (service_role) sin ORM adicional**

| Opción | Evaluación |
|---|---|
| Cliente oficial de Supabase | ✅ Elegido. Cero configuración extra de conexión/pooling en Render, aprovecha RLS como defensa en profundidad si se decide usarlo también con `anon key` en algún caso, y es lo más simple de desplegar. |
| Prisma | Viable, pero agrega generación de cliente, migraciones paralelas a las que ya gestiona Supabase, y un paso de build adicional en Render. Se puede migrar después si el dominio crece mucho. |
| TypeORM | Mayor curva de "magia" (decoradores, lazy loading), más difícil de razonar en un dominio con reglas estrictas como OTP. |
| Drizzle | Buena opción type-safe y ligera, pero añade una capa de definición de esquema paralela; con el esquema ya existente en Supabase, el costo de mantenerlo sincronizado no se justifica en esta fase. |
| Acceso directo a `pg` | Máximo control, pero se pierde comodidad de RPC/Storage/Auth admin ya integrados en el SDK de Supabase. |

**Justificación final:** el proyecto ya vive dentro del ecosistema Supabase (Auth, y potencialmente Storage/RPC a futuro). Usar el cliente oficial dentro de los repositorios (encapsulado, nunca inyectado directo en services) da simplicidad de despliegue en Render, evita mantener dos fuentes de verdad del esquema, y las interfaces de repositorio ya dejan la puerta abierta a cambiar de implementación (p. ej. a Drizzle) sin tocar los services si el proyecto crece.

---

## 15. Guards y decoradores

```ts
// common/decorators/current-user.decorator.ts
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CurrentUserType => {
    return ctx.switchToHttp().getRequest().user;
  },
);

// common/decorators/roles.decorator.ts
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

// common/guards/supabase-auth.guard.ts
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token = extractBearerToken(req);
    if (!token) throw new UnauthorizedException('AUTH_TOKEN_MISSING');
    req.user = await this.authService.resolveCurrentUser(token); // valida JWT + activo + roles
    return true;
  }
}

// common/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (!required?.length) return true;
    const { user } = context.switchToHttp().getRequest();
    return required.some(r => user.roles.includes(r));
  }
}
```

Uso en controller:
```ts
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('TIENDA')
@Post('generate')
generate(@CurrentUser() user: CurrentUserType, @Body() dto: GenerateOtpDto) { ... }
```

---

## 16. Manejo de errores

```json
{
  "success": false,
  "statusCode": 400,
  "code": "OTP_EXPIRED",
  "message": "El código ha expirado.",
  "details": null,
  "timestamp": "2026-07-14T12:00:00.000Z",
  "path": "/otp/validate"
}
```

- **`DomainException`** base class con `code`, `httpStatus`, `message`, extendida por excepciones concretas (`OtpExpiredException`, `OtpInvalidException`, `PersonNotFoundException`, `StoreInactiveException`, etc.) definidas junto a un enum central `ErrorCodes`.
- **`AllExceptionsFilter`** (global, `APP_FILTER`):
  - Si es `DomainException` → responde con su `httpStatus`/`code`/`message`.
  - Si es `HttpException` estándar de Nest (validación de DTO, etc.) → normaliza al mismo formato, código `VALIDATION_ERROR`.
  - Cualquier otro error (no esperado) → `500 INTERNAL_ERROR`, mensaje genérico ("Ha ocurrido un error interno"), **nunca** stack trace ni detalles de infraestructura al cliente; el detalle completo se loggea internamente vía `AuditService`/logger estructurado (pino/winston) con `requestId`.
- Todo log estructurado incluye: `requestId`, `path`, `userId` (si existe), `code`, `timestamp` — nunca el body completo si contiene OTP/contraseñas.
- Diferenciación esperado vs interno: excepciones de dominio = 4xx, esperadas y "normales" (no se loguean como error, sino como warning/info); cualquier excepción no controlada = 5xx y sí se loguea como error con severidad alta.

---

## 17. Seguridad

- **JWT de Supabase:** validado en cada request contra el proyecto de Supabase (JWKS o `auth.getUser` con `service_role`); se rechaza si expiró o la firma no corresponde.
- **Guards:** `SupabaseAuthGuard` (autenticación) + `RolesGuard` (autorización), aplicados globalmente vía `APP_GUARD` con excepciones explícitas (`@Public()`) para `/health`.
- **`SUPABASE_SERVICE_ROLE_KEY`:** solo en variables de entorno del backend en Render, nunca en el bundle de React, nunca en logs.
- **Secretos:** todos vía variables de entorno, cargados y validados al boot (falla rápido si falta una obligatoria).
- **Rate limiting:** `@nestjs/throttler` global + límites específicos por persona/tienda para `/otp/generate` y `/otp/validate` (ventana configurable vía `OTP_RATE_LIMIT_*`).
- **Fuerza bruta:** contador de `intentos` persistido en `CODIGOS_OTP`, bloqueo tras `OTP_MAX_ATTEMPTS`; comparación de hash en tiempo constante.
- **Reutilización de OTP:** `UPDATE ... WHERE id = $1 AND estado = 'PENDIENTE'` atómico para redimir; si 0 filas afectadas, ya fue usado por otra request concurrente.
- **Endpoints internos** (sync manual, admin): protegidos con rol `CONTROL_INTERNO` y/o `SYNC_SECRET` adicional en header, nunca accesibles desde React sin rol adecuado.
- **DTO + `class-validator`:** elegido sobre Zod por integración nativa con `ValidationPipe` de Nest y decoradores ya usados en el resto del stack; Zod sería igualmente válido si se prefiere validación funcional pura.
- **CORS:** whitelist estricta con `FRONTEND_URL`, métodos y headers explícitos, sin `*`.
- **Helmet:** habilitado globalmente (`app.use(helmet())`).
- **RLS recomendado:** habilitar RLS en todas las tablas sensibles y **no** dar acceso directo con `anon key` desde el frontend a estas tablas (el frontend solo usa Supabase para Auth, no para leer/escribir datos de negocio). Si en el futuro se permite lectura directa desde el frontend, políticas RLS deben replicar exactamente las mismas reglas del backend (por tienda, por rol), pero mientras todo pase por NestJS con `service_role`, RLS actúa como defensa en profundidad, no como mecanismo primario.
- **Separación de permisos:** el frontend solo posee `SUPABASE_PUBLISHABLE_KEY` (anon) para login; toda operación de negocio pasa por el backend con `service_role`, que es quien realmente decide qué se puede leer/escribir.

---

## 18. Variables de entorno

```env
NODE_ENV=                 # obligatoria, no secreta
PORT=                     # obligatoria, no secreta
FRONTEND_URL=             # obligatoria, no secreta (usada en CORS)

SUPABASE_URL=             # obligatoria, no secreta
SUPABASE_PUBLISHABLE_KEY= # obligatoria, no secreta (uso backend opcional; equivalente a anon)
SUPABASE_SERVICE_ROLE_KEY=# obligatoria, SECRETA — jamás en React/VITE_*

OTP_SECRET=               # obligatoria, SECRETA
OTP_EXPIRATION_MINUTES=   # obligatoria, no secreta (default 5)
OTP_MAX_ATTEMPTS=         # obligatoria, no secreta
OTP_RATE_LIMIT_MAX=       # obligatoria, no secreta
OTP_RATE_LIMIT_WINDOW_MINUTES= # obligatoria, no secreta

EMAIL_PROVIDER=           # obligatoria, no secreta (ej. "graph")
EMAIL_FROM=               # obligatoria, no secreta
EMAIL_API_KEY=            # obligatoria si aplica al proveedor, SECRETA (o credenciales OAuth de Graph: tenant/client id/secret)

SYNC_SECRET=              # obligatoria si hay endpoint manual, SECRETA
YOU_DATABASE_URL=         # obligatoria, SECRETA
THIRD_PARTY_DATABASE_URL= # obligatoria, SECRETA
```

**Regla dura:** ninguna de estas variables debe tener prefijo `VITE_` ni existir en el `.env` de React. React solo necesita `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (anon), ambas ya diseñadas por Supabase para ser públicas.

---

## 19. Estrategia de despliegue en Render

- **Web Service** de tipo Node, build `npm ci && npm run build`, start `node dist/main.js`.
- Variables de entorno cargadas en el dashboard de Render (Environment Group compartido si hay múltiples servicios).
- Health check configurado contra `/health` para que Render reinicie si el servicio no responde.
- Autoscaling/instancia única en fase inicial (dado el volumen esperado); revisar plan pago para evitar cold starts si el uso es crítico en horario comercial.
- Logs de Render + un sink adicional (ej. Logtail/Datadog) recomendado a futuro para correlacionar `requestId`.
- CI simple: en cada push a `main`, Render dispara build/deploy automático; pruebas (`npm run test`) como gate previo en GitHub Actions antes de permitir merge.

---

## 20. Estrategia de cron o job periódico

- `@nestjs/schedule` con `@Cron()` en `SynchronizationScheduler`, expresión configurable por env (`SYNC_CRON_EXPRESSION`, ej. cada 6 horas).
- Lock simple para evitar ejecuciones solapadas: antes de iniciar, verifica si existe una ejecución `EN_PROGRESO` reciente en `EJECUCIONES_SINCRONIZACION`; si existe y no ha expirado un timeout razonable, se omite el nuevo disparo.
- Alternativa más robusta a futuro: mover el cron a un **Render Cron Job** separado (proceso independiente) en vez de vivir dentro del mismo proceso web, para no competir por recursos con el tráfico HTTP.
- Procesamiento por lotes con `UPSERT` idempotente (ver flujo de sincronización, sección 8).
- Alertamiento: si `estado = FALLIDA` o `PARCIAL` con muchos errores, se registra en `LOG` con severidad alta para que `CONTROL_INTERNO` lo revise vía un endpoint de consulta de ejecuciones (`GET /admin/sync-runs`).

---

## 21. Estrategia de pruebas

- **Unitarias:** `OtpService` (generación, expiración, intentos, hash/compare), `StoresService.resolveCurrentStore`, `PersonsService`, guards (`RolesGuard`) — con repositorios mockeados.
- **Integración:** controllers + services + repositorios reales contra una base Supabase de test (o contenedor Postgres local con el mismo esquema), usando Nest `TestingModule`.
- **End-to-end:** flujo completo generate → validate → redeem contra la app levantada con Supertest.
- **Mock del servicio de correo:** implementación `InMemoryEmailProvider` que implementa `EmailProvider` para pruebas, registrando llamadas sin salir a red.
- **Casos específicos obligatorios:**
  - OTP expirado (viajar en el tiempo con reloj inyectado o mockeado).
  - Código incorrecto (hash no coincide).
  - Máximo de intentos alcanzado (bloqueo tras N fallos).
  - Reutilización (redimir dos veces, segunda debe fallar con `409`).
  - Persona inactiva (rechazo en `/persons/:document` y en `/otp/generate`).
  - Tienda inactiva (rechazo en resolución de `StoresService`).
  - Roles (acceso denegado a rol no autorizado en cada endpoint).
  - Sincronización: UPSERT no duplica en dos corridas seguidas con los mismos datos de origen; fallo parcial no bloquea lotes exitosos.

---

## 22. Orden recomendado de implementación

1. `config/` + validación de entorno + `database/` (provider Supabase).
2. `common/` (filtros, guards base, decoradores, excepciones, error codes).
3. `AuthModule` + `UsersModule` (login ya lo hace React; aquí solo resolución de usuario/roles).
4. `HealthModule` (para tener algo desplegable y verificable desde el día 1).
5. `StoresModule`.
6. `PersonsModule`.
7. `EmailsModule` (interfaz + provider Graph + mock para pruebas).
8. `OtpModule` (generate → validate → redeem, en ese orden, con pruebas por cada uno).
9. `AuditModule` (integrado retroactivamente a los módulos anteriores).
10. `ReportsModule`.
11. `SynchronizationModule` (cron + fuentes YOU/terceros + UPSERT idempotente).
12. Endurecimiento transversal: rate limiting, Helmet, CORS final, revisión de RLS recomendada, pruebas e2e completas, despliegue final en Render.

---

*Fin del documento de arquitectura.*
