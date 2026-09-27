import 'reflect-metadata';

const BASE = process.env.API_BASE || 'http://127.0.0.1:3001/api';

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, extra?: any) {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : '');
  }
}

async function api(method: string, path: string, token?: string, body?: any, expectStatus = 200 | 201) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}
async function call(name: string, method: string, path: string, token: string, body?: any) {
  const r = await api(method, path, token, body);
  ok(`${name} (${r.status})`, r.status === 200 || r.status === 201, r.json);
  return r.json;
}
async function expectFail(name: string, method: string, path: string, token: string, body: any, status = 400) {
  const r = await api(method, path, token, body);
  ok(`${name} 被拦截 (${r.status})`, r.status === status, r.json);
  return r.json;
}

async function login(username: string) {
  const r = await api('POST', '/auth/login', undefined, { username, password: '123456' });
  if (r.status !== 201 && r.status !== 200) throw new Error(`登录失败 ${username}: ${JSON.stringify(r.json)}`);
  return r.json.token as string;
}

async function main() {
  console.log('— 登录各角色 —');
  const visitor = await login('visitor');
  const staff = await login('staff01');
  const driver = await login('driver01');
  const dispatch = await login('dispatch');
  const cs = await login('cs');
  const lead = await login('cslead');
  const finance = await login('finance');
  ok('六类角色均登录成功', !!(visitor && staff && dispatch && cs && lead && finance));
  const driverTrips = await api('GET', '/dispatch/trips', driver);
  ok('司机可只读查询班次（工作台需要）', driverTrips.status === 200, driverTrips.status);
  const driverCreate = await api('POST', '/dispatch/trips', driver, { routeId: 1 });
  ok('司机无权派班（403）', driverCreate.status === 403, driverCreate.status);

  console.log('— 基础数据 —');
  const ref = await call('读取站点/线路/车辆/司机', 'GET', '/ref', dispatch);
  const east = ref.stations[0].id;
  const lake = ref.stations[1].id;
  const family = ref.stations[6].id;
  const cable = ref.stations[3].id;
  const loopRoute = ref.routes.find((r: any) => r.code === 'LOOP').id;
  const upRoute = ref.routes.find((r: any) => r.code === 'UP').id;

  console.log('— 购票（单程/环线/无障碍/亲子）—');
  const acc = await call('购无障碍优先票（含老人）', 'POST', '/visitor/tickets', visitor, {
    type: 'accessible', originStationId: east, destStationId: ref.stations[4].id, partySize: 1,
    hasElder: true, visitorName: '老人钱某', phone: '13711110001', plannedRoute: '东门-山顶',
  });
  const single = await call('购单程票', 'POST', '/visitor/tickets', visitor, {
    type: 'single', originStationId: east, destStationId: lake, partySize: 1,
    visitorName: '周某', phone: '13711110002',
  });
  const loopT = await call('购环线票', 'POST', '/visitor/tickets', visitor, {
    type: 'loop', originStationId: east, destStationId: east, visitorName: '吴某', phone: '13711110003',
  });
  const fam = await call('购亲子票（婴儿车+儿童）', 'POST', '/visitor/tickets', visitor, {
    type: 'family', originStationId: family, destStationId: ref.stations[2].id, partySize: 3,
    stroller: true, hasChild: true, visitorName: '孙家', phone: '13711110004',
  });
  const wrong = await call('购将误乘反方向的票', 'POST', '/visitor/tickets', visitor, {
    type: 'single', originStationId: east, destStationId: family, visitorName: '郑某', phone: '13711110005',
  });
  ok('无障碍票自动标记优先', acc.priority === true);
  ok('记录入园时间/同行人数/婴儿车/老人儿童/路线',
    !!acc.parkInTime && fam.partySize === 3 && fam.stroller === true && fam.hasChild === true && !!acc.plannedRoute);

  console.log('— 检票进入排队 —');
  await call('东门检无障碍票', 'POST', `/stations/${east}/checkin`, staff, { ticketCode: acc.code });
  await call('东门检单程票', 'POST', `/stations/${east}/checkin`, staff, { ticketCode: single.code });
  await call('东门检误乘票', 'POST', `/stations/${east}/checkin`, staff, { ticketCode: wrong.code });
  const board0 = await call('站点平板看板', 'GET', `/stations/${east}/board`, staff);
  ok('看板含排队/已检票/天气', board0.stats.waiting >= 3 && board0.weather && Array.isArray(board0.trips));

  console.log('— 派班：电量与工时约束 —');
  await expectFail('参数缺失不可派班', 'POST', '/dispatch/trips', dispatch, {}, 400);
  await expectFail('低电量车辆(15%)不可派班', 'POST', '/dispatch/trips', dispatch, {
    routeId: loopRoute, direction: 1, vehicleId: 5, driverId: 1, originStationId: east,
  });
  // 故障一辆车再尝试派班
  await call('登记4号车故障', 'POST', '/dispatch/vehicles/4/fault', dispatch, { detail: '刹车异响' });
  await expectFail('故障车辆不可派班', 'POST', '/dispatch/trips', dispatch, {
    routeId: loopRoute, direction: 1, vehicleId: 4, driverId: 1, originStationId: east,
  });
  await expectFail('休息中司机不可派班', 'POST', '/dispatch/trips', dispatch, {
    routeId: loopRoute, direction: 1, vehicleId: 1, driverId: 3, originStationId: east,
  });
  const trip = await call('派环湖班次(1号车/王师傅)', 'POST', '/dispatch/trips', dispatch, {
    routeId: loopRoute, direction: 1, vehicleId: 1, driverId: 1, originStationId: east,
  });
  const upTrip = await call('派直达班次(3号车/李师傅)', 'POST', '/dispatch/trips', dispatch, {
    routeId: upRoute, direction: 1, vehicleId: 3, driverId: 2, originStationId: east,
  });

  console.log('— 司机发车前安全检查 —');
  await expectFail('未安检不得发车', 'POST', `/dispatch/trips/${trip.id}/depart`, dispatch, undefined, 400);
  await call('提交安全检查（全部合格）', 'POST', '/driver/safety-check', dispatch, {
    driverId: 1, vehicleId: 1, note: '正常',
    items: { brake: true, tire: true, light: true, door: true, wheelchairLock: true },
  });
  await call('环湖班次发车', 'POST', `/dispatch/trips/${trip.id}/depart`, dispatch);

  console.log('— 排队上车：优先与先到先得 —');
  const b1 = await call('自动放行队首（应为无障碍优先）', 'POST', `/stations/${east}/board`, staff, { tripId: trip.id });
  ok('优先乘客先上车', b1.ticket.code === acc.code, b1.ticket.code);
  const b2 = await call('放行第二位（单程）', 'POST', `/stations/${east}/board`, staff, { tripId: trip.id });
  ok('普通乘客随后上车', b2.ticket.code === single.code);
  const boardAfter = await call('看板更新座位/轮椅余量', 'GET', `/stations/${east}/board`, staff);
  const tripLine = boardAfter.trips.find((t: any) => t.id === trip.id);
  ok('座位余量与轮椅位可见', tripLine && tripLine.seatsRemain === 22 && tripLine.wheelchairRemain === 1, tripLine);

  console.log('— 误上反方向拦截 + 协同事件 —');
  await expectFail('反方向/不在本线目的地被拦截', 'POST', `/stations/${east}/board`, staff, { tripId: upTrip.id, ticketCode: wrong.code });
  const incDir = await call('误乘事件已生成', 'GET', '/incidents?type=wrong_direction', dispatch);
  ok('误乘事件关联车票与班次', incDir.length >= 1 && incDir[0].ticketId === wrong.id && incDir[0].tripId === upTrip.id);

  console.log('— 满载跳站 + 站点广播 —');
  await call('直达班次于索道下站满载跳站', 'POST', `/stations/${cable}/skip`, staff, { tripId: upTrip.id });
  const skipInc = await call('跳站事件生成', 'GET', '/incidents?type=full_skip', dispatch);
  ok('跳站事件记录站点', skipInc.some((i: any) => i.stationId === cable));

  console.log('— 车辆位置/电量上报 + 电子围栏 —');
  const pos = await call('上报越界位置与低电量', 'POST', `/dispatch/trips/${trip.id}/position`, dispatch, {
    lat: 30.5, lng: 120.5, batteryPct: 10,
  });
  ok('识别最近站点并判定越界距离', typeof pos.nearestDist === 'number' && pos.nearestDist > 1200, pos);
  const fence = await call('电子围栏事件生成', 'GET', '/incidents?type=geofence', dispatch);
  ok('越界事件为严重级别', fence.length >= 1 && fence[0].severity === 'critical');

  console.log('— 老人优先争议 —');
  await call('站点登记老人优先争议', 'POST', `/stations/${east}/priority-dispute`, staff, {
    ticketId: acc.id, detail: '其他游客质疑无障碍优先顺序',
  });
  const dispute = await call('优先争议转客服处理', 'GET', '/incidents?type=priority_dispute', dispatch);
  ok('争议事件归属客服', dispute.length >= 1 && dispute[0].ownerRole === 'cs');

  console.log('— 暴雨临时停运 —');
  await call('直达班次临时停运并全线广播', 'POST', '/dispatch/suspension', dispatch, {
    tripIds: [upTrip.id], suspended: true, reason: '突降暴雨，山路湿滑',
  });
  const tripsAfter = await call('班次状态为停运', 'GET', `/dispatch/trips?status=suspended`, dispatch);
  ok('停运班次可查', tripsAfter.some((t: any) => t.id === upTrip.id));

  console.log('— 完成环湖班次（工时/利用率结算）—');
  const done = await call('完成班次', 'POST', `/dispatch/trips/${trip.id}/complete`, dispatch);
  ok('完成时记录满载率快照', done.loadSnapshot > 0, done.loadSnapshot);

  console.log('— 退票协同：游客→客服→主管→财务 —');
  const rfT = await call('再购一张用于退票的票', 'POST', '/visitor/tickets', visitor, {
    type: 'single', originStationId: east, destStationId: lake, visitorName: '退票冯某', phone: '13722220001',
  });
  const refund = await call('游客申请退票', 'POST', `/visitor/tickets/${rfT.code}/refund`, visitor, { reason: '暴雨停运无法乘坐' });
  let list = await call('客服看待处理退票', 'GET', '/refunds?status=requested', cs);
  ok('退票单进入客服队列', list.some((r: any) => r.id === refund.id));
  await call('客服受理', 'POST', `/refunds/${refund.id}/cs-decide`, cs, { action: 'take' });
  await call('客服与游客存在争议，升级客服主管', 'POST', `/refunds/${refund.id}/escalate`, cs, { note: '游客坚持全退，票已检争议' });
  let r = await call('主管可查争议单', 'GET', '/refunds?status=escalated', lead);
  ok('争议单状态=escalated', r.some((x: any) => x.id === refund.id));
  await call('客服主管裁决同意退款', 'POST', `/refunds/${refund.id}/supervisor`, lead, { approve: true, note: '停运属不可抗力，全额退' });
  await expectFail('非财务不能出账', 'POST', `/refunds/${refund.id}/pay`, cs, undefined, 403);
  await call('财务退款出账', 'POST', `/refunds/${refund.id}/pay`, finance);
  const rfTicket = await call('车票状态变为已退票', 'GET', `/visitor/tickets/${rfT.code}`, staff);
  ok('车票已退票', rfTicket.status === 'refunded', rfTicket.status);

  console.log('— 退票驳回路径 —');
  const rfT2 = await call('购票用于驳回路径', 'POST', '/visitor/tickets', visitor, {
    type: 'loop', originStationId: east, destStationId: east, visitorName: '陈某', phone: '13722220002',
  });
  const refund2 = await call('申请退票2', 'POST', `/visitor/tickets/${rfT2.code}/refund`, visitor, { reason: '临时改变行程' });
  await call('客服受理2', 'POST', `/refunds/${refund2.id}/cs-decide`, cs, { action: 'take' });
  await call('客服驳回2', 'POST', `/refunds/${refund2.id}/cs-decide`, cs, { action: 'reject', note: '已检票且非停运责任' });
  const restored = await call('驳回后车票恢复有效', 'GET', `/visitor/tickets/${rfT2.code}`, staff);
  ok('车票恢复为已出票', restored.status === 'issued', restored.status);

  console.log('— 团队包车 + 无障碍车辆 —');
  const ch = await call('提交团队包车（需无障碍）', 'POST', '/visitor/charters', visitor, {
    groupName: '夕阳红旅行团', contactPhone: '13733330001', partySize: 20, needAccessible: true, remark: '含2名轮椅游客',
  });
  await expectFail('不得向包车派非无障碍车', 'POST', `/dispatch/charters/${ch.id}/assign`, dispatch, { vehicleId: 4, driverId: 1 }, 400);
  await call('指派无障碍车与司机', 'POST', `/dispatch/charters/${ch.id}/assign`, dispatch, { vehicleId: 2, driverId: 1 });

  console.log('— 司机交班延误影响下一班 —');
  await expectFail('故障车修复前不能排下一班', 'POST', '/dispatch/trips', dispatch, {
    routeId: loopRoute, direction: 2, vehicleId: 4, driverId: 1, originStationId: east,
  });
  await call('4号车维修完成恢复运营', 'POST', '/dispatch/vehicles/4/repair', dispatch);
  const nextTrip = await call('排下一班（4号车/王师傅）', 'POST', '/dispatch/trips', dispatch, {
    routeId: loopRoute, direction: 2, vehicleId: 4, driverId: 1, originStationId: east,
  });
  await call('交班延误并关联下一班', 'POST', '/driver/handover', dispatch, {
    driverId: 1, vehicleId: 1, delayed: true, reason: '接班司机迟到15分钟', nextTripId: nextTrip.id,
  });
  const delayedList = await call('下一班标记为延误', 'GET', '/dispatch/trips?status=delayed', dispatch);
  ok('受交班影响班次状态=delayed', delayedList.some((t: any) => t.id === nextTrip.id));
  const handInc = await call('交班延误事件生成', 'GET', '/incidents?type=handover_delay', dispatch);
  ok('延误事件关联下一班次', handInc.some((i: any) => i.tripId === nextTrip.id));

  console.log('— 道路管制联动停运与广播 —');
  const rc = await call('发布东门道路管制并停运受影响班次', 'POST', '/dispatch/road-control', dispatch, {
    stationId: east, suspend: true, reason: '东门道路临时管制',
  });
  ok('道路管制返回受影响班次与事件', Array.isArray(rc.affectedTripIds));
  const rcInc = await call('道路管制事件生成', 'GET', '/incidents?type=road_control', dispatch);
  ok('道路管制事件为紧急级别', rcInc.length >= 1 && rcInc[0].severity === 'critical');

  console.log('— 天气暴雨预警 / 站点限流 / 广播 —');  await call('上报暴雨天气', 'POST', '/stations/weather', dispatch, { condition: 'storm', tempC: 21, windLevel: 6, alert: '暴雨橙色预警' });
  await call('热门站点限流', 'POST', `/dispatch/stations/${family}/status`, dispatch, { status: 'restricted', crowdLimit: 50 });
  await call('调度全线广播', 'POST', '/dispatch/broadcast', dispatch, { content: '请各站点安抚排队游客，优先安排老人儿童。', channel: 'all' });

  console.log('— 运营复盘 —');
  const report = await call('复盘总览', 'GET', '/reports/overview', dispatch);
  ok('含站点等待指标', Array.isArray(report.stations) && report.stations.some((s: any) => 'avgWaitSec' in s));
  ok('含车辆利用率', report.trips.avgUtilizationPct >= 0 && report.vehicles.length >= 4);
  ok('含投诉原因分类', report.complaints.byType && Object.keys(report.complaints.byType).length > 0);
  ok('含退票成本', typeof report.refunds.cost === 'number' && report.refunds.cost > 0);
  ok('含跳站/停运统计', report.trips.skippedStations >= 1 && report.trips.suspended >= 1);
  ok('含司机工时', report.drivers.some((d: any) => d.workedMinutes > 0));

  console.log('— 事件贯通一张票/一班车 —');
  const ticketIncidents = await call('按车票聚合协同事件', 'GET', `/incidents?ticketId=${wrong.id}`, staff);
  ok('误乘票可追溯事件', ticketIncidents.length >= 1);
  const tripIncidents = await call('按班次聚合协同事件', 'GET', `/incidents?tripId=${upTrip.id}`, staff);
  ok('停运班次可追溯跳站/停运多事件', tripIncidents.length >= 2, tripIncidents.map((i: any) => i.type));

  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  if (fail > 0) process.exit(1);
  console.log('END_TO_END_OK');
}

main().catch((e) => {
  console.error('E2E 异常中断：', e);
  process.exit(1);
});
