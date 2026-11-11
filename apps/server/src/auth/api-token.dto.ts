import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateApiTokenDto {
  /** What the token is for, so it can be told apart when it is time to revoke one. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
