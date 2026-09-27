import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, handle, DRIVER_STATUS_LABEL, TRIP_STATUS_LABEL, useToast } from '../ui';

const CHECK_ITEMS: Array<[string, string]> = [
  ['brake', '刹车系统'], ['tire', '轮胎气压'], ['light', '灯光信号'], ['door', '车门/防护'], ['wheelchairLock', '轮椅固定锁'],
];

export function DriverView({ ref }: { ref: any }) {
  const toast = useToast();
  const [driverId, setDriverId] = useState<number>(ref.drivers?.[0]?.id || 0);
  const [vehicleId, setVehicleId] = useState<number>(ref.vehicles?.[0]?.id || 0);
  const [items, setItems] = useState<Record<string, boolean>>({ brake: true, tire: true, light: true, door: true, wheelchairLock: true });
  const [note, setNote] = useState('');
  const [trips, setTrips] = useState<any[]>([]);

  useEffect(() => { setDriverId(ref.drivers?.[0]?.id || 0); setVehicleId(ref.vehicles?.[0]?.id || 0); }, [ref.drivers, ref.vehicles]);
  const loadTrips = async () => setTrips(await api('GET', '/dispatch/trips'));
  useEffect(() => { loadTrips(); }, []);

  const driver = (ref.drivers || []).find((d: any) => d.id === driverId);
  const myTrips = trips.filter((t) => t.driverId === driverId && !['completed', 'cancelled'].includes(t.status));

  const safety = async () => {
    await handle(api('POST', '/driver/safety-check', { driverId, vehicleId, items, note }), '安全检查已提交（不合格将锁定车辆）', toast);
    loadTrips();
  };
  const position = async (tripId: number) => {
    const lat = Number(prompt('纬度', '30.2705'));
    const lng = Number(prompt('经度', '120.1588'));
    const batteryPct = Number(prompt('电量%', '70'));
    if (Number.isNaN(lat)) return;
    await handle(api('POST', `/dispatch/trips/${tripId}/position`, { lat, lng, batteryPct }), '已上报位置与电量', toast);
  };
  const handover = async (delayed: boolean) => {
    const next = myTrips.find((t) => t.status === 'scheduled');
    const reason = delayed ? prompt('交班延误原因', '接班司机未到岗') : '';
    if (delayed && reason === null) return;
    await handle(
      api('POST', '/driver/handover', { driverId, vehicleId, delayed, reason: reason || '正常交班', nextTripId: delayed && next ? next.id : null }),
      delayed ? '已登记交班延误，下一班标记延误并通知调度' : '已正常交班',
      toast,
    );
    loadTrips();
  };
  const rest = async (resting: boolean) => {
    await handle(api('POST', `/driver/${driverId}/rest`, { resting }), resting ? '已进入休息' : '已复班', toast);
    setTimeout(() => location.reload(), 600);
  };

  return (
    <div className="grid cols-2">
      <div className="card">
        <h3>司机与车辆</h3>
        <div className="grid cols-2">
          <label className="fld"><b>我是司机</b>
            <select value={driverId} onChange={(e) => setDriverId(Number(e.target.value))}>
              {(ref.drivers || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}（{DRIVER_STATUS_LABEL[d.status][0]}）</option>)}
            </select>
          </label>
          <label className="fld"><b>当前车辆</b>
            <select value={vehicleId} onChange={(e) => setVehicleId(Number(e.target.value))}>
              {(ref.vehicles || []).map((v: any) => <option key={v.id} value={v.id}>{v.name}（电量{v.batteryPct}%）</option>)}
            </select>
          </label>
        </div>
        <dl className="kv">
          <dt>当班状态</dt><dd>{driver && <Badge v={driver.status} map={DRIVER_STATUS_LABEL} />}</dd>
          <dt>本班工时</dt><dd>{driver?.workedMinutes ?? 0} 分钟（达 {driver?.maxWorkMinutes ?? 480} 分钟须休息）</dd>
          <dt>已休息</dt><dd>{driver?.restMinutes ?? 0} 分钟</dd>
        </dl>
        <div className="row mt8">
          {driver?.status !== 'resting'
            ? <button className="btn secondary" onClick={() => rest(true)}>开始休息</button>
            : <button className="btn" onClick={() => rest(false)}>结束休息复班</button>}
          <button className="btn secondary" onClick={() => handover(false)}>正常交班</button>
          <button className="btn amber" onClick={() => handover(true)}>交班延误登记</button>
        </div>
        <p className="muted mt8">交班延误会自动把下一班标记为“延误”并生成调度事件；调度需改派司机或顺延发车。</p>
      </div>

      <div className="card">
        <h3>发车前安全检查</h3>
        {CHECK_ITEMS.map(([k, label]) => (
          <label key={k} className="checkline">
            <input type="checkbox" checked={!!items[k]} onChange={(e) => setItems({ ...items, [k]: e.target.checked })} />
            {label}
          </label>
        ))}
        <label className="fld mt8"><b>检查备注</b><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="如有异常请说明" /></label>
        <div className="row end"><button className="btn" onClick={safety}>提交安全检查</button></div>
        <p className="muted mt8">任一项不合格将判定检查不通过、车辆锁定为维修状态并通知调度；未通过检查的班次不能发车。</p>
      </div>

      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h3>我的班次（位置/电量上报）</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>班次</th><th>线路</th><th>车辆</th><th>状态</th><th>已售票</th><th>操作</th></tr></thead>
            <tbody>
              {myTrips.map((t) => (
                <tr key={t.id}>
                  <td><b>#{t.id}</b></td>
                  <td>{t.route?.name}（{t.direction === 1 ? '正向' : '反向'}）</td>
                  <td>{t.vehicle?.name}</td>
                  <td><Badge v={t.status} map={TRIP_STATUS_LABEL} /></td>
                  <td>{t.seatsSold}</td>
                  <td>
                    {['scheduled', 'boarding', 'running', 'delayed'].includes(t.status) && (
                      <button className="btn blue sm" onClick={() => position(t.id)}>上报位置/电量</button>
                    )}
                    {t.status === 'delayed' && <span className="badge red" style={{ marginLeft: 8 }}>受交班影响延误</span>}
                  </td>
                </tr>
              ))}
              {myTrips.length === 0 && <tr><td colSpan={6} className="muted">当前没有进行中的班次</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
