import React, { useCallback, useContext, useState } from 'react';

export const TICKET_TYPE_LABEL: any = {
  single: '单程票', loop: '环线票', family: '亲子票', accessible: '无障碍优先票',
};
export const TICKET_STATUS_LABEL: any = {
  issued: ['已出票', 'gray'], queued: ['排队中', 'amber'], boarded: ['已上车', 'blue'],
  completed: ['已完成', 'green'], refund_pending: ['退票处理中', 'amber'], refunded: ['已退票', 'red'], rejected: ['退票驳回', 'red'],
};
export const TRIP_STATUS_LABEL: any = {
  scheduled: ['已排班', 'gray'], boarding: ['上客中', 'blue'], running: ['行驶中', 'blue'],
  completed: ['已完成', 'green'], suspended: ['临时停运', 'red'], cancelled: ['已取消', 'red'], delayed: ['延误', 'amber'],
};
export const VEHICLE_STATUS_LABEL: any = {
  idle: ['待命', 'gray'], running: ['运营中', 'blue'], charging: ['充电中', 'amber'], maintenance: ['故障维修', 'red'],
};
export const DRIVER_STATUS_LABEL: any = {
  off_duty: ['下班', 'gray'], on_duty: ['在岗', 'green'], driving: ['驾驶中', 'blue'], resting: ['休息中', 'amber'],
};
export const INCIDENT_LABEL: any = {
  long_queue: '排队过长', full_skip: '满载跳站', wrong_direction: '误上反方向', priority_dispute: '优先争议',
  vehicle_fault: '车辆故障', handover_delay: '交班延误', storm_suspension: '暴雨停运', refund_request: '退票诉求',
  road_control: '道路管制', congestion: '拥堵/限流', geofence: '电子围栏', other: '其他',
};
export const INCIDENT_STATUS_LABEL: any = { open: ['待处理', 'red'], processing: ['处理中', 'amber'], resolved: ['已解决', 'green'] };
export const REFUND_STATUS_LABEL: any = {
  requested: ['待客服受理', 'amber'], cs_reviewing: ['客服处理中', 'blue'], escalated: ['主管裁决中', 'purple'],
  approved: ['待财务退款', 'amber'], refunded: ['已退款', 'green'], rejected: ['已驳回', 'red'],
};

export function Badge({ v, map }: { v: string; map: any }) {
  const pair = map[v] || [v, 'gray'];
  return <span className={`badge ${pair[1]}`}>{pair[0]}</span>;
}
export function Tag({ text, tone = 'gray' }: { text: string; tone?: string }) {
  return <span className={`badge ${tone}`}>{text}</span>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: any; sub?: React.ReactNode; tone?: '' | 'warn' | 'crit' | 'ok' }) {
  return (
    <div className={`stat ${tone || ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub != null && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Bar({ pct, tone }: { pct: number; tone?: string }) {
  const t = tone || (pct >= 90 ? 'red' : pct >= 70 ? 'amber' : '');
  return (
    <div className="row" style={{ gap: 8 }}>
      <div className="bar-track" style={{ flex: 1 }}>
        <div className={`bar-fill ${t}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      <span className="muted" style={{ minWidth: 38, textAlign: 'right' }}>{Math.round(pct)}%</span>
    </div>
  );
}

const ToastCtx = React.createContext<(msg: string, err?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; err: boolean; key: number } | null>(null);
  const show = useCallback((msg: string, err = false) => {
    setToast({ msg, err, key: Date.now() });
    setTimeout(() => setToast((t) => (t && Date.now() - t.key >= 2400 ? null : t)), 2500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && <div key={toast.key} className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
    </ToastCtx.Provider>
  );
}

export async function handle<T>(promise: Promise<T>, okMsg: string, toast: (m: string, e?: boolean) => void) {
  try {
    const data = await promise;
    if (okMsg) toast(okMsg);
    return data;
  } catch (e: any) {
    toast(e.message || '操作失败', true);
    throw e;
  }
}

export function fmtTime(d: any) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
