import { Controller, Get } from '@nestjs/common';
import { CoreService } from '../core.service';

@Controller('ref')
export class RefController {
  constructor(private core: CoreService) {}

  @Get()
  ref() {
    return this.core.reference();
  }
}
