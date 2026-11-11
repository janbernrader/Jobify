import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  ATTACHMENT_KINDS,
  ATTACHMENT_NAME_MAX_LENGTH,
  type AttachmentKind,
} from './file.constants.js';

/** The text fields beside the file in the multipart upload. */
export class UploadFileDto {
  @IsOptional()
  @IsIn(ATTACHMENT_KINDS)
  kind?: AttachmentKind;
}

export class UpdateFileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(ATTACHMENT_NAME_MAX_LENGTH)
  name?: string;

  @IsOptional()
  @IsIn(ATTACHMENT_KINDS)
  kind?: AttachmentKind;
}
