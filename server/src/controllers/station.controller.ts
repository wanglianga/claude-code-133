import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CoreService } from '../core.service';
import { JwtAuthGuard } from '../auth.guard';
import { Roles } from '../roles.decorator';
import { ROLE } from '../entities';

@Controller('stations')
@UseGuards(JwtAuthGuard)
export class StationController {
  constructor(private core: CoreService) {}

  // 站点平板看板（排队人数/已检票/车辆位置/座位余量/轮椅位/天气）
  @Get(':id/board')
  board(@Param('id') id: string) {
    return this.core.stationBoard(Number(id));
  }

  @Post(':id/checkin')
  checkin(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.core.checkin(body.ticketCode, Number(id), req.user.name);
  }

  @Post(':id/board')
  boardNext(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.core.board(body.ticketCode || null, Number(id), Number(body.tripId), req.user.name);
  }

  // 满载跳站（站点登记）
  @Post(':id/skip')
  skip(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.core.skipStation(Number(body.tripId), Number(id), req.user.name);
  }

  // 老人优先争议登记
  @Post(':id/priority-dispute')
  dispute(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.core.priorityDispute(Number(id), Number(body.ticketId), body.detail, req.user.name);
  }

  // 站点广播
  @Post(':id/broadcast')
  broadcast(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.core.broadcast(Number(id), body.content, body.channel || 'station', req.user.name);
  }

  @Get('broadcasts/list')
  broadcasts(@Query('stationId') stationId: string) {
    return this.core.listBroadcasts(stationId ? Number(stationId) : undefined);
  }

  // 天气上报（站点/调度）
  @Post('weather')
  @Roles(ROLE.STAFF, ROLE.DISPATCH, ROLE.ADMIN)
  weather(@Body() body: any) {
    return this.core.setWeather(
      body.stationId ? Number(body.stationId) : null,
      body.condition || 'sunny', Number(body.tempC ?? 25), Number(body.windLevel ?? 0), body.alert || '',
    );
  }
}
