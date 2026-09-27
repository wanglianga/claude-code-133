import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CoreService } from '../core.service';
import { JwtAuthGuard } from '../auth.guard';
import { Roles } from '../roles.decorator';
import { ROLE } from '../entities';

@Controller('dispatch')
@UseGuards(JwtAuthGuard)
@Roles(ROLE.DISPATCH, ROLE.ADMIN)
export class DispatchController {
  constructor(private core: CoreService) {}

  // 派班（兼顾车辆电量、司机工时/休息）
  @Post('trips')
  createTrip(@Body() body: any, @Req() req: any) {
    return this.core.createTrip(body, req.user.name);
  }

  @Get('trips')
  @Roles(ROLE.DISPATCH, ROLE.ADMIN, ROLE.DRIVER, ROLE.STAFF)
  trips(@Query('status') status: string) {
    return this.core.listTrips(status);
  }

  @Post('trips/:id/depart')
  depart(@Param('id') id: string) {
    return this.core.departTrip(Number(id));
  }

  @Post('trips/:id/complete')
  complete(@Param('id') id: string) {
    return this.core.completeTrip(Number(id));
  }

  // 车辆位置/电量（司机上报，调度查看同样经此）
  @Post('trips/:id/position')
  @Roles(ROLE.DRIVER, ROLE.DISPATCH, ROLE.ADMIN)
  position(@Param('id') id: string, @Body() body: any) {
    return this.core.reportPosition(Number(id), Number(body.lat), Number(body.lng), body.batteryPct == null ? null : Number(body.batteryPct));
  }

  // 暴雨等临时停运/恢复
  @Post('suspension')
  suspension(@Body() body: any, @Req() req: any) {
    return this.core.setSuspension((body.tripIds || []).map(Number), !!body.suspended, body.reason || '', req.user.name);
  }

  // 道路管制（登记事件，可联动停运受影响班次并广播）
  @Post('road-control')
  roadControl(@Body() body: any, @Req() req: any) {
    return this.core.roadControl(body, req.user.name);
  }

  // 车辆故障登记
  @Post('vehicles/:id/fault')
  fault(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.core.vehicleFault(Number(id), body.detail || '', req.user.name);
  }

  // 车辆修复恢复运营
  @Post('vehicles/:id/repair')
  repair(@Param('id') id: string, @Req() req: any) {
    return this.core.vehicleRepair(Number(id), req.user.name);
  }

  // 全线广播
  @Post('broadcast')
  broadcast(@Body() body: any, @Req() req: any) {
    return this.core.broadcast(body.stationId ? Number(body.stationId) : null, body.content, body.channel || 'all', req.user.name);
  }

  // 站点限流 / 封闭
  @Post('stations/:id/status')
  stationStatus(@Param('id') id: string, @Body() body: any) {
    return this.core.setStationStatus(Number(id), body.status, body.crowdLimit);
  }

  // 包车派车
  @Post('charters/:id/assign')
  assignCharter(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.core.assignCharter(Number(id), Number(body.vehicleId), Number(body.driverId), req.user.name);
  }

  @Get('charters')
  charters() {
    return this.core.listCharters();
  }
}
