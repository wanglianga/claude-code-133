import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CoreService } from '../core.service';
import { JwtAuthGuard } from '../auth.guard';
import { Roles } from '../roles.decorator';
import { ROLE } from '../entities';

@Controller('driver')
@UseGuards(JwtAuthGuard)
@Roles(ROLE.DRIVER, ROLE.DISPATCH, ROLE.ADMIN)
export class DriverController {
  constructor(private core: CoreService) {}

  // 发车前安全检查（刹车/轮胎/灯光/车门/轮椅锁）
  @Post('safety-check')
  safety(@Body() body: any) {
    return this.core.safetyCheck(Number(body.driverId), Number(body.vehicleId), body.items || {}, body.note || '');
  }

  // 交班（延误将影响下一班）
  @Post('handover')
  handover(@Body() body: any, @Req() req: any) {
    return this.core.handover(
      Number(body.driverId), Number(body.vehicleId), !!body.delayed, body.reason || '',
      body.nextTripId ? Number(body.nextTripId) : null, req.user.name,
    );
  }

  // 休息 / 复班（司机休息约束）
  @Post(':id/rest')
  rest(@Param('id') id: string, @Body() body: any) {
    return this.core.dutyToggle(Number(id), body.resting !== false);
  }
}
