import { Controller, Get, UseGuards } from '@nestjs/common';
import { CoreService } from '../core.service';
import { JwtAuthGuard } from '../auth.guard';

// 包车申请走 visitor；这里只读给调度/前端
@Controller('charters')
@UseGuards(JwtAuthGuard)
export class CharterController {
  constructor(private core: CoreService) {}

  @Get()
  list() {
    return this.core.listCharters();
  }
}
