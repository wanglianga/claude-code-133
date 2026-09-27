import { Controller, Post, Body, UseGuards, Get, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CoreService } from '../core.service';
import { JwtAuthGuard } from '../auth.guard';
import { env } from '../config';

@Controller('auth')
export class AuthController {
  constructor(private core: CoreService, private jwt: JwtService) {}

  @Post('login')
  async login(@Body() body: any) {
    const user = await this.core.validateUser(body.username, body.password);
    const token = this.jwt.sign(
      { uid: user.id, role: user.role, name: user.name, username: user.username },
      { secret: env().jwtSecret },
    );
    return { token, user };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return req.user;
  }
}
