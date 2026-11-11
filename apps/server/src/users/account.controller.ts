import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateApiTokenDto } from '../auth/api-token.dto.js';
import { ApiTokensService } from '../auth/api-tokens.service.js';
import { CurrentUser, type AuthenticatedRequest } from '../auth/decorators.js';
import { SessionsService } from '../auth/sessions.service.js';
import { PreferencesDto } from './preferences.dto.js';
import { RESUME_FILE_MAX_BYTES } from './profile.constants.js';
import { ProfileDto } from './profile.dto.js';
import { extractResumeText } from './resume-text.js';
import { ChangePasswordDto, UpdateAccountDto } from './users.dto.js';
import { UsersService, type PublicUser } from './users.service.js';

/** What multer hands over for the uploaded resume; only the bytes matter. */
interface UploadedResume {
  buffer: Buffer;
}

/** The signed-in user's own account. */
@Controller('account')
export class AccountController {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly tokens: ApiTokensService,
  ) {}

  @Get()
  get(@CurrentUser() user: PublicUser) {
    return user;
  }

  @Patch()
  update(@CurrentUser() user: PublicUser, @Body() dto: UpdateAccountDto) {
    return this.users.update(user.id, { displayName: dto.displayName });
  }

  @Put('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(@Req() request: AuthenticatedRequest, @Body() dto: ChangePasswordDto) {
    await this.users.changePassword(request.user.id, dto.currentPassword, dto.password);
    // Keep this browser signed in, but sign out everywhere else.
    await this.sessions.revokeAll(request.user.id, request.sessionToken);
  }

  @Get('profile')
  getProfile(@CurrentUser() user: PublicUser) {
    return this.users.getProfile(user.id);
  }

  @Put('profile')
  updateProfile(@CurrentUser() user: PublicUser, @Body() dto: ProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  /**
   * Reads the text out of an uploaded resume (PDF, Word or plain text) for the profile form.
   * Nothing is saved: the file stays in memory only for this request, and the client puts the
   * text in the resume field for the user to review and save.
   */
  @Post('profile/resume')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    // Multer's default storage keeps the file in memory; it is never written to disk.
    FileInterceptor('file', { limits: { fileSize: RESUME_FILE_MAX_BYTES, files: 1, fields: 0 } }),
  )
  parseResume(@UploadedFile() file?: UploadedResume) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose a file to upload.');
    return extractResumeText(file.buffer);
  }

  @Get('tokens')
  listTokens(@CurrentUser() user: PublicUser) {
    return this.tokens.list(user.id);
  }

  /** Creates a personal access token. The token itself is in this response and nowhere else. */
  @Post('tokens')
  createToken(@CurrentUser() user: PublicUser, @Body() dto: CreateApiTokenDto) {
    return this.tokens.create(user.id, dto.name);
  }

  @Delete('tokens/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeToken(@CurrentUser() user: PublicUser, @Param('id', ParseIntPipe) id: number) {
    return this.tokens.revoke(user.id, id);
  }

  @Get('preferences')
  getPreferences(@CurrentUser() user: PublicUser) {
    return this.users.getPreferences(user.id);
  }

  @Put('preferences')
  updatePreferences(@CurrentUser() user: PublicUser, @Body() dto: PreferencesDto) {
    return this.users.updatePreferences(user.id, dto);
  }
}
