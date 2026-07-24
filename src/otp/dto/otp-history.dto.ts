import { IsString, Matches } from "class-validator";

export class OtpHistoryDto {
  @IsString()
  @Matches(/^[0-9]{5,15}$/, {
    message:
      "El documento debe contener entre 5 y 15 dÃ­gitos.",
  })
  document!: string;
}
