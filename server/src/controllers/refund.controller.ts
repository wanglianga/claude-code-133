import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CoreService } from '../core.service';
import { JwtAuthGuard } from '../auth.guard';
import { Roles } from '../roles.decorator';
import { ROLE } from '../entities';

@Controller('refunds')
@UseGuards(JwtAuthGuard)
export class RefundController {
  constructor(private core: CoreService) {}

  @Get()
  list(@Query('status') status: string) {
    return this.core.listRefunds(status);
  }

  // 客服受理 / 通过 / 驳回
  @Post(':id/cs-decide')
  @Roles(ROLE.CS, ROLE.CS_LEAD, ROLE.ADMIN)
  decide(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.core.csDecide(Number(id), body.action, req.user, body.note);
  }

  // 争议升级客服主管
  @Post(':id/escalate')
  @Roles(ROLE.CS, ROLE.CS_LEAD, ROLE.ADMIN)
  escalate(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.core.escalate(Number(id), req.user, body.note || '游客有异议，升级主管');
  }

  // 客服主管裁决
  @Post(':id/supervisor')
  @Roles(ROLE.CS_LEAD, ROLE.ADMIN)
  supervisor(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.core.supervisorDecide(Number(id), !!body.approve, req.user, body.note || '');
  }

  // 财务退款出账
  @Post(':id/pay')
  @Roles(ROLE.FINANCE, ROLE.ADMIN)
  pay(@Param('id') id: string, @Req() req: any) {
    return this.core.financePay(Number(id), req.user);
  }
}
