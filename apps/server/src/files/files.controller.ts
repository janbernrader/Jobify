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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators.js';
import { loadConfig } from '../config/configuration.js';
import type { PublicUser } from '../users/users.service.js';
import { UpdateFileDto, UploadFileDto } from './file.dto.js';
import { FilesService } from './files.service.js';

/** What multer hands over; the file never reaches disk except through the store. */
interface UploadedAttachment {
  originalname?: string;
  buffer: Buffer;
}

@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get('jobs/:jobId/files')
  list(@CurrentUser() user: PublicUser, @Param('jobId', ParseIntPipe) jobId: number) {
    return this.files.listForJob(user.id, jobId);
  }

  @Post('jobs/:jobId/files')
  @UseInterceptors(
    // Multer's default storage keeps the upload in memory until the store writes it out.
    FileInterceptor('file', { limits: { fileSize: loadConfig().files.maxBytes, files: 1 } }),
  )
  upload(
    @CurrentUser() user: PublicUser,
    @Param('jobId', ParseIntPipe) jobId: number,
    @Body() dto: UploadFileDto,
    @UploadedFile() file?: UploadedAttachment,
  ) {
    if (!file) throw new BadRequestException('Choose a file to upload.');
    return this.files.upload(user.id, jobId, file, dto.kind);
  }

  @Get('files/:id')
  findOne(@CurrentUser() user: PublicUser, @Param('id', ParseIntPipe) id: number) {
    return this.files.findOne(user.id, id);
  }

  /**
   * The file itself, to the user it belongs to and nobody else.
   *
   * Only the handful of types in `INLINE_CONTENT_TYPES` are shown in place; everything else is
   * sent as an attachment, and nothing is ever sniffed, so an uploaded page cannot run as
   * script on Jobify's own origin. The response is private: it is one user's document, and no
   * cache between here and the browser should keep it.
   */
  @Get('files/:id/content')
  async content(
    @CurrentUser() user: PublicUser,
    @Param('id', ParseIntPipe) id: number,
    @Res() response: Response,
  ) {
    const file = await this.files.content(user.id, id);
    response.set({
      'Content-Type': file.inline ? file.contentType : 'application/octet-stream',
      'Content-Disposition': FilesController.disposition(file.inline, file.name),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      // Only reaches a download, where nothing renders anyway; the inline types are the ones
      // that cannot carry script, and some PDF viewers refuse to open a sandboxed response.
      ...(file.inline ? {} : { 'Content-Security-Policy': "default-src 'none'; sandbox" }),
    });
    // sendFile, not download: express's download insists on its own Content-Disposition.
    response.sendFile(file.path);
  }

  /** The file's text, for filling in the job's resume or cover letter. Nothing is saved. */
  @Post('files/:id/text')
  @HttpCode(HttpStatus.OK)
  text(@CurrentUser() user: PublicUser, @Param('id', ParseIntPipe) id: number) {
    return this.files.text(user.id, id);
  }

  @Patch('files/:id')
  update(
    @CurrentUser() user: PublicUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFileDto,
  ) {
    return this.files.update(user.id, id, dto);
  }

  @Delete('files/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: PublicUser, @Param('id', ParseIntPipe) id: number) {
    return this.files.remove(user.id, id);
  }

  /** Quotes the name, and escapes what cannot appear in a header. */
  private static disposition(inline: boolean, name: string): string {
    const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    const encoded = encodeURIComponent(name);
    return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
  }
}
