import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators.js';
import type { PublicUser } from '../users/users.service.js';
import { ShareJobDto } from './share.dto.js';
import { ShareService } from './share.service.js';

/**
 * One request, one saved job: what the share sheet calls. Reachable with a personal access
 * token, since the phone shortcut that uses it has no session cookie.
 */
@Controller('share')
export class ShareController {
  constructor(private readonly share: ShareService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  save(@CurrentUser() user: PublicUser, @Body() dto: ShareJobDto) {
    return this.share.save(user.id, dto);
  }
}
