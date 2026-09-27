import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';

/* ---------------- 枚举常量 ---------------- */
export const ROLE = {
  VISITOR: 'visitor', // 游客
  STAFF: 'staff', // 站点工作人员
  DRIVER: 'driver', // 司机
  DISPATCH: 'dispatch', // 调度中心
  CS: 'cs', // 客服
  CS_LEAD: 'cs_lead', // 客服主管
  FINANCE: 'finance', // 财务
  ADMIN: 'admin',
} as const;

export const TICKET_TYPE = {
  SINGLE: 'single', // 单程票
  LOOP: 'loop', // 环线票
  FAMILY: 'family', // 亲子票
  ACCESSIBLE: 'accessible', // 无障碍优先票
} as const;

export const TICKET_STATUS = {
  ISSUED: 'issued', // 已出票
  QUEUED: 'queued', // 排队中
  BOARDED: 'boarded', // 已上车
  COMPLETED: 'completed', // 已完成
  REFUND_PENDING: 'refund_pending', // 退票处理中
  REFUNDED: 'refunded', // 已退票
  REJECTED: 'rejected', // 退票驳回
} as const;

export const TRIP_STATUS = {
  SCHEDULED: 'scheduled', // 已排班前待客
  BOARDING: 'boarding', // 上客中
  RUNNING: 'running', // 行驶中
  COMPLETED: 'completed', // 已完成
  SUSPENDED: 'suspended', // 临时停运
  CANCELLED: 'cancelled', // 已取消
  DELAYED: 'delayed', // 延误（交班等）
} as const;

export const VEHICLE_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  CHARGING: 'charging',
  MAINTENANCE: 'maintenance', // 故障维修
} as const;

export const DRIVER_STATUS = {
  OFF: 'off_duty',
  ON: 'on_duty',
  DRIVING: 'driving',
  RESTING: 'resting',
} as const;

export const INCIDENT_TYPE = {
  LONG_QUEUE: 'long_queue', // 热门站点排队过长
  FULL_SKIP: 'full_skip', // 满载跳站
  WRONG_DIRECTION: 'wrong_direction', // 误上反方向
  PRIORITY_DISPUTE: 'priority_dispute', // 老人/优先争议
  VEHICLE_FAULT: 'vehicle_fault', // 车辆故障
  HANDOVER_DELAY: 'handover_delay', // 司机交班延误
  STORM_SUSPENSION: 'storm_suspension', // 暴雨临时停运
  REFUND_REQUEST: 'refund_request', // 退票诉求
  ROAD_CONTROL: 'road_control', // 道路管制
  CONGESTION: 'congestion', // 站点拥堵
  GEOFENCE: 'geofence', // 电子围栏越界
  OTHER: 'other',
} as const;

export const INCIDENT_STATUS = {
  OPEN: 'open',
  PROCESSING: 'processing',
  RESOLVED: 'resolved',
} as const;

export const REFUND_STATUS = {
  REQUESTED: 'requested', // 游客申请
  CS_REVIEWING: 'cs_reviewing', // 客服处理中
  ESCALATED: 'escalated', // 争议升级客服主管
  APPROVED: 'approved', // 审批通过待退款
  REFUNDED: 'refunded', // 财务已退款
  REJECTED: 'rejected', // 驳回
} as const;

export const STATION_STATUS = {
  NORMAL: 'normal',
  RESTRICTED: 'restricted', // 限流
  CLOSED: 'closed', // 封闭
} as const;

/* ---------------- 用户 ---------------- */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn() id: number;
  @Column({ unique: true }) username: string;
  @Column() passwordHash: string;
  @Column() name: string;
  @Column({ default: ROLE.VISITOR }) role: string;
  @Column({ default: '' }) phone: string;
}

/* ---------------- 站点 / 线路 ---------------- */
@Entity('stations')
export class Station {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
  @Column({ unique: true }) code: string;
  @Column({ type: 'double', default: 0 }) lat: number;
  @Column({ type: 'double', default: 0 }) lng: number;
  @Column({ default: 200 }) crowdLimit: number; // 景点限流阈值（站内滞留人数）
  @Column({ default: 60 }) queueWarnSec: number; // 排队等待预警秒数
  @Column({ default: 150 }) geofenceRadius: number; // 电子围栏半径（米）
  @Column({ default: STATION_STATUS.NORMAL }) status: string;
  @Column({ default: true }) hot: boolean; // 热门站点
}

@Entity('routes')
export class Route {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
  @Column({ unique: true }) code: string;
  @Column({ default: 'loop' }) kind: string; // loop 环线 / oneway 单程
  @Column({ default: 30 }) roundMinutes: number;
}

@Entity('route_stops')
export class RouteStop {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column() routeId: number;
  @Index() @Column() stationId: number;
  @Column() seq: number;
  @ManyToOne(() => Station) @JoinColumn({ name: 'stationId' }) station: Station;
}

