import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiTokensService } from './api-tokens.service.js';
import { readBearerToken } from './bearer-token.js';
import { ADMIN_ONLY, IS_PUBLIC, type AuthenticatedRequest } from './decorators.js';
import { readSessionCookie } from './session-cookie.js';
import { SessionsService } from './sessions.service.js';

/** Applied globally: every route requires a session unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionsService,
    private readonly tokens: ApiTokensService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // A personal access token stands in for a session where a cookie cannot go: the iOS
    // shortcut that shares a posting, scripts, anything outside a browser.
    const bearer = readBearerToken(request);
    const sessionToken = bearer ? undefined : readSessionCookie(request);
    const user = bearer
      ? await this.tokens.findUser(bearer)
      : await this.sessions.findUser(sessionToken);
    if (!user) throw new UnauthorizedException('Sign in required');

    if (this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, targets) && user.role !== 'admin') {
      throw new ForbiddenException('Only admins can do that');
    }

    request.user = user;
    request.sessionToken = sessionToken;
    return true;
  }
}
