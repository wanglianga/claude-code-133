import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, MoreThan, IsNull, Not, In } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import {
  User, Station, Route, RouteStop, Vehicle, Driver, Ticket, Charter, Trip,
  QueueEntry, BoardLog, Incident, Refund, Broadcast, Weather, SafetyCheck,
  GeofenceViolation, StationSnapshot,
  TICKET_TYPE, TICKET_STATUS, TRIP_STATUS, VEHICLE_STATUS, DRIVER_STATUS,
  INCIDENT_TYPE, INCIDENT_STATUS, REFUND_STATUS, STATION_STATUS, ROLE,
} from './entities';

const PRICE: Record<string, number> = {
  [TICKET_TYPE.SINGLE]: 20,
  [TICKET_TYPE.LOOP]: 50,
  [TICKET_TYPE.FAMILY]: 45,
  [TICKET_TYPE.ACCESSIBLE]: 25,
};
const LOW_BATTERY = 25;
const FENCE_M = 1200; // 超出最近站点 1200 米视为越界

function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function code(prefix: string) {
  return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class CoreService {
  constructor(@InjectDataSource() private ds: DataSource) {}

  repo = <T>(e: T) => this.ds.getRepository(e as any);

  /* ================= 鉴权 ================= */
  async validateUser(username: string, password: string) {
    const user = await this.repo(User).findOne({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new ForbiddenException('用户名或密码错误');
    }
    return { id: user.id, username: user.username, name: user.name, role: user.role };
  }

  /* ================= 基础数据 ================= */
  async reference() {
    const [stations, routes, routeStops, vehicles, drivers, weather] = await Promise.all([
      this.repo(Station).find({ order: { id: 1 } }),
      this.repo(Route).find(),
      this.repo(RouteStop).find({ order: { seq: 1 } }),
      this.repo(Vehicle).find({ order: { id: 1 } }),
      this.repo(Driver).find({ order: { id: 1 } }),
      this.repo(Weather).find({ order: { id: 'DESC' }, take: 20 }),
    ]);
    return { stations, routes, routeStops, vehicles, drivers, weather };
  }

  async orderedStops(routeId: number, direction: number) {
    const stops = await this.repo(RouteStop).find({ where: { routeId }, order: { seq: 1 } });
    const withStation = await this.repo(Station).find({ where: { id: In(stops.map((s) => s.stationId)) } });
    const map = new Map(withStation.map((s) => [s.id, s]));
    const list = stops.map((s) => map.get(s.stationId)!).filter(Boolean);
    return direction === 2 ? list.slice().reverse() : list;
  }

  /* ================= 游客：购票 ================= */
  async buyTicket(dto: any) {
    const type = dto.type || TICKET_TYPE.SINGLE;
    if (!PRICE[type]) throw new BadRequestException('票种不合法');
    const origin = await this.repo(Station).findOne({ where: { id: Number(dto.originStationId) } });
    const dest = await this.repo(Station).findOne({ where: { id: Number(dto.destStationId) } });
    if (!origin || !dest) throw new BadRequestException('起终点站不存在');
    if (origin.id === dest.id && type !== TICKET_TYPE.LOOP) throw new BadRequestException('起终点不能相同');
    const partySize = Math.max(1, Number(dto.partySize || 1));
    const priority = type === TICKET_TYPE.ACCESSIBLE || !!dto.hasElder;
    const price = type === TICKET_TYPE.FAMILY ? PRICE[type] : PRICE[type] * (type === TICKET_TYPE.ACCESSIBLE ? partySize : type === TICKET_TYPE.SINGLE ? partySize : 1);
    const ticket = this.repo(Ticket).create({
      code: code('T'),
      visitorName: dto.visitorName || '游客',
      phone: dto.phone || '',
      type,
      price: price.toFixed(2),
      parkInTime: dto.parkInTime ? new Date(dto.parkInTime) : new Date(),
      originStationId: origin.id,
      destStationId: dest.id,
      partySize,
      stroller: !!dto.stroller,
      hasElder: !!dto.hasElder,
      hasChild: !!dto.hasChild || type === TICKET_TYPE.FAMILY,
      plannedRoute: dto.plannedRoute || '',
      priority,
    });
    return this.repo(Ticket).save(ticket);
  }

  async myTickets(phone: string, name?: string) {
    const where: any = phone ? { phone } : { visitorName: name || '' };
    return this.repo(Ticket).find({ where, order: { id: 'DESC' }, take: 50 });
  }

  async ticketByCode(ticketCode: string) {
    const t = await this.repo(Ticket).findOne({ where: { code: ticketCode } });
    if (!t) throw new NotFoundException('车票不存在');
    return t;
  }

  /* ================= 站点平板 ================= */
  async stationBoard(stationId: number) {
    const station = await this.repo(Station).findOne({ where: { id: stationId } });
    if (!station) throw new NotFoundException('站点不存在');
    const waiting = await this.repo(QueueEntry).count({ where: { stationId, status: 'waiting' } });
    const waitingPriority = await this.repo(QueueEntry).count({ where: { stationId, status: 'waiting', priority: true } });
    const checkedToday = await this.repo(BoardLog).count({ where: { stationId, action: 'checkin', at: MoreThan(startOfToday()) } });
    const boardedToday = await this.repo(QueueEntry).count({ where: { stationId, status: 'boarded', boardedAt: MoreThan(startOfToday()) } });
    const avgRow = await this.repo(QueueEntry)
      .createQueryBuilder('q')
      .select('AVG(q.waitSec)', 'avg')
      .where('q.stationId = :s', { s: stationId })
      .andWhere('q.status = :st', { st: 'boarded' })
      .getRawOne<{ avg: number | null }>();
    const queue = await this.repo(QueueEntry).find({
      where: { stationId, status: 'waiting' },
      order: { priority: 'DESC', enqueuedAt: 1 },
      take: 30,
    });
    const tickets = await this.repo(Ticket).find({ where: { id: In(queue.map((q) => q.ticketId)) } });
    const tmap = new Map(tickets.map((t) => [t.id, t]));

    // 当前相关车辆（在本站或下一班将经过本站）
    const vehicles = await this.repo(Vehicle).find();
    const trips = await this.repo(Trip).find({
      where: { status: In([TRIP_STATUS.SCHEDULED, TRIP_STATUS.BOARDING, TRIP_STATUS.RUNNING, TRIP_STATUS.DELAYED]) },
      order: { scheduledDepart: 1 },
    });
    const drivers = await this.repo(Driver).find();
    const dmap = new Map(drivers.map((d) => [d.id, d]));
    const enrichedTrips: any[] = [];
    for (const tr of trips) {
      const v = vehicles.find((x) => x.id === tr.vehicleId);
      const stops = await this.orderedStops(tr.routeId, tr.direction);
      const serves = stops.some((s) => s.id === stationId);
      if (!serves) continue;
      enrichedTrips.push({
        ...tr,
        vehicle: v,
        driver: dmap.get(tr.driverId),
        seatsRemain: (v?.seats || 0) - tr.seatsSold,
        wheelchairRemain: (v?.wheelchairSlots || 0) - tr.wheelchairUsed,
        stops: stops.map((s) => ({ id: s.id, name: s.name })),
      });
    }

    const weather =
      (await this.repo(Weather).findOne({ where: { stationId }, order: { id: 'DESC' } })) ||
      (await this.repo(Weather).findOne({ where: { stationId: IsNull() }, order: { id: 'DESC' } }));

    const avgWaitSec = Math.round(Number(avgRow?.avg || 0));
    const crowded = waiting > station.crowdLimit || avgWaitSec > station.queueWarnSec;

    // 拥堵自动事件
    if (crowded) await this.autoIncident(INCIDENT_TYPE.LONG_QUEUE, stationId, waiting, avgWaitSec);

    return {
      station,
      weather,
      queue: queue.map((q) => ({ ...q, ticket: tmap.get(q.ticketId) })),
      stats: { waiting, waitingPriority, checkedToday, boardedToday, avgWaitSec, crowded },
      trips: enrichedTrips,
    };
  }

  // 检票入园 → 进入排队
  async checkin(ticketCode: string, stationId: number, operator: string) {
    const ticket = await this.ticketByCode(ticketCode);
    if ([TICKET_STATUS.REFUNDED, TICKET_STATUS.REFUND_PENDING, TICKET_STATUS.COMPLETED].includes(ticket.status as any)) {
      throw new BadRequestException(`车票当前状态不可检票：${ticket.status}`);
    }
    if (ticket.originStationId !== stationId) {
      // 非票面起点站也允许检票（环线多站可乘），但记录提示
      await this.logBoard(ticket.id, stationId, null, 'checkin', operator, '非票面起点站检票');
    }
    const exist = await this.repo(QueueEntry).findOne({ where: { ticketId: ticket.id, status: 'waiting' } });
    if (exist) throw new BadRequestException('该票已在排队中');
    const entry = await this.repo(QueueEntry).save(
      this.repo(QueueEntry).create({
        stationId,
        ticketId: ticket.id,
        priority: ticket.priority,
        enqueuedAt: new Date(),
      }),
    );
    ticket.status = TICKET_STATUS.QUEUED;
    ticket.checkedAt = new Date();
    await this.repo(Ticket).save(ticket);
    await this.logBoard(ticket.id, stationId, null, 'checkin', operator, '检票进入排队');
    await this.snapshot(stationId);
    return entry;
  }

  /* 上车：按 优先 → 先到先服务 取下一位可容纳乘客；可指定票码人工放行 */
  async board(ticketCode: string | null, stationId: number, tripId: number, operator: string) {
    return this.ds.transaction(async (m) => {
      const trip = await m.findOne(Trip, { where: { id: tripId }, lock: { mode: 'pessimistic_write' } });
      if (!trip) throw new NotFoundException('班次不存在');
      if ([TRIP_STATUS.SUSPENDED, TRIP_STATUS.COMPLETED, TRIP_STATUS.CANCELLED].includes(trip.status as any))
        throw new BadRequestException('该班次不可上客');
      const vehicle = await m.findOne(Vehicle, { where: { id: trip.vehicleId } });
      if (!vehicle) throw new NotFoundException('车辆不存在');

      let entry: QueueEntry | null = null;
      const qb = m
        .getRepository(QueueEntry)
        .createQueryBuilder('q')
        .where('q.stationId = :s', { s: stationId })
        .andWhere('q.status = :w', { w: 'waiting' })
        .orderBy('q.priority', 'DESC')
        .addOrderBy('q.enqueuedAt', 'ASC')
        .setLock('pessimistic_write');
      if (ticketCode) {
        const ticket = await m.findOne(Ticket, { where: { code: ticketCode } });
        if (ticket) entry = await m.findOne(QueueEntry, { where: { ticketId: ticket.id, status: 'waiting' } });
      } else {
        entry = await qb.getOne();
      }
      if (!entry) throw new BadRequestException('没有可上车的排队乘客');
      const ticket = await m.findOne(Ticket, { where: { id: entry.ticketId } });
      if (!ticket) throw new NotFoundException('车票缺失');

      // 反方向校验：目的地必须在本班次运行方向的后续站点中
      const stops = await this.orderedStops(trip.routeId, trip.direction);
      const idxHere = stops.findIndex((s) => s.id === stationId);
      const idxDest = stops.findIndex((s) => s.id === ticket.destStationId);
      const route = await m.findOne(Route, { where: { id: trip.routeId } });
      const wrong =
        idxDest === -1 ||
        (route?.kind !== 'loop' && idxHere >= 0 && idxDest >= 0 && idxDest < idxHere);
      if (wrong) {
        // 用独立连接记录，避免随本次事务回滚丢失
        await this.logBoard(ticket.id, stationId, trip.id, 'wrong_direction', operator, '目的地不在本班次方向');
        await this.raiseIncident(null, {
          type: INCIDENT_TYPE.WRONG_DIRECTION,
          severity: 'warn',
          title: `游客误上反方向（票 ${ticket.code}）`,
          detail: `本站 ${stops[idxHere]?.name || stationId}，目的地站序不符，班次 #${trip.id} 方向 ${trip.direction}`,
          raisedBy: operator,
          ownerRole: ROLE.STAFF,
          ticketId: ticket.id, tripId: trip.id, stationId, vehicleId: vehicle.id,
        });
        throw new BadRequestException('该乘客目的地与班次方向相反，已拦截并登记事件');
      }

      const needWheel = ticket.type === TICKET_TYPE.ACCESSIBLE ? 1 : ticket.stroller ? 1 : 0;
      const seatsRemain = vehicle.seats - trip.seatsSold;
      const wheelRemain = vehicle.wheelchairSlots - trip.wheelchairUsed;
      if (seatsRemain < ticket.partySize) {
        throw new BadRequestException('车辆普通座位不足');
      }
      if (needWheel > wheelRemain) throw new BadRequestException('轮椅/婴儿车位不足');

      trip.seatsSold += ticket.partySize;
      trip.wheelchairUsed += needWheel;
      trip.status = trip.status === TRIP_STATUS.SCHEDULED ? TRIP_STATUS.BOARDING : trip.status;
      trip.currentStationId = stationId;
      await m.save(trip);

      entry.status = 'boarded';
      entry.tripId = trip.id;
      entry.boardedAt = new Date();
      entry.waitSec = Math.round((entry.boardedAt.getTime() - entry.enqueuedAt.getTime()) / 1000);
      await m.save(entry);

      ticket.status = TICKET_STATUS.BOARDED;
      ticket.tripId = trip.id;
      ticket.boardedAt = new Date();
      if (ticket.type === TICKET_TYPE.LOOP) ticket.usedLegs += 1;
      await m.save(ticket);

      await this.logBoardWith(m, ticket.id, stationId, trip.id, 'board', operator, `上车 ${ticket.partySize} 人`);
      await this.snapshotWith(m, stationId);
      return { trip, ticket, waitSec: entry.waitSec };
    });
  }

  /* ================= 调度中心 ================= */
  async createTrip(dto: any, operator: string) {
    const vehicleId = Number(dto?.vehicleId);
    const driverId = Number(dto?.driverId);
    const routeId = Number(dto?.routeId);
    const originStationId = Number(dto?.originStationId);
    if (!vehicleId || !driverId || !routeId || !originStationId) {
      throw new BadRequestException('派班参数不完整：routeId/vehicleId/driverId/originStationId 必填');
    }
    const vehicle = await this.repo(Vehicle).findOne({ where: { id: vehicleId } });
    const driver = await this.repo(Driver).findOne({ where: { id: driverId } });
    if (!vehicle || !driver) throw new BadRequestException('车辆或司机不存在');
    if (vehicle.status === VEHICLE_STATUS.MAINTENANCE) throw new BadRequestException('车辆故障维修中，不可派班');
    if (vehicle.status === VEHICLE_STATUS.CHARGING) throw new BadRequestException('车辆充电中，不可派班');
    if (vehicle.batteryPct < LOW_BATTERY) throw new BadRequestException(`电量 ${vehicle.batteryPct}% 低于 ${LOW_BATTERY}%，请先补能`);
    if (driver.status === DRIVER_STATUS.RESTING) throw new BadRequestException('司机强制休息中，不能排班');
    if (driver.workedMinutes >= driver.maxWorkMinutes) throw new BadRequestException('司机已达工时上限，必须休息');
    const conflict = await this.repo(Trip).findOne({
      where: { driverId: driver.id, status: In([TRIP_STATUS.SCHEDULED, TRIP_STATUS.BOARDING, TRIP_STATUS.RUNNING, TRIP_STATUS.DELAYED]) },
    });
    if (conflict) throw new BadRequestException('司机有未完成班次');

    const trip = await this.repo(Trip).save(
      this.repo(Trip).create({
        routeId: Number(dto.routeId),
        direction: Number(dto.direction || 1),
        vehicleId: vehicle.id,
        driverId: driver.id,
        scheduledDepart: new Date(dto.scheduledDepart || Date.now()),
        originStationId: Number(dto.originStationId),
        currentStationId: Number(dto.originStationId),
        createdBy: operator,
        status: TRIP_STATUS.SCHEDULED,
      }),
    );
    vehicle.status = VEHICLE_STATUS.IDLE;
    driver.status = DRIVER_STATUS.ON;
    if (!driver.shiftStart) driver.shiftStart = new Date();
    await this.repo(Vehicle).save(vehicle);
    await this.repo(Driver).save(driver);
    return trip;
  }

  async departTrip(tripId: number) {
    const trip = await this.ds.transaction(async (m) => {
      const t = await m.findOne(Trip, { where: { id: tripId }, lock: { mode: 'pessimistic_write' } });
      if (!t) throw new NotFoundException('班次不存在');
      if (t.status === TRIP_STATUS.SUSPENDED) throw new BadRequestException('已临时停运');
      const checks = await m.count(SafetyCheck, { where: { vehicleId: t.vehicleId, passed: true } });
      if (checks === 0) throw new BadRequestException('司机尚未完成发车前安全检查');
      t.status = TRIP_STATUS.RUNNING;
      t.actualDepart = new Date();
      await m.save(t);
      const v = await m.findOne(Vehicle, { where: { id: t.vehicleId } });
      const d = await m.findOne(Driver, { where: { id: t.driverId } });
      if (v) { v.status = VEHICLE_STATUS.RUNNING; await m.save(v); }
      if (d) { d.status = DRIVER_STATUS.DRIVING; await m.save(d); }
      return t;
    });
    return trip;
  }

  // 车辆位置 / 电量上报，含电子围栏判定
  async reportPosition(tripId: number, lat: number, lng: number, batteryPct: number | null) {
    const trip = await this.repo(Trip).findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('班次不存在');
    const vehicle = await this.repo(Vehicle).findOne({ where: { id: trip.vehicleId } });
    if (!vehicle) throw new NotFoundException('车辆不存在');
    vehicle.lat = lat;
    vehicle.lng = lng;
    if (batteryPct != null) vehicle.batteryPct = Math.max(0, Math.min(100, Math.round(batteryPct)));
    await this.repo(Vehicle).save(vehicle);

    // 电子围栏：距最近站点过远 → 越界
    const stations = await this.repo(Station).find();
    const nearest = stations.reduce(
      (best: { s: Station; d: number }, s: Station) => {
        const d = distM({ lat, lng }, { lat: s.lat, lng: s.lng });
        return d < best.d ? { s, d } : best;
      },
      { s: stations[0], d: Infinity },
    );
    if (nearest.d > FENCE_M) {
      await this.repo(GeofenceViolation).save(
        this.repo(GeofenceViolation).create({ vehicleId: vehicle.id, tripId: trip.id, lat, lng, detail: `偏离最近站点 ${nearest.s.name} ${Math.round(nearest.d)} 米` }),
      );
      await this.raiseIncident(null, {
        type: INCIDENT_TYPE.GEOFENCE, severity: 'critical',
        title: `车辆 ${vehicle.plate} 驶出电子围栏`,
        detail: `距最近站点 ${nearest.s.name} ${Math.round(nearest.d)} 米`,
        raisedBy: 'system', ownerRole: ROLE.DISPATCH, tripId, vehicleId: vehicle.id,
      });
    }

    if (vehicle.batteryPct < LOW_BATTERY) {
      await this.autoIncident(INCIDENT_TYPE.CONGESTION, null, 0, 0, `车辆 ${vehicle.plate} 电量 ${vehicle.batteryPct}% 偏低`, tripId, vehicle.id);
    }
    return { vehicle, nearestStation: nearest.s.name, nearestDist: Math.round(nearest.d) };
  }

  // 满载跳站
  async skipStation(tripId: number, stationId: number, operator: string) {
    const trip = await this.repo(Trip).findOne({ where: { id: tripId } });
    const vehicle = await this.repo(Vehicle).findOne({ where: { id: trip?.vehicleId } });
    if (!trip || !vehicle) throw new NotFoundException('班次/车辆不存在');
    if (!(trip.skippedStations || []).includes(stationId)) trip.skippedStations = [...(trip.skippedStations || []), stationId];
    await this.repo(Trip).save(trip);
    const waiting = await this.repo(QueueEntry).count({ where: { stationId, status: 'waiting' } });
    const station = await this.repo(Station).findOne({ where: { id: stationId } });
    await this.raiseIncident(null, {
      type: INCIDENT_TYPE.FULL_SKIP, severity: 'warn',
      title: `满载跳站：${station?.name}`,
      detail: `班次 #${trip.id}（${vehicle.plate}）满载，越过 ${station?.name}，该站 ${waiting} 人继续等待`,
      raisedBy: operator, ownerRole: ROLE.DISPATCH, tripId, stationId, vehicleId: vehicle.id,
    });
    if (waiting > 0) {
      await this.repo(Broadcast).save(
        this.repo(Broadcast).create({
          stationId, channel: 'station',
          content: `${station?.name}：班次 #${trip.id} 满载跳站，请等候下一班，优先乘客仍优先安排。`,
          createdBy: operator,
        }),
      );
    }
    return trip;
  }

  // 道路管制：登记事件，可选停运经过该站点/线路的在途班次并广播
  async roadControl(dto: any, operator: string) {
    const reason = dto.reason || '道路临时管制';
    const stationId = dto.stationId ? Number(dto.stationId) : null;
    const routeId = dto.routeId ? Number(dto.routeId) : null;
    const station = stationId ? await this.repo(Station).findOne({ where: { id: stationId } }) : null;

    // 找出受影响的在途/待发班次
    const active = (await this.repo(Trip).find({
      where: { status: In([TRIP_STATUS.SCHEDULED, TRIP_STATUS.BOARDING, TRIP_STATUS.RUNNING, TRIP_STATUS.DELAYED]) },
    })) as Trip[];
    const affected: Trip[] = [];
    for (const t of active) {
      if (routeId && t.routeId !== routeId) continue;
      if (stationId) {
        const stops = await this.orderedStops(t.routeId, t.direction);
        if (!stops.some((s) => s.id === stationId)) continue;
      }
      affected.push(t);
    }
    if (dto.suspend) {
      for (const t of affected) { t.status = TRIP_STATUS.SUSPENDED; t.note = `道路管制：${reason}`; await this.repo(Trip).save(t); }
    }
    await this.repo(Broadcast).save(
      this.repo(Broadcast).create({
        stationId, channel: 'all',
        content: `道路管制：${reason}${station ? '（' + station.name + '附近）' : ''}，受影响班次 ${affected.length} 班${dto.suspend ? '已临时停运，未使用车票可退' : '请减速绕行'}。`,
        createdBy: operator,
      }),
    );
    const inc = await this.raiseIncident(null, {
      type: INCIDENT_TYPE.ROAD_CONTROL, severity: dto.suspend ? 'critical' : 'warn',
      title: `道路管制${station ? '：' + station.name : routeId ? '：线路调整' : ''}`,
      detail: `${reason}；受影响班次 ${affected.length} 班（#${affected.map((t) => t.id).join(',#') || '无'}）`,
      raisedBy: operator, ownerRole: ROLE.DISPATCH, stationId,
    });
    return { incident: inc, affectedTripIds: affected.map((t) => t.id) };
  }

  // 暴雨临时停运 / 恢复
  async setSuspension(tripIds: number[], suspended: boolean, reason: string, operator: string) {
    const trips = await this.repo(Trip).find({ where: { id: In(tripIds) } });
    for (const t of trips) {
      t.status = suspended ? TRIP_STATUS.SUSPENDED : TRIP_STATUS.SCHEDULED;
      t.note = reason;
      await this.repo(Trip).save(t);
      await this.raiseIncident(null, {
        type: INCIDENT_TYPE.STORM_SUSPENSION,
        severity: suspended ? 'critical' : 'info',
        title: suspended ? `班次 #${t.id} 临时停运` : `班次 #${t.id} 恢复运行`,
        detail: reason, raisedBy: operator, ownerRole: ROLE.DISPATCH, tripId: t.id,
      });
    }
    await this.repo(Broadcast).save(
      this.repo(Broadcast).create({
        stationId: null, channel: 'all',
        content: suspended ? `受天气影响临时停运：${reason}，未使用车票可全额退票。` : `停运解除，班次陆续恢复：${reason}`,
        createdBy: operator,
      }),
    );
    return { affected: trips.length };
  }

  // 完成班次（车辆回场，结算工时与利用率）
  async completeTrip(tripId: number) {
    return this.ds.transaction(async (m) => {
      const t = await m.findOne(Trip, { where: { id: tripId }, lock: { mode: 'pessimistic_write' } });
      if (!t) throw new NotFoundException('班次不存在');
      const v = await m.findOne(Vehicle, { where: { id: t.vehicleId } });
      const d = await m.findOne(Driver, { where: { id: t.driverId } });
      t.status = TRIP_STATUS.COMPLETED;
      t.completedAt = new Date();
      if (v) t.loadSnapshot = Math.round((t.seatsSold / Math.max(1, v.seats)) * 100);
      await m.save(t);
      if (v) { v.status = VEHICLE_STATUS.IDLE; await m.save(v); }
      if (d) {
        d.workedMinutes += Math.max(20, Math.round((t.completedAt.getTime() - (t.actualDepart || t.scheduledDepart).getTime()) / 60000));
        d.status = d.workedMinutes >= d.maxWorkMinutes ? DRIVER_STATUS.RESTING : DRIVER_STATUS.ON;
        d.currentVehicleId = null;
        await m.save(d);
      }
      // 车上持票置为完成（单程到达；环线保留可继续乘）
      const boarded = await m.find(Ticket, { where: { tripId: t.id, status: TICKET_STATUS.BOARDED } });
      for (const tk of boarded) {
        if (tk.type === TICKET_TYPE.LOOP && tk.usedLegs < 4) {
          tk.status = TICKET_STATUS.ISSUED;
        } else {
          tk.status = TICKET_STATUS.COMPLETED;
          tk.completedAt = new Date();
        }
        await m.save(tk);
      }
      return t;
    });
  }

  async listTrips(status?: string) {
    const where = status ? { status } : {};
    const trips = await this.repo(Trip).find({ where, order: { id: 'DESC' }, take: 100 });
    const vehicles = await this.repo(Vehicle).find();
    const drivers = await this.repo(Driver).find();
    const routes = await this.repo(Route).find();
    const vmap = new Map(vehicles.map((v) => [v.id, v]));
    const dmap = new Map(drivers.map((d) => [d.id, d]));
    const rmap = new Map(routes.map((r) => [r.id, r]));
    return trips.map((t) => ({
      ...t,
      vehicle: vmap.get(t.vehicleId),
      driver: dmap.get(t.driverId),
      route: rmap.get(t.routeId),
      seatsRemain: (vmap.get(t.vehicleId)?.seats || 0) - t.seatsSold,
      wheelchairRemain: (vmap.get(t.vehicleId)?.wheelchairSlots || 0) - t.wheelchairUsed,
      utilizationPct: vmap.get(t.vehicleId) ? Math.round((t.seatsSold / vmap.get(t.vehicleId)!.seats) * 100) : 0,
    }));
  }

  /* ================= 司机 ================= */
  async safetyCheck(driverId: number, vehicleId: number, items: Record<string, boolean>, note: string) {
    const passed = Object.values(items || {}).every(Boolean) && Object.keys(items || {}).length > 0;
    const chk = await this.repo(SafetyCheck).save(
      this.repo(SafetyCheck).create({ driverId, vehicleId, items: items || {}, note, passed }),
    );
    if (!passed) {
      await this.raiseIncident(null, {
        type: INCIDENT_TYPE.VEHICLE_FAULT, severity: 'critical',
        title: `车辆 #${vehicleId} 安全检查未通过`, detail: note || '存在检查项不合格',
        raisedBy: `driver#${driverId}`, ownerRole: ROLE.DISPATCH, vehicleId, driverId,
      });
      const v = await this.repo(Vehicle).findOne({ where: { id: vehicleId } });
      if (v) { v.status = VEHICLE_STATUS.MAINTENANCE; await this.repo(Vehicle).save(v); }
    }
    return chk;
  }

  // 交班；延误将影响下一班发车
  async handover(driverId: number, vehicleId: number, delayed: boolean, reason: string, nextTripId: number | null, operator: string) {
    const driver = await this.repo(Driver).findOne({ where: { id: driverId } });
    if (driver) {
      driver.currentVehicleId = delayed ? driver.currentVehicleId : null;
      if (!delayed) driver.status = driver.workedMinutes >= driver.maxWorkMinutes ? DRIVER_STATUS.RESTING : DRIVER_STATUS.OFF;
      await this.repo(Driver).save(driver);
    }
    if (delayed && nextTripId) {
      const nt = await this.repo(Trip).findOne({ where: { id: nextTripId } });
      if (nt) { nt.status = TRIP_STATUS.DELAYED; nt.note = `交班延误：${reason}`; await this.repo(Trip).save(nt); }
      await this.raiseIncident(null, {
        type: INCIDENT_TYPE.HANDOVER_DELAY, severity: 'warn',
        title: `司机交班延误，影响班次 #${nextTripId}`,
        detail: reason, raisedBy: operator, ownerRole: ROLE.DISPATCH,
        tripId: nextTripId, driverId, vehicleId,
      });
    }
    return { delayed, nextTripId };
  }

  async dutyToggle(driverId: number, resting: boolean) {
    const d = await this.repo(Driver).findOne({ where: { id: driverId } });
    if (!d) throw new NotFoundException('司机不存在');
    if (resting) { d.status = DRIVER_STATUS.RESTING; d.restMinutes += 30; }
    else { d.status = DRIVER_STATUS.ON; d.workedMinutes = Math.max(0, d.workedMinutes - 30); }
    return this.repo(Driver).save(d);
  }

  async vehicleFault(vehicleId: number, detail: string, operator: string) {
    const v = await this.repo(Vehicle).findOne({ where: { id: vehicleId } });
    if (!v) throw new NotFoundException('车辆不存在');
    v.status = VEHICLE_STATUS.MAINTENANCE;
    await this.repo(Vehicle).save(v);
    return this.raiseIncident(null, {
      type: INCIDENT_TYPE.VEHICLE_FAULT, severity: 'critical',
      title: `车辆 ${v.plate} 故障`, detail, raisedBy: operator, ownerRole: ROLE.DISPATCH, vehicleId,
    });
  }

  async vehicleRepair(vehicleId: number, operator: string) {
    const v = await this.repo(Vehicle).findOne({ where: { id: vehicleId } });
    if (!v) throw new NotFoundException('车辆不存在');
    v.status = VEHICLE_STATUS.IDLE;
    v.batteryPct = Math.max(v.batteryPct, 60);
    await this.repo(Vehicle).save(v);
    return this.raiseIncident(null, {
      type: INCIDENT_TYPE.OTHER, severity: 'info',
      title: `车辆 ${v.plate} 维修完成恢复运营`, detail: '故障已排除，恢复可派班',
      raisedBy: operator, ownerRole: ROLE.DISPATCH, vehicleId,
    });
  }

  /* ================= 站点运营：广播 / 天气 / 限流 ================= */
  async broadcast(stationId: number | null, content: string, channel: string, operator: string) {
    return this.repo(Broadcast).save(
      this.repo(Broadcast).create({ stationId, content, channel, createdBy: operator }),
    );
  }
  async listBroadcasts(stationId?: number) {
    const where = stationId ? { stationId } : {};
    return this.repo(Broadcast).find({ where: where as any, order: { id: 'DESC' }, take: 30 });
  }
  async setWeather(stationId: number | null, condition: string, tempC: number, windLevel: number, alert: string) {
    const w = await this.repo(Weather).save(
      this.repo(Weather).create({ stationId, condition, tempC, windLevel, alert }),
    );
    if (condition === 'storm') {
      await this.raiseIncident(null, {
        type: INCIDENT_TYPE.STORM_SUSPENSION, severity: 'critical',
        title: '暴雨预警', detail: alert || '气象为暴雨，评估停运', raisedBy: 'weather', ownerRole: ROLE.DISPATCH,
      });
    }
    return w;
  }
  async setStationStatus(stationId: number, status: string, crowdLimit?: number) {
    const s = await this.repo(Station).findOne({ where: { id: stationId } });
    if (!s) throw new NotFoundException('站点不存在');
    s.status = status;
    if (crowwLimitValid(crowdLimit)) s.crowdLimit = Number(crowdLimit);
    await this.repo(Station).save(s);
    if (status === STATION_STATUS.RESTRICTED) {
      await this.raiseIncident(null, {
        type: INCIDENT_TYPE.CONGESTION, severity: 'warn',
        title: `${s.name} 启动限流`, detail: `滞留上限调整为 ${s.crowdLimit}`,
        raisedBy: 'dispatch', ownerRole: ROLE.STAFF, stationId,
      });
    }
    return s;
  }

  /* ================= 协同事件 ================= */
  async raiseIncident(m: any, data: any): Promise<Incident> {
    const repo = m ? m.getRepository(Incident) : this.repo(Incident);
    const inc = await repo.save(repo.create({ code: code('INC'), ...data }));
    return inc;
  }
  async autoIncident(type: string, stationId: number | null, waiting: number, waitSec: number, detailText?: string, tripId?: number, vehicleId?: number) {
    const titleMap: any = {
      [INCIDENT_TYPE.LONG_QUEUE]: '热门站点排队过长',
      [INCIDENT_TYPE.CONGESTION]: vehicleId ? '车辆电量偏低' : '站点拥堵',
    };
    const station = stationId ? await this.repo(Station).findOne({ where: { id: stationId } }) : null;
    const open = await this.repo(Incident).findOne({
      where: { type, stationId: stationId || IsNull(), status: Not(INCIDENT_STATUS.RESOLVED) },
    });
    if (open) return open;
    return this.raiseIncident(null, {
      type, severity: 'warn',
      title: `${titleMap[type] || type}${station ? '：' + station.name : ''}`,
      detail: detailText || `等待 ${waiting} 人，平均等待 ${waitSec} 秒`,
      raisedBy: 'system', ownerRole: ROLE.DISPATCH, stationId, tripId: tripId || null, vehicleId: vehicleId || null,
    });
  }
  async listIncidents(filter: any) {
    const where: any = {};
    if (filter.status) where.status = filter.status;
    if (filter.type) where.type = filter.type;
    if (filter.ticketId) where.ticketId = Number(filter.ticketId);
    if (filter.tripId) where.tripId = Number(filter.tripId);
    return this.repo(Incident).find({ where, order: { id: 'DESC' }, take: 100 });
  }
  async updateIncident(id: number, dto: any, user: any) {
    const inc = await this.repo(Incident).findOne({ where: { id } });
    if (!inc) throw new NotFoundException('事件不存在');
    if (dto.status === INCIDENT_STATUS.PROCESSING) inc.status = INCIDENT_STATUS.PROCESSING;
    if (dto.status === INCIDENT_STATUS.RESOLVED) { inc.status = INCIDENT_STATUS.RESOLVED; inc.resolvedAt = new Date(); }
    if (dto.ownerRole) inc.ownerRole = dto.ownerRole;
    if (dto.assignee) inc.assignee = dto.assignee;
    if (dto.resolution) inc.resolution = `${inc.resolution ? inc.resolution + ' | ' : ''}[${user.name}] ${dto.resolution}`;
    return this.repo(Incident).save(inc);
  }

  /* 老人优先争议：站点登记，关联车票与班次 */
  async priorityDispute(stationId: number, ticketId: number, detail: string, operator: string) {
    return this.raiseIncident(null, {
      type: INCIDENT_TYPE.PRIORITY_DISPUTE, severity: 'warn',
      title: '老人/无障碍优先引发争议', detail,
      raisedBy: operator, ownerRole: ROLE.CS, stationId, ticketId,
    });
  }

  /* ================= 退票（游客-客服-主管-财务 协同） ================= */
  async requestRefund(ticketCode: string, reason: string, raisedBy: string, visitorName?: string) {
    const ticket = await this.ticketByCode(ticketCode);
    if (ticket.status === TICKET_STATUS.REFUNDED) throw new BadRequestException('车票已退票');
    const exist = await this.repo(Refund).findOne({ where: { ticketId: ticket.id, status: Not(In([REFUND_STATUS.REFUNDED, REFUND_STATUS.REJECTED])) } });
    if (exist) throw new BadRequestException('已存在处理中的退票申请');
    const refund = await this.repo(Refund).save(
      this.repo(Refund).create({
        ticketId: ticket.id, amount: ticket.price, reason,
        visitorName: visitorName || ticket.visitorName, raisedBy,
        status: REFUND_STATUS.REQUESTED,
      }),
    );
    ticket.status = TICKET_STATUS.REFUND_PENDING;
    await this.repo(Ticket).save(ticket);
    const inc = await this.raiseIncident(null, {
      type: INCIDENT_TYPE.REFUND_REQUEST, severity: 'warn',
      title: `退票申请（票 ${ticket.code}）`, detail: reason,
      raisedBy, ownerRole: ROLE.CS, ticketId: ticket.id, refundId: refund.id,
    });
    refund.incidentId = inc.id;
    await this.repo(Refund).save(refund);
    return refund;
  }

  async listRefunds(status?: string) {
    const where = status ? { status } : {};
    const refunds = await this.repo(Refund).find({ where, order: { id: 'DESC' }, take: 100 });
    const tickets = await this.repo(Ticket).find({ where: { id: In(refunds.map((r) => r.ticketId)) } });
    const tmap = new Map(tickets.map((t) => [t.id, t]));
    return refunds.map((r) => ({ ...r, ticket: tmap.get(r.ticketId) }));
  }

  // 客服受理 / 通过 / 驳回
  async csDecide(refundId: number, action: 'take' | 'approve' | 'reject', user: any, note?: string) {
    const r = await this.repo(Refund).findOne({ where: { id: refundId } });
    if (!r) throw new NotFoundException('退票单不存在');
    if (action === 'take') { r.status = REFUND_STATUS.CS_REVIEWING; r.handledBy = user.name; }
    if (action === 'approve') { r.status = REFUND_STATUS.APPROVED; r.handledBy = r.handledBy || user.name; r.resolvedAt = new Date(); }
    if (action === 'reject') {
      // 驳回后若游客有异议可升级主管；这里直接驳回，车票恢复
      r.status = REFUND_STATUS.REJECTED; r.handledBy = r.handledBy || user.name;
      r.disputeNote = (r.disputeNote ? r.disputeNote + ' | ' : '') + `[客服驳回] ${note || ''}`;
      await this.restoreTicket(r.ticketId);
    }
    return this.repo(Refund).save(r);
  }

  // 争议升级客服主管
  async escalate(refundId: number, user: any, note: string) {
    const r = await this.repo(Refund).findOne({ where: { id: refundId } });
    if (!r) throw new NotFoundException('退票单不存在');
    r.disputed = true;
    r.status = REFUND_STATUS.ESCALATED;
    r.disputeNote = `${r.disputeNote ? r.disputeNote + ' | ' : ''}[${user.name} 升级] ${note}`;
    await this.repo(Refund).save(r);
    if (r.incidentId) {
      await this.updateIncident(r.incidentId, { ownerRole: ROLE.CS_LEAD, resolution: `退票争议升级客服主管：${note}` }, user);
    }
    return r;
  }

  // 客服主管裁决
  async supervisorDecide(refundId: number, approve: boolean, user: any, note: string) {
    const r = await this.repo(Refund).findOne({ where: { id: refundId } });
    if (!r) throw new NotFoundException('退票单不存在');
    r.supervisorBy = user.name;
    r.disputeNote = `${r.disputeNote ? r.disputeNote + ' | ' : ''}[主管裁决 ${approve ? '同意' : '维持驳回'}] ${note}`;
    if (approve) { r.status = REFUND_STATUS.APPROVED; r.resolvedAt = new Date(); }
    else { r.status = REFUND_STATUS.REJECTED; await this.restoreTicket(r.ticketId); }
    if (r.incidentId) await this.updateIncident(r.incidentId, { status: INCIDENT_STATUS.RESOLVED, resolution: note }, user);
    return this.repo(Refund).save(r);
  }

  // 财务退款出账
  async financePay(refundId: number, user: any) {
    return this.ds.transaction(async (m) => {
      const r = await m.findOne(Refund, { where: { id: refundId }, lock: { mode: 'pessimistic_write' } });
      if (!r) throw new NotFoundException('退票单不存在');
      if (r.status !== REFUND_STATUS.APPROVED) throw new BadRequestException('仅审批通过的退票可出账');
      r.status = REFUND_STATUS.REFUNDED;
      r.financeBy = user.name;
      r.resolvedAt = new Date();
      await m.save(r);
      const t = await m.findOne(Ticket, { where: { id: r.ticketId } });
      if (t) { t.status = TICKET_STATUS.REFUNDED; await m.save(t); }
      if (r.incidentId) {
        const inc = await m.findOne(Incident, { where: { id: r.incidentId } });
        if (inc && inc.status !== INCIDENT_STATUS.RESOLVED) { inc.status = INCIDENT_STATUS.RESOLVED; inc.resolvedAt = new Date(); inc.resolution = `已退款 ¥${r.amount}`; await m.save(inc); }
      }
      return r;
    });
  }

  private async restoreTicket(ticketId: number) {
    const queued = await this.repo(QueueEntry).findOne({ where: { ticketId, status: 'waiting' } });
    const t = await this.repo(Ticket).findOne({ where: { id: ticketId } });
    if (t) { t.status = queued ? TICKET_STATUS.QUEUED : TICKET_STATUS.ISSUED; await this.repo(Ticket).save(t); }
  }

  /* ================= 包车 ================= */
  async requestCharter(dto: any) {
    return this.repo(Charter).save(
      this.repo(Charter).create({
        groupName: dto.groupName, contactPhone: dto.contactPhone, partySize: Number(dto.partySize),
        needAccessible: !!dto.needAccessible, remark: dto.remark || '',
        price: (Number(dto.partySize) * 30 + (dto.needAccessible ? 200 : 0)).toFixed(2),
        status: 'pending',
      }),
    );
  }
  async listCharters() {
    return this.repo(Charter).find({ order: { id: 'DESC' } });
  }
  async assignCharter(id: number, vehicleId: number, driverId: number, operator: string) {
    const ch = await this.repo(Charter).findOne({ where: { id } });
    if (!ch) throw new NotFoundException('包车单不存在');
    const v = await this.repo(Vehicle).findOne({ where: { id: vehicleId } });
    const d = await this.repo(Driver).findOne({ where: { id: driverId } });
    if (!v || !d) throw new BadRequestException('车辆或司机不存在');
    if (ch.needAccessible && !v.accessible) throw new BadRequestException('团队需要无障碍车辆');
    if (v.seats < ch.partySize) throw new BadRequestException('车辆座位不足以容纳团队');
    ch.vehicleId = vehicleId; ch.driverId = driverId; ch.status = 'assigned';
    return this.repo(Charter).save(ch);
  }

  /* ================= 运营复盘 ================= */
  async report() {
    const stations = await this.repo(Station).find();
    const stationRows = [] as any[];
    for (const s of stations) {
      const waiting = await this.repo(QueueEntry).count({ where: { stationId: s.id, status: 'waiting' } });
      const checkedToday = await this.repo(BoardLog).count({ where: { stationId: s.id, action: 'checkin', at: MoreThan(startOfToday()) } });
      const avg = await this.repo(QueueEntry)
        .createQueryBuilder('q').select('AVG(q.waitSec)', 'a').where('q.stationId=:s', { s: s.id }).andWhere("q.status='boarded'").getRawOne();
      const longest = await this.repo(QueueEntry)
        .createQueryBuilder('q').select('MAX(q.waitSec)', 'm').where('q.stationId=:s', { s: s.id }).andWhere("q.status='boarded'").getRawOne();
      stationRows.push({ id: s.id, name: s.name, hot: s.hot, status: s.status, waiting, checkedToday, avgWaitSec: Math.round(Number(avg?.a || 0)), maxWaitSec: Number(longest?.m || 0) });
    }

    const trips = await this.repo(Trip).find();
    const completed = trips.filter((t) => t.status === TRIP_STATUS.COMPLETED);
    const avgUtil = completed.length ? Math.round(completed.reduce((a, t) => a + t.loadSnapshot, 0) / completed.length) : 0;
    const suspended = trips.filter((t) => t.status === TRIP_STATUS.SUSPENDED).length;
    const skipped = trips.reduce((a, t) => a + (t.skippedStations || []).length, 0);

    const vehicles = await this.repo(Vehicle).find();
    const vehicleRows = [] as any[];
    for (const v of vehicles) {
      const vt = trips.filter((t) => t.vehicleId === v.id);
      const vc = vt.filter((t) => t.status === TRIP_STATUS.COMPLETED);
      const util = vc.length ? Math.round(vc.reduce((a, t) => a + t.loadSnapshot, 0) / vc.length) : 0;
      vehicleRows.push({ id: v.id, plate: v.plate, name: v.name, accessible: v.accessible, batteryPct: v.batteryPct, status: v.status, trips: vt.length, utilizationPct: util });
    }

    const incidents = await this.repo(Incident).find();
    const byType: Record<string, number> = {};
    for (const i of incidents) byType[i.type] = (byType[i.type] || 0) + 1;
    const openCount = incidents.filter((i) => i.status !== INCIDENT_STATUS.RESOLVED).length;

    const refunds = await this.repo(Refund).find();
    const refunded = refunds.filter((r) => r.status === REFUND_STATUS.REFUNDED);
    const refundCost = refunded.reduce((a, r) => a + Number(r.amount), 0);
    const reasonCount: Record<string, number> = {};
    for (const r of refunds) reasonCount[r.reason] = (reasonCount[r.reason] || 0) + 1;

    const drivers = await this.repo(Driver).find();
    return {
      stations: stationRows,
      trips: { total: trips.length, completed: completed.length, suspended, skippedStations: skipped, avgUtilizationPct: avgUtil },
      vehicles: vehicleRows,
      complaints: { total: incidents.length, open: openCount, byType },
      refunds: { total: refunds.length, refunded: refunded.length, disputed: refunds.filter((r) => r.disputed).length, cost: Math.round(refundCost * 100) / 100, reasonCount },
      drivers: drivers.map((d) => ({ id: d.id, name: d.name, status: d.status, workedMinutes: d.workedMinutes, restMinutes: d.restMinutes })),
    };
  }

  /* ================= 内部工具 ================= */
  private async logBoard(ticketId: number, stationId: number, tripId: number | null, action: string, operator: string, detail: string) {
    await this.repo(BoardLog).save(this.repo(BoardLog).create({ ticketId, stationId, tripId, action, operator, detail }));
  }
  private async logBoardWith(m: any, ticketId: number, stationId: number, tripId: number | null, action: string, operator: string, detail: string) {
    const repo = m.getRepository(BoardLog);
    await repo.save(repo.create({ ticketId, stationId, tripId, action, operator, detail }));
  }
  private async snapshot(stationId: number) {
    await this.snapshotWith(null, stationId);
  }
  private async snapshotWith(m: any, stationId: number) {
    const repo = m ? m.getRepository(StationSnapshot) : this.repo(StationSnapshot);
    const qRepo = m ? m.getRepository(QueueEntry) : this.repo(QueueEntry);
    const waiting = await qRepo.count({ where: { stationId, status: 'waiting' } });
    const checkedToday = await (m || this.ds).getRepository(BoardLog).count({ where: { stationId, action: 'checkin', at: MoreThan(startOfToday()) } });
    const avg = await qRepo.createQueryBuilder('q').select('AVG(q.waitSec)', 'a').where('q.stationId=:s', { s: stationId }).andWhere("q.status='boarded'").getRawOne();
    await repo.save(repo.create({ stationId, waiting, checkedToday, avgWaitSec: Math.round(Number(avg?.a || 0)) }));
  }
}

function crowwLimitValid(v: any) {
  return v !== undefined && v !== null && !Number.isNaN(Number(v));
}
