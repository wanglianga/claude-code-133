import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Bar, Stat, Tag, INCIDENT_LABEL } from '../ui';

export function ReportView() {
  const [r, setR] = useState<any>(null);
  useEffect(() => { api('GET', '/reports/overview').then(setR); }, []);
  if (!r) return <div className="muted">加载中…</div>;

  const maxWait = Math.max(60, ...r.stations.map((s: any) => s.avgWaitSec));
  const maxChecked = Math.max(1, ...r.stations.map((s: any) => s.checkedToday));
  const complaintTotal = Object.values(r.complaints.byType).reduce((a: number, b: any) => a + Number(b), 0) as number;
  const complaintRows = Object.entries(r.complaints.byType).sort((a: any, b: any) => b[1] - a[1]) as Array<[string, number]>;
  const refundRows = Object.entries(r.refunds.reasonCount).sort((a: any, b: any) => b[1] - a[1]) as Array<[string, number]>;
  const refundMax = Math.max(1, ...refundRows.map(([, n]) => n));

  return (
    <div>
      <div className="grid cols-4">
        <Stat label="完成班次" value={r.trips.completed} sub={`平均利用率 ${r.trips.avgUtilizationPct}%`} tone="ok" />
        <Stat label="停运 / 跳站" value={`${r.trips.suspended} / ${r.trips.skippedStations}`} sub="暴雨停运次数 / 累计跳站" tone={r.trips.suspended ? 'warn' : ''} />
        <Stat label="未闭环事件" value={r.complaints.open} sub={`事件总数 ${r.complaints.total}`} tone={r.complaints.open ? 'crit' : ''} />
        <Stat label="退票成本" value={`¥${r.refunds.cost}`} sub={`退款 ${r.refunds.refunded} 笔 · 争议 ${r.refunds.disputed} 笔`} tone="warn" />
      </div>

      <div className="grid cols-2 mt16">
        <div className="card">
          <h3>站点等待与检票（热门站点拥堵）</h3>
          <table>
            <tbody>
              {r.stations.map((s: any) => (
                <tr key={s.id}>
                  <td style={{ width: 110 }}>{s.name}{s.hot ? ' 🔥' : ''}</td>
                  <td style={{ minWidth: 150 }} title={`平均等待 ${Math.round(s.avgWaitSec / 60)} 分钟`}>
                    <Bar pct={(s.avgWaitSec / maxWait) * 100} tone={s.avgWaitSec > 180 ? 'red' : s.avgWaitSec > 60 ? 'amber' : ''} />
                  </td>
                  <td style={{ width: 130 }} className="muted">均待 {Math.round(s.avgWaitSec / 60)} 分 / 最长 {Math.round(s.maxWaitSec / 60)} 分</td>
                  <td style={{ width: 140 }}><Bar pct={(s.checkedToday / maxChecked) * 100} tone="blue" /></td>
                  <td style={{ width: 90 }} className="muted">检票 {s.checkedToday}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted mt8">条形：左为平均等待时长，右为今日检票量。等待超 3 分钟即进入预警色。</p>
        </div>

        <div className="card">
          <h3>车辆利用率 / 电量 / 无障碍</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>车辆</th><th>利用率</th><th>电量</th><th>班次</th><th>无障碍</th><th>状态</th></tr></thead>
              <tbody>
                {r.vehicles.map((v: any) => (
                  <tr key={v.id}>
                    <td>{v.plate}<div className="muted">{v.name}</div></td>
                    <td style={{ minWidth: 130 }}><Bar pct={v.utilizationPct} /></td>
                    <td style={{ minWidth: 110 }}><Bar pct={v.batteryPct} tone={v.batteryPct < 25 ? 'red' : v.batteryPct < 50 ? 'amber' : ''} /></td>
                    <td>{v.trips}</td>
                    <td>{v.accessible ? <Tag text="♿" tone="purple" /> : '—'}</td>
                    <td>{v.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3>投诉 / 异常原因分布</h3>
          {complaintRows.map(([type, n]) => (
            <div key={type} className="row mt8" style={{ gap: 10 }}>
              <span style={{ width: 96, fontSize: 13 }}>{INCIDENT_LABEL[type] || type}</span>
              <div className="bar-track" style={{ flex: 1 }}><div className="bar-fill amber" style={{ width: `${(n / Math.max(1, complaintTotal)) * 100}%` }} /></div>
              <b style={{ width: 28, textAlign: 'right' }}>{n}</b>
            </div>
          ))}
          {complaintRows.length === 0 && <p className="muted">暂无事件</p>}
        </div>

        <div className="card">
          <h3>退票成本与原因</h3>
          <div className="grid cols-2">
            <Stat label="退票申请" value={r.refunds.total} />
            <Stat label="已退款 / 争议" value={`${r.refunds.refunded} / ${r.refunds.disputed}`} tone="warn" />
          </div>
          {refundRows.map(([reason, n]) => (
            <div key={reason} className="row mt8" style={{ gap: 10 }}>
              <span title={reason} style={{ width: 150, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reason}</span>
              <div className="bar-track" style={{ flex: 1 }}><div className="bar-fill red" style={{ width: `${(n / refundMax) * 100}%` }} /></div>
              <b style={{ width: 28, textAlign: 'right' }}>{n}</b>
            </div>
          ))}
          {refundRows.length === 0 && <p className="muted mt8">暂无退票</p>}
        </div>
      </div>

      <div className="card mt16">
        <h3>司机工时与休息</h3>
        <div className="grid cols-3">
          {r.drivers.map((d: any) => (
            <div key={d.id} className="stat">
              <div className="label">{d.name} · {d.status}{d.workedMinutes >= 480 ? ' ⚠️ 达工时上限' : ''}</div>
              <div className="mt8"><Bar pct={(d.workedMinutes / 480) * 100} tone={d.workedMinutes >= 480 ? 'red' : d.workedMinutes >= 400 ? 'amber' : ''} /></div>
              <div className="sub mt8">已工作 {Math.floor(d.workedMinutes / 60)}h{d.workedMinutes % 60}m · 已休息 {d.restMinutes}m</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
