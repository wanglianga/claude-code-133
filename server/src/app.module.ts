import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './data-source';
import { env } from './config';
import { AuthController } from './controllers/auth.controller';
import { RefController } from './controllers/ref.controller';
import { VisitorController } from './controllers/visitor.controller';
import { StationController } from './controllers/station.controller';
import { DispatchController } from './controllers/dispatch.controller';
import { DriverController } from './controllers/driver.controller';
import { IncidentController } from './controllers/incident.controller';
import { RefundController } from './controllers/refund.controller';
import { CharterController } from './controllers/charter.controller';
import { ReportController } from './controllers/report.controller';
import { CoreService } from './core.service';

@Module({
  imports: [
    TypeOrmModule.forRoot(dataSourceOptions(true)),
    JwtModule.register({ secret: env().jwtSecret, signOptions: { expiresIn: '12h' } }),
  ],
  controllers: [
    AuthController,
    RefController,
    VisitorController,
    StationController,
    DispatchController,
    DriverController,
    IncidentController,
    RefundController,
    CharterController,
    ReportController,
  ],
  providers: [CoreService],
})
export class AppModule {}
