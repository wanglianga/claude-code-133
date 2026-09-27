import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { standaloneSource } from './data-source';
import { ensureDatabase } from './ensure-db';
import {
  User, Station, Route, RouteStop, Vehicle, Driver, Weather, Ticket, ROLE,
  TICKET_TYPE, VEHICLE_STATUS, DRIVER_STATUS,
} from './entities';

async function run() {
  await ensureDatabase();
  const ds = await standaloneSource.initialize();

  // 幂等：清空业务表
  await ds.query('SET FOREIGN_KEY_CHECKS=0');
  for (const t of [
    'station_snapshots', 'geofence_violations', 'safety_checks', 'weather', 'broadcasts',
    'refunds', 'incidents', 'board_logs', 'queue_entries', 'trips', 'charters', 'tickets',
    'drivers', 'vehicles', 'route_stops', 'routes', 'stations', 'users',
  ]) {
    await ds.query(`TRUNCATE TABLE \`${t}\``);
  }
  await ds.query('SET FOREIGN_KEY_CHECKS=1');

  const pw = await bcrypt.hash('123456', 10);
  const accounts: Array<[string, string, string, string]> = [
    ['visitor', '游客小明', ROLE.VISITOR, '13800000001'],
    ['staff01', '东门站员', ROLE.STAFF, '13800000002'],
    ['staff02', '山顶站员', ROLE.STAFF, '13800000003'],
    ['driver01', '司机王师傅', ROLE.DRIVER, '13800000004'],
    ['driver02', '司机李师傅', ROLE.DRIVER, '13800000005'],
    ['dispatch', '调度张主任', ROLE.DISPATCH, '13800000006'],
    ['cs', '客服小陈', ROLE.CS, '13800000007'],
    ['cslead', '客服赵主管', ROLE.CS_LEAD, '13800000008'],
    ['finance', '财务孙会计', ROLE.FINANCE, '13800000009'],
    ['admin', '系统管理员', ROLE.ADMIN, ''],
  ];
  await ds.getRepository(User).save(
    accounts.map(([username, name, role, phone]) =>
      ds.getRepository(User).create({ username, name, role, phone, passwordHash: pw }),
    ),
  );

  // 站点（环线一圈 + 东门↔山顶单程）
  const stationsDef = [
    ['东门', 'EAST', 30.2741, 120.1551, 30, true],
    ['湖滨', 'LAKE', 30.2705, 120.1588, 80, false],
    ['梅园', 'MEI', 30.2669, 120.1622, 120, true],
    ['索道下站', 'CABLE_LOW', 30.2630, 120.1601, 100, false],
    ['山顶观景台', 'TOP', 30.2590, 120.1550, 60, true],
    ['竹林', 'BAMBOO', 30.2635, 120.1490, 90, false],
    ['亲子乐园', 'FAMILY', 30.2690, 120.1498, 110, true],
  ];
  const stations = await ds.getRepository(Station).save(
    stationsDef.map(([name, code, lat, lng, limit, hot]) =>
      ds.getRepository(Station).create({
        name: name as string, code: code as string, lat: lat as number, lng: lng as number,
        crowdLimit: limit as number, hot: hot as boolean, queueWarnSec: 180,
      }),
    ),
  );

  const loop = await ds.getRepository(Route).save(
    ds.getRepository(Route).create({ name: '景区环湖观光线', code: 'LOOP', kind: 'loop', roundMinutes: 40 }),
  );
  const oneway = await ds.getRepository(Route).save(
    ds.getRepository(Route).create({ name: '东门—山顶直达线', code: 'UP', kind: 'oneway', roundMinutes: 25 }),
  );
  await ds.getRepository(RouteStop).save(
    stations.map((s, i) => ds.getRepository(RouteStop).create({ routeId: loop.id, stationId: s.id, seq: i + 1 })),
  );
  await ds.getRepository(RouteStop).save(
    [stations[0], stations[3], stations[4]].map((s, i) =>
      ds.getRepository(RouteStop).create({ routeId: oneway.id, stationId: s.id, seq: i + 1 }),
    ),
  );

  const vehicles = await ds.getRepository(Vehicle).save([
    ds.getRepository(Vehicle).create({ plate: '浙A·S001', name: '环湖1号', seats: 24, wheelchairSlots: 2, accessible: true, batteryPct: 92, lat: stations[0].lat, lng: stations[0].lng }),
    ds.getRepository(Vehicle).create({ plate: '浙A·S002', name: '环湖2号', seats: 30, wheelchairSlots: 1, accessible: true, batteryPct: 78, lat: stations[2].lat, lng: stations[2].lng }),
    ds.getRepository(Vehicle).create({ plate: '浙A·S003', name: '直达3号', seats: 18, wheelchairSlots: 3, accessible: true, batteryPct: 40, lat: stations[4].lat, lng: stations[4].lng }),
    ds.getRepository(Vehicle).create({ plate: '浙A·S004', name: '环湖4号', seats: 24, wheelchairSlots: 0, accessible: false, batteryPct: 65, status: VEHICLE_STATUS.IDLE }),
    ds.getRepository(Vehicle).create({ plate: '浙A·S005', name: '待补能5号', seats: 24, wheelchairSlots: 2, accessible: true, batteryPct: 15, status: VEHICLE_STATUS.IDLE }),
  ]);

  const drivers = await ds.getRepository(Driver).save([
    ds.getRepository(Driver).create({ name: '王师傅', licenseNo: 'D1001', phone: '13800000004', status: DRIVER_STATUS.ON, currentVehicleId: vehicles[0].id, workedMinutes: 120 }),
    ds.getRepository(Driver).create({ name: '李师傅', licenseNo: 'D1002', phone: '13800000005', status: DRIVER_STATUS.ON, currentVehicleId: vehicles[1].id, workedMinutes: 300 }),
    ds.getRepository(Driver).create({ name: '赵师傅', licenseNo: 'D1003', phone: '13800000010', status: DRIVER_STATUS.RESTING, restMinutes: 30 }),
  ]);

  await ds.getRepository(Weather).save([
    ds.getRepository(Weather).create({ stationId: null, condition: 'cloudy', tempC: 26, windLevel: 2, alert: '' }),
    ds.getRepository(Weather).create({ stationId: stations[4].id, condition: 'cloudy', tempC: 22, windLevel: 4, alert: '山顶风大，注意扶稳' }),
  ]);

  // 几张示例票
  await ds.getRepository(Ticket).save([
    ds.getRepository(Ticket).create({
      code: 'TDEMO0001', visitorName: '张三', phone: '13900000001', type: TICKET_TYPE.ACCESSIBLE,
      price: '25.00', parkInTime: new Date(), originStationId: stations[0].id, destStationId: stations[4].id,
      partySize: 1, hasElder: true, priority: true, plannedRoute: '东门-山顶-梅园',
    }),
    ds.getRepository(Ticket).create({
      code: 'TDEMO0002', visitorName: '李四一家', phone: '13900000002', type: TICKET_TYPE.FAMILY,
      price: '45.00', parkInTime: new Date(), originStationId: stations[6].id, destStationId: stations[2].id,
      partySize: 3, stroller: true, hasChild: true, plannedRoute: '亲子乐园-梅园-湖滨',
    }),
  ]);

  // eslint-disable-next-line no-console
  console.log('种子数据完成：');
  // eslint-disable-next-line no-console
  console.log('  账号密码均为 123456：visitor / staff01 / staff02 / driver01 / driver02 / dispatch / cs / cslead / finance / admin');
  await ds.destroy();
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
