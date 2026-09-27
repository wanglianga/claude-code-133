import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CoreService } from '../core.service';
import { JwtAuthGuard } from '../auth.guard';

@Controller('incidents')
@UseGuards(JwtAuthGuard)
export class IncidentController {
  constructor(private core: CoreService) {}

  @Get()
  list(@Query() q: any) {
    return this.core.listIncidents(q);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.core.updateIncident(Number(id), body, req.user);
  }
}
