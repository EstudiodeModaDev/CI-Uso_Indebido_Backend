import { IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";

export class AdminOtpHistoryDto {
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{5,15}$/, {
    message:
      "El documento debe contener entre 5 y 15 dígitos.",
  })
  document?: string;

  @IsOptional()
  @IsInt()
  generationStoreId?: number;

  @IsOptional()
  @IsInt()
  redemptionStoreId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
