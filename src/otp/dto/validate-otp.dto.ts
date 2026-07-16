import { IsString, Matches } from "class-validator";

export class ValidateOtpDto {
  @IsString()
  @Matches(/^[0-9]{5,15}$/, {
    message: "El documento debe contener entre 5 y 15 dígitos.",
  })
  document!: string;

  @IsString()
  @Matches(/^[0-9]{6}$/, {
    message: "El código debe contener exactamente 6 dígitos.",
  })
  code!: string;
}