import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CurrentUser } from "../common/types/current-user.type";
import { EmailsService } from "../emails/emails.service";
import { PersonsService } from "../persons/persons.service";
import { StoresService } from "../stores/stores.service";
import { generateOtpCode, hashOtpCode, compareOtpCode} from "./otp.crypto";
import { OtpRepository } from "./repositories/otp.repository";
import { AuditService } from "../audit/audit.service";



export interface GenerateOtpResponse {
  success: boolean;
  expiresAt: string;
  maskedEmail: string;
}

export interface ValidateOtpResponse {
  valid: true;
  remainingAttempts: number;
  expiresAt: string;
}

export interface RedeemOtpResponse {
  success: true;
  redeemedAt: string;
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

    const otp = await this.otpRepository.create({
      personId: person.id,
      generationStoreId: store.id,
      codeHash,
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
}