/* ---------------- 车辆 / 司机 ---------------- */
@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn() id: number;
  @Column({ unique: true }) plate: string;
  @Column() name: string;
  @Column({ default: 24 }) seats: number; // 普通座位
  @Column({ default: 2 }) wheelchairSlots: number; // 轮椅位
  @Column({ default: true }) accessible: boolean; // 无障碍车辆
  @Column({ type: 'int', default: 100 }) batteryPct: number;
  @Column({ type: 'int', default: 0 }) mileageKm: number;
  @Column({ default: VEHICLE_STATUS.IDLE }) status: string;
  @Column({ type: 'double', default: 0 }) lat: number;
  @Column({ type: 'double', default: 0 }) lng: number;
  @Column({ default: false }) charging: boolean;
}

@Entity('drivers')
export class Driver {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
  @Column({ unique: true }) licenseNo: string;
  @Column({ default: '' }) phone: string;
  @Column({ default: DRIVER_STATUS.OFF }) status: string;
  @Column({ type: 'datetime', nullable: true }) shiftStart: Date | null;
  @Column({ type: 'int', default: 0 }) workedMinutes: number; // 本班已工时
  @Column({ type: 'int', default: 480 }) maxWorkMinutes: number; // 工时上限（休息约束）
  @Column({ type: 'int', default: 0 }) restMinutes: number; // 已休息分钟
  @Column({ type: 'int', nullable: true }) currentVehicleId: number | null;
}

/* ---------------- 车票 / 包车 ---------------- */
@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn() id: number;
  @Index({ unique: true }) @Column() code: string;
  @Column({ default: '' }) visitorName: string;
  @Column({ default: '' }) phone: string;
  @Column({ default: TICKET_TYPE.SINGLE }) type: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) price: string;
  @Column({ type: 'datetime', nullable: true }) parkInTime: Date | null; // 入园时间
  @Column() originStationId: number;
  @Column() destStationId: number;
  @Column({ type: 'int', default: 1 }) partySize: number; // 同行人数
  @Column({ default: false }) stroller: boolean; // 婴儿车
  @Column({ default: false }) hasElder: boolean; // 老人
  @Column({ default: false }) hasChild: boolean; // 儿童
  @Column({ default: '' }) plannedRoute: string; // 预计游览路线
  @Column({ default: TICKET_STATUS.ISSUED }) status: string;
  @Column({ default: false }) priority: boolean; // 优先上车
  @Column({ type: 'int', nullable: true }) tripId: number | null;
  @Column({ type: 'int', nullable: true }) charterId: number | null;
  @Column({ default: 0 }) usedLegs: number; // 环线已乘坐段数
  @CreateDateColumn() createdAt: Date;
  @Column({ type: 'datetime', nullable: true }) checkedAt: Date | null;
  @Column({ type: 'datetime', nullable: true }) boardedAt: Date | null;
  @Column({ type: 'datetime', nullable: true }) completedAt: Date | null;
}

@Entity('charters')
export class Charter {
  @PrimaryGeneratedColumn() id: number;
  @Column() groupName: string; // 团队名称
  @Column() contactPhone: string;
  @Column({ type: 'int' }) partySize: number;
  @Column({ default: false }) needAccessible: boolean; // 无障碍车辆
  @Column({ default: '' }) remark: string;
  @Column({ default: 'pending' }) status: string; // pending/assigned/finished/cancelled
  @Column({ type: 'int', nullable: true }) vehicleId: number | null;
  @Column({ type: 'int', nullable: true }) driverId: number | null;
  @Column({ type: 'int', nullable: true }) tripId: number | null;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) price: string;
  @CreateDateColumn() createdAt: Date;
}

/* ---------------- 班次 ---------------- */
@Entity('trips')
export class Trip {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column() routeId: number;
  @Column({ default: 1 }) direction: number; // 1 正向 / 2 反向
  @Column() vehicleId: number;
  @Column() driverId: number;
  @Column({ default: TRIP_STATUS.SCHEDULED }) status: string;
  @Column({ type: 'datetime' }) scheduledDepart: Date;
  @Column({ type: 'datetime', nullable: true }) actualDepart: Date | null;
  @Column({ type: 'datetime', nullable: true }) completedAt: Date | null;
  @Column() originStationId: number;
  @Column({ type: 'int', nullable: true }) currentStationId: number | null;
  @Column({ type: 'int', default: 0 }) seatsSold: number;
  @Column({ type: 'int', default: 0 }) wheelchairUsed: number;
  @Column({ type: 'simple-json', nullable: true }) skippedStations: number[]; // 跳站
  @Column({ type: 'int', default: 0 }) loadSnapshot: number; // 完成时满载率快照
  @Column({ default: '' }) note: string;
  @Column({ default: '' }) createdBy: string;
  @CreateDateColumn() createdAt: Date;
}

/* ---------------- 排队 / 检票记录 ---------------- */
@Entity('queue_entries')
export class QueueEntry {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column() stationId: number;
  @Index() @Column() ticketId: number;
  @Column({ default: false }) priority: boolean;
  @Column({ default: 'waiting' }) status: string; // waiting/boarded/left
  @Column({ type: 'int', nullable: true }) tripId: number | null;
  @Column({ type: 'datetime' }) enqueuedAt: Date;
  @Column({ type: 'datetime', nullable: true }) boardedAt: Date | null;
  @Column({ type: 'int', default: 0 }) waitSec: number;
}

