import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { env } from './config';

export const ROLES_KEY = 'roles';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private reflector: Reflector,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) throw new UnauthorizedException('缺少登录令牌');
    try {
      req.user = this.jwt.verify(header.slice(7), { secret: env().jwtSecret });
    } catch {
      throw new UnauthorizedException('登录已失效');
    }
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (roles && roles.length && !roles.includes(req.user.role)) {
      throw new ForbiddenException('当前角色无权操作');
    }
    return true;
  }
}
