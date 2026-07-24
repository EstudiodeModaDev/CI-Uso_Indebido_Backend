import {
  IsEmail,
  IsString,
  Matches,
} from "class-validator";

export class PublicOtpHistoryDto {
  @IsString()
  @Matches(/^[0-9]{5,15}$/, {
    message:
      "El documento debe contener entre 5 y 15 dÃ­gitos.",
  })
  document!: string;

  @IsEmail({}, {
    message:
      "Debe enviar un correo electrÃ³nico vÃ¡lido.",
  })
  email!: string;
}