@Entity('board_logs')
export class BoardLog {
  @PrimaryGeneratedColumn() id: number;
  @Column() ticketId: number;
  @Column() stationId: number;
  @Column({ type: 'int', nullable: true }) tripId: number | null;
  @Column() action: string; // checkin/board/wrong_direction/rejected/complete
  @Column({ default: '' }) operator: string;
  @Column({ default: '' }) detail: string;
  @CreateDateColumn() at: Date;
}

/* ---------------- 协同事件（一张票/一班车贯通） ---------------- */
@Entity('incidents')
export class Incident {
  @PrimaryGeneratedColumn() id: number;
  @Index({ unique: true }) @Column() code: string;
  @Index() @Column() type: string;
  @Column({ default: 'warn' }) severity: string; // info/warn/critical
  @Column() title: string;
  @Column({ default: '' }) detail: string;
  @Column({ default: INCIDENT_STATUS.OPEN }) status: string;
  @Column({ default: '' }) raisedBy: string; // 发起人
  @Column({ default: 'dispatch' }) ownerRole: string; // 当前处理角色
  @Column({ default: '' }) assignee: string;
  @Column({ type: 'int', nullable: true }) ticketId: number | null;
  @Column({ type: 'int', nullable: true }) tripId: number | null;
  @Column({ type: 'int', nullable: true }) stationId: number | null;
  @Column({ type: 'int', nullable: true }) vehicleId: number | null;
  @Column({ type: 'int', nullable: true }) driverId: number | null;
  @Column({ type: 'int', nullable: true }) refundId: number | null;
  @Column({ default: '' }) resolution: string;
  @CreateDateColumn() createdAt: Date;
  @Column({ type: 'datetime', nullable: true }) resolvedAt: Date | null;
}

/* ---------------- 退票 ---------------- */
@Entity('refunds')
export class Refund {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column() ticketId: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) amount: string;
  @Column() reason: string;
  @Column({ default: REFUND_STATUS.REQUESTED }) status: string;
  @Column({ default: false }) disputed: boolean; // 是否争议
  @Column({ default: '' }) visitorName: string;
  @Column({ default: '' }) raisedBy: string;
  @Column({ default: '' }) handledBy: string; // 客服
  @Column({ default: '' }) supervisorBy: string; // 客服主管
  @Column({ default: '' }) financeBy: string; // 财务
  @Column({ default: '' }) disputeNote: string;
  @Column({ type: 'int', nullable: true }) incidentId: number | null;
  @CreateDateColumn() createdAt: Date;
  @Column({ type: 'datetime', nullable: true }) resolvedAt: Date | null;
}

/* ---------------- 广播 / 天气 / 安检 / 围栏 ---------------- */
@Entity('broadcasts')
export class Broadcast {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int', nullable: true }) stationId: number | null; // null=全线
  @Column({ default: 'station' }) channel: string; // station/app/all
  @Column() content: string;
  @Column() createdBy: string;
  @CreateDateColumn() createdAt: Date;
}

@Entity('weather')
export class Weather {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int', nullable: true }) stationId: number | null;
  @Column({ default: 'sunny' }) condition: string; // sunny/cloudy/rain/storm
  @Column({ type: 'int', default: 25 }) tempC: number;
  @Column({ type: 'int', default: 0 }) windLevel: number;
  @Column({ default: '' }) alert: string;
  @CreateDateColumn() at: Date;
}

@Entity('safety_checks')
export class SafetyCheck {
  @PrimaryGeneratedColumn() id: number;
  @Column() vehicleId: number;
  @Column() driverId: number;
  @Column({ default: true }) passed: boolean;
  @Column({ default: '' }) note: string;
  @Column({ type: 'simple-json', nullable: true }) items: Record<string, boolean>; // 刹车/轮胎/灯光/车门/轮椅锁
  @CreateDateColumn() at: Date;
}

@Entity('geofence_violations')
export class GeofenceViolation {
  @PrimaryGeneratedColumn() id: number;
  @Column() vehicleId: number;
  @Column({ type: 'int', nullable: true }) tripId: number | null;
  @Column({ type: 'double' }) lat: number;
  @Column({ type: 'double' }) lng: number;
  @Column({ default: '' }) detail: string;
  @CreateDateColumn() at: Date;
}

/* ---------------- 站点快照（复盘用） ---------------- */
@Entity('station_snapshots')
export class StationSnapshot {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column() stationId: number;
  @Column({ type: 'int', default: 0 }) waiting: number;
  @Column({ type: 'int', default: 0 }) checkedToday: number;
  @Column({ type: 'int', default: 0 }) avgWaitSec: number;
  @CreateDateColumn() at: Date;
}

export const ALL_ENTITIES = [
  User, Station, Route, RouteStop, Vehicle, Driver, Ticket, Charter, Trip,
  QueueEntry, BoardLog, Incident, Refund, Broadcast, Weather, SafetyCheck,
  GeofenceViolation, StationSnapshot,
];
