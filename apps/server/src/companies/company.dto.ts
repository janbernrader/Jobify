import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CompanyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'The website must be a full address' })
  @MaxLength(500)
  website?: string | null;

  @IsOptional()
  @IsBoolean()
  isAgency?: boolean;

  /** What the user knows about them, in Markdown. */
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  about?: string | null;
}

export class UpdateCompanyDto extends PartialType(CompanyDto) {}
