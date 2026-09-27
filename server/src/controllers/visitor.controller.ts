import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CoreService } from '../core.service';
import { JwtAuthGuard } from '../auth.guard';

@Controller('visitor')
export class VisitorController {
  constructor(private core: CoreService) {}

  // 购票（登录游客或工作人员代买均可）
  @UseGuards(JwtAuthGuard)
  @Post('tickets')
  buy(@Body() body: any) {
    return this.core.buyTicket(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tickets')
  mine(@Query('phone') phone: string, @Query('name') name: string) {
    return this.core.myTickets(phone, name);
  }

  @Get('tickets/:code')
  byCode(@Param('code') code: string) {
    return this.core.ticketByCode(code);
  }

  // 游客自助退票申请
  @UseGuards(JwtAuthGuard)
  @Post('tickets/:code/refund')
  refund(@Param('code') code: string, @Body() body: any, @Req() req: any) {
    return this.core.requestRefund(code, body.reason || '游客申请退票', req.user.name, body.visitorName);
  }

  // 团队包车申请
  @UseGuards(JwtAuthGuard)
  @Post('charters')
  charter(@Body() body: any) {
    return this.core.requestCharter(body);
  }
}
