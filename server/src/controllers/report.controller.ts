import { Controller, Get, UseGuards } from '@nestjs/common';
import { CoreService } from '../core.service';
import { JwtAuthGuard } from '../auth.guard';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportController {
  constructor(private core: CoreService) {}

  @Get('overview')
  overview() {
    return this.core.report();
  }
}
