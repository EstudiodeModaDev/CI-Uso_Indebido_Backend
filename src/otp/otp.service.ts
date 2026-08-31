import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CurrentUser } from "../common/types/current-user.type";
import { EmailsService } from "../emails/emails.service";
import { PersonsService } from "../persons/persons.service";
import { StoresService } from "../stores/stores.service";
import {
  compareOtpCode,
  decryptOtpCode,
  encryptOtpCode,
  generateOtpCode,
  hashOtpCode,
} from "./otp.crypto";
import { OtpRepository } from "./repositories/otp.repository";
import type { OtpHistoryRecord } from "./repositories/otp.repository";
import { AuditService } from "../audit/audit.service";
import type { OtpStatus } from "./interfaces/otp-record.interface";



export interface GenerateOtpResponse {
  success: boolean;
  expiresAt: string;
  maskedEmail: string;
}

export interface ValidateOtpResponse {
  valid: boolean;
  remainingAttempts: number;
  expiresAt: string;
}

export interface RedeemOtpResponse {
  success: true;
  redeemedAt: string;
}

export interface OtpHistoryItemResponse {
  id: string;
  code: string | null;
  status:
    | "REDIMIDO"
    | "EXPIRADO"
    | "ANULADO";
  generatedAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  purchaseValue: number;
  generateIn: string;
  redeemIn: string | null;
  invoiceNumber: number | null;
}

export interface AdminOtpHistoryItemResponse {
  id: string;
  code: string | null;
  status: OtpStatus;
  document: string;
  personName: string;
  generatedAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  purchaseValue: number;
  generateIn: string;
  redeemIn: string | null;
  invoiceNumber: number | null;
}

