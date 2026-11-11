import { IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';

export class ShareJobDto {
  @ValidateIf((dto: ShareJobDto) => !dto.text)
  @IsUrl({ require_protocol: true }, { message: 'Provide the posting’s URL, or its text' })
  url?: string;

  /** The posting as text, for a share that carries no link. Needs AI to be read. */
  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  text?: string;

  /** What the sharing app called it, used only when the posting gives no title of its own. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;
}