export interface AdminOtpHistoryPage {
  items: AdminOtpHistoryItemResponse[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class OtpService {
  constructor(
    private readonly otpRepository: OtpRepository,
    private readonly personsService: PersonsService,
    private readonly storesService: StoresService,
    private readonly emailsService: EmailsService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async generate(
    document: string,
    currentUser: CurrentUser,
  ): Promise<GenerateOtpResponse> {
    const store = await this.storesService.resolveCurrentStore(currentUser,);

    const person = await this.personsService.findActiveByDocument(document,);

    if (!person.correo) {
      throw new BadRequestException({
        code: "PERSON_EMAIL_NOT_FOUND",
        message:
          "La persona no tiene un correo registrado.",
      });
    }

    await this.otpRepository.invalidatePendingForPerson(person.id,);

    const otpCode = generateOtpCode();

    const secret = this.configService.getOrThrow<string>("otp.secret",);
    const encryptionKey =
      this.configService.getOrThrow<string>(
        "otp.encryptionKey",
      );

    const expirationMinutes =
      this.configService.getOrThrow<number>(
        "otp.expirationMinutes",
      );

    const expiresAt = new Date(
      Date.now() + expirationMinutes * 60_000,
    );

    const codeHash = hashOtpCode(
      otpCode,
      secret,
    );
    const encryptedCode = encryptOtpCode(
      otpCode,
      encryptionKey,
    );

    const otp = await this.otpRepository.create({
      personId: person.id,
      generationStoreId: store.id,
      codeHash,
      encryptedCode,
      expiresAt: expiresAt.toISOString(),
    });

    await this.auditService.success(
      "OTP_GENERATED",
      {
        usuario: currentUser.id,
        entidad: "OTP",
      },
    );
    const emailResult = await this.emailsService.send({
      to: [person.correo],
      subject: "Código de autorización de descuento",
      html: this.buildOtpEmail({
        fullName: person.nombres + " " + person.apellidos,
        code: otpCode,
        expirationMinutes,
        storeName: store.name,
      }),
      referenceType: "OTP",
      referenceId: otp.id,
    });

    /*
     * El OTP permanece registrado, aunque el proveedor
     * de correo haya fallado.
     */
    if (!emailResult.success) {
      await this.auditService.failure(
        "OTP_EMAIL_FAILED",
        {
          usuario: currentUser.id,
          entidad: "OTP",
          mensaje:       "El OTP se generó, pero el correo no pudo enviarse.",
        },
      );

      throw new BadGatewayException({
        code: "EMAIL_SEND_FAILED",
        message:
          "El código fue generado, pero no pudo enviarse por correo.",
        otpGenerated: true,
        expiresAt: otp.fecha_expiracion,
      });
    }

    await this.auditService.success(
      "OTP_EMAIL_SENT",
      {
        usuario: currentUser.id,
        entidad: "OTP",
      },
    );

    return {
      success: true,
      expiresAt: otp.fecha_expiracion.toString(),
      maskedEmail: this.maskEmail(person.correo),
    };
  }

  private maskEmail(email: string): string {
    const [localPart, domain] = email.split("@");

    if (!localPart || !domain) {
      return "***";
    }

    const visibleCharacters = localPart.slice(0, 2);

    return `${visibleCharacters}${"*".repeat(
      Math.max(localPart.length - 2, 3),
    )}@${domain}`;
  }

  private buildOtpEmail(input: {
    fullName: string;
    code: string;
    expirationMinutes: number;
    storeName: string;
  }): string {
    return `
      <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="padding:22px;background:#111827;color:#ffffff;text-align:center;">
          <h2 style="margin:0;">Código de autorización</h2>
        </div>

        <div style="padding:24px;color:#1f2937;">
          <p>Hola ${input.fullName},</p>

          <p>Se solicitó un código para autorizar un descuento en:</p>

          <p>
            <strong>Tienda:</strong>
            ${input.storeName}
          </p>

          <div style="margin:24px 0;padding:18px;background:#f3f4f6;text-align:center;border-radius:8px;">
            <span style="font-size:32px;font-weight:700;letter-spacing:8px;">
              ${input.code}
            </span>
          </div>

          <p>
            Este código vence en
            <strong>${input.expirationMinutes} minutos</strong>.
          </p>

          <p>
            Si no solicitaste este código, no lo compartas y reporta la situación.
          </p>
        </div>
      </div>
    `.trim();
  }

  async validate(
    document: string,
    code: string,
    currentUser: CurrentUser,
  ): Promise<ValidateOtpResponse> {
    /*
    * Aunque validate no use directamente el ID de la tienda,
    * resolvemos la tienda para garantizar que el usuario autenticado
    * realmente pertenece a una tienda activa.
    */
    await this.storesService.resolveCurrentStore(currentUser);

    const person =
      await this.personsService.findActiveByDocument(document);

    const otp =
      await this.otpRepository.findLatestPendingByPersonId(
        person.id,
      );

    if (!otp) {
      throw new NotFoundException({
        code: "OTP_NOT_FOUND",
        message:
          "No se encontró un código pendiente para esta persona.",
      });
    }

    const now = Date.now();
    const expirationTime = new Date(
      otp.fecha_expiracion,
    ).getTime();

    if (Number.isNaN(expirationTime) || expirationTime <= now) {
      await this.otpRepository.markExpired(otp.id);

      await this.auditService.warning(
        "OTP_EXPIRED",
        {
          usuario: currentUser.id,
          entidad: "OTP",
          mensaje:
            "Se intentó utilizar un OTP expirado.",
        },
      );

      throw new BadRequestException({
        code: "OTP_EXPIRED",
        message: "El código ha expirado.",
      });
    }

    const maxAttempts = this.configService.getOrThrow<number>("otp.maxAttempts",);

    if (otp.intentos_validacion >= maxAttempts) {
      await this.otpRepository.markBlocked(otp.id);

      throw new BadRequestException({
        code: "OTP_MAX_ATTEMPTS_REACHED",
        message:
          "El código fue bloqueado por superar el máximo de intentos.",
      });
    }

    const secret =
      this.configService.getOrThrow<string>(
        "otp.secret",
      );

    const isValid = compareOtpCode(
      code,
      otp.codigo_hash,
      secret,
    );

    if (!isValid) {
      const newAttempts =
        await this.otpRepository.incrementAttempts(
          otp.id,
          otp.intentos_validacion,
        );

      const remainingAttempts = Math.max(
        maxAttempts - newAttempts,
        0,
      );

      if (newAttempts >= maxAttempts) {
        await this.otpRepository.markBlocked(otp.id);

        throw new BadRequestException({
          code: "OTP_MAX_ATTEMPTS_REACHED",
          message:
            "El código fue bloqueado por superar el máximo de intentos.",
        });
      }

      throw new BadRequestException({
        code: "OTP_INVALID",
        message: "El código ingresado no es válido.",
        remainingAttempts,
      });
    }

    await this.auditService.success(
      "OTP_VALIDATED",
      {
        usuario: currentUser.id,
        entidad: "OTP",
        mensaje: "Se ingresó un código OTP incorrecto.",
      },
    );

    return {
      valid: true,
      remainingAttempts: Math.max(
        maxAttempts - otp.intentos_validacion,
        0,
      ),
      expiresAt: String(otp.fecha_expiracion),
    };
  }

  async redeem(
    document: string,
    code: string,
    purchaseValue: number,
    currentUser: CurrentUser,
    invoiceNumber: number
  ): Promise<RedeemOtpResponse> {
    const store =
      await this.storesService.resolveCurrentStore(
        currentUser,
      );

    const person =
      await this.personsService.findActiveByDocument(
        document,
      );

    const otp =
      await this.otpRepository.findLatestPendingByPersonId(
        person.id,
      );

    if (!otp) {
      throw new NotFoundException({
        code: "OTP_NOT_FOUND",
        message:
          "No se encontró un código pendiente para esta persona.",
      });
    }

    const expirationTime = new Date(
      otp.fecha_expiracion,
    ).getTime();

    if (
      Number.isNaN(expirationTime) ||
      expirationTime <= Date.now()
    ) {
      await this.otpRepository.markExpired(otp.id);

      throw new BadRequestException({
        code: "OTP_EXPIRED",
        message: "El código ha expirado.",
      });
    }

    const maxAttempts =
      this.configService.getOrThrow<number>(
        "otp.maxAttempts",
      );

    if (otp.intentos_validacion >= maxAttempts) {
      await this.otpRepository.markBlocked(otp.id);

      throw new BadRequestException({
        code: "OTP_MAX_ATTEMPTS_REACHED",
        message:
          "El código fue bloqueado por superar el máximo de intentos.",
      });
    }

    const secret =
      this.configService.getOrThrow<string>(
        "otp.secret",
      );

    const isValid = compareOtpCode(
      code,
      otp.codigo_hash,
      secret,
    );

    if (!isValid) {
      const newAttempts =
        await this.otpRepository.incrementAttempts(
          otp.id,
          otp.intentos_validacion,
        );

      if (newAttempts >= maxAttempts) {
        await this.otpRepository.markBlocked(otp.id);

        throw new BadRequestException({
          code: "OTP_MAX_ATTEMPTS_REACHED",
          message:
            "El código fue bloqueado por superar el máximo de intentos.",
        });
      }

      throw new BadRequestException({
        code: "OTP_INVALID",
        message: "El código ingresado no es válido.",
        remainingAttempts:
          maxAttempts - newAttempts,
      });
    }

    const redeemedAt = new Date().toISOString();

    const updated =
      await this.otpRepository.markAsRedeemed({
        otpId: otp.id,
        redemptionStoreId: store.id,
        purchaseValue,
        redeemedAt,
        invoiceNumber
      });

    await this.auditService.success(
      "OTP_REDEEMED",
      {
        usuario: currentUser.id,
        entidad: "OTP",
      },
    );

    if (!updated) {
      throw new ConflictException({
        code: "OTP_ALREADY_REDEEMED",
        message:
          "El código ya fue redimido anteriormente.",
      });
    }

    return {
      success: true,
      redeemedAt,
    };
  }

  async history(
    document: string,
    currentUser: CurrentUser,
  ): Promise<OtpHistoryItemResponse[]> {
    await this.storesService.resolveCurrentStore(
      currentUser,
    );

    const person =
      await this.personsService.findActiveByDocument(
        document,
      );

    const encryptionKey =
      this.configService.getOrThrow<string>(
        "otp.encryptionKey",
      );

    const otps =
      await this.otpRepository.findHistoryByPersonId(
        person.id,
      );

    return this.buildHistoryResponse(
      otps,
      encryptionKey,
    );
  }

  async historyPublic(
    document: string,
    email: string,
  ): Promise<OtpHistoryItemResponse[]> {
    const person =
      await this.personsService.findActiveByDocument(
        document,
      );

    const normalizedEmail = email
      .trim()
      .toLowerCase();
    const registeredEmail = person.correo
      .trim()
      .toLowerCase();

    if (
      !registeredEmail ||
      registeredEmail !== normalizedEmail
    ) {
      throw new NotFoundException({
        code: "OTP_HISTORY_NOT_FOUND",
        message:
          "No se encontro historial para los datos suministrados.",
      });
    }

    const encryptionKey =
      this.configService.getOrThrow<string>(
        "otp.encryptionKey",
      );

    const otps =
      await this.otpRepository.findHistoryByPersonId(
        person.id,
      );

    return this.buildHistoryResponse(
      otps,
      encryptionKey,
    );
  }

  async listAllForAdmin(
    params: {
      document?: string;
      generationStoreId?: number;
      redemptionStoreId?: number;
      page: number;
      pageSize: number;
    },
    currentUser: CurrentUser,
  ): Promise<AdminOtpHistoryPage> {
    let personId: string | undefined;

    if (params.document) {
      const foundId = await this.personsService.findIdByDocument(
        params.document,
      );

      if (!foundId) {
        await this.auditService.success(
          "OTP_ADMIN_HISTORY_VIEWED",
          {
            usuario: currentUser.id,
            entidad: "OTP",
          },
        );

        return {
          items: [],
          total: 0,
          page: params.page,
          pageSize: params.pageSize,
        };
      }

      personId = foundId;
    }

    const { rows, total } =
      await this.otpRepository.findAllWithFilters({
        personId,
        generationStoreId: params.generationStoreId,
        redemptionStoreId: params.redemptionStoreId,
        page: params.page,
        pageSize: params.pageSize,
      });

    const encryptionKey = this.configService.getOrThrow<string>(
      "otp.encryptionKey",
    );

    const [storeNames, persons] = await Promise.all([
      this.storesService.findNamesByIds(
        rows.flatMap((row) =>
          row.tienda_redencion_id === null
            ? [row.tienda_generacion_id]
            : [
                row.tienda_generacion_id,
                row.tienda_redencion_id,
              ],
        ),
      ),
      this.personsService.findManyByIds([
        ...new Set(rows.map((row) => row.persona_id)),
      ]),
    ]);

    const items = rows.map((row) => {
      const person = persons.get(row.persona_id);

      return {
        id: row.id,
        code: this.decryptStoredCode(
          row.codigo_encriptado,
          encryptionKey,
        ),
        status: row.estado,
        document: person?.document ?? "",
        personName: person?.fullName ?? "",
        generatedAt: String(row.fecha_generacion),
        expiresAt: String(row.fecha_expiracion),
        redeemedAt: row.fecha_redencion
          ? String(row.fecha_redencion)
          : null,
        purchaseValue: row.valor_compra,
        generateIn:
          storeNames.get(row.tienda_generacion_id) ?? "",
        redeemIn:
          row.tienda_redencion_id === null
            ? null
            : storeNames.get(row.tienda_redencion_id) ??
              null,
        invoiceNumber: row.invoice_number,
      };
    });

    await this.auditService.success(
      "OTP_ADMIN_HISTORY_VIEWED",
      {
        usuario: currentUser.id,
        entidad: "OTP",
      },
    );

    return {
      items,
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  private decryptStoredCode(
    encryptedCode: string | null,
    encryptionKey: string,
  ): string | null {
    if (!encryptedCode) {
      return null;
    }

    try {
      return decryptOtpCode(
        encryptedCode,
        encryptionKey,
      );
    } catch (error) {
      console.error(
        "Error descifrando OTP almacenado:",
        error,
      );

      throw new InternalServerErrorException({
        code: "OTP_DECRYPT_FAILED",
        message:
          "No fue posible descifrar el cÃ³digo almacenado.",
      });
    }
  }

  private async buildHistoryResponse(
    otps: OtpHistoryRecord[],
    encryptionKey: string,
  ): Promise<OtpHistoryItemResponse[]> {
    const storeNames =
      await this.storesService.findNamesByIds(
        otps.flatMap((otp) =>
          otp.tienda_redencion_id === null
            ? [otp.tienda_generacion_id]
            : [
                otp.tienda_generacion_id,
                otp.tienda_redencion_id,
              ],
        ),
      );

    return otps.map((otp) => ({
      id: otp.id,
      code: this.decryptStoredCode(
        otp.codigo_encriptado,
        encryptionKey,
      ),
      status: otp.estado as
        | "REDIMIDO"
        | "EXPIRADO"
        | "ANULADO",
      generatedAt: String(otp.fecha_generacion),
      expiresAt: String(otp.fecha_expiracion),
      redeemedAt: otp.fecha_redencion
        ? String(otp.fecha_redencion)
        : null,
      purchaseValue: otp.valor_compra,
      generateIn:
        storeNames.get(otp.tienda_generacion_id) ?? "",
      redeemIn:
        otp.tienda_redencion_id === null
          ? null
          : storeNames.get(otp.tienda_redencion_id) ??
            null,
      invoiceNumber: otp.invoice_number
    }));
  }
}
