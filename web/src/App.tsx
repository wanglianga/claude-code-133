import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getUser, logout, saveSession } from './api';
import { ToastProvider, useToast } from './ui';
import { VisitorView } from './views/visitor';
import { StationView } from './views/station';
import { DispatchView, TripsView, CharterView } from './views/dispatch';
import { DriverView } from './views/driver';
import { RefundView } from './views/refund';
import { IncidentsView } from './views/incidents';
import { ReportView } from './views/report';

const ROLE_LABEL: any = {
  visitor: '游客', staff: '站点工作人员', driver: '司机', dispatch: '调度中心',
  cs: '客服', cs_lead: '客服主管', finance: '财务', admin: '管理员',
};
const ACCOUNTS = [
  ['visitor', '游客', 'visitor / 123456'],
  ['staff01', '站点工作人员', 'staff01 / 123456'],
  ['driver01', '司机', 'driver01 / 123456'],
  ['dispatch', '调度中心', 'dispatch / 123456'],
  ['cs', '客服', 'cs / 123456'],
  ['cslead', '客服主管', 'cslead / 123456'],
  ['finance', '财务', 'finance / 123456'],
  ['admin', '管理员', 'admin / 123456'],
];

function Login() {
  const toast = useToast();
  const [username, setUsername] = useState('visitor');
  const [password, setPassword] = useState('123456');
  const submit = async (u?: string) => {
    try {
      const data = await api('POST', '/auth/login', { username: u || username, password });
      saveSession(data.token, data.user);
      location.reload();
    } catch (e: any) {
      toast(e.message, true);
    }
  };
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>景区观光车排队上车与站点调度平台</h1>
        <p className="sub">票务 · 排队检票 · 车辆调度 · 异常协同 · 退票 · 运营复盘</p>
        <label className="fld"><b>账号</b>
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="fld"><b>密码</b>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </label>
        <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => submit()}>登录</button>
        <div className="login-grid">
          {ACCOUNTS.map(([u, role, hint]) => (
            <button key={u} className="login-acct" onClick={() => submit(u)}>
              <b>{role}</b><span>{hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function tabsForRole(role: string): string[] {
  switch (role) {
    case 'visitor': return ['visitor'];
    case 'staff': return ['station', 'incidents'];
    case 'driver': return ['driver', 'incidents'];
    case 'dispatch': return ['board', 'trips', 'charters', 'incidents', 'report'];
    case 'cs':
    case 'cs_lead': return ['refunds', 'incidents'];
    case 'finance': return ['refunds', 'incidents'];
    case 'admin': return ['board', 'trips', 'charters', 'station', 'refunds', 'incidents', 'report'];
    default: return [];
  }
}
const TAB_LABEL: any = {
  visitor: '购票 / 我的车票', station: '站点平板', driver: '司机工作台',
  board: '调度看板', trips: '派班与班次', charters: '团队包车',
  refunds: '退票工单', incidents: '协同事件', report: '运营复盘',
};

function Shell() {
  const user = getUser();
  const toast = useToast();
  const tabs = useMemo(() => tabsForRole(user.role), [user.role]);
  const [tab, setTab] = useState(tabs[0]);
  const [ref, setRef] = useState<any>({ stations: [], routes: [], routeStops: [], vehicles: [], drivers: [], weather: [] });

  const loadRef = useCallback(async () => {
    try { setRef(await api('GET', '/ref')); } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadRef(); }, [loadRef]);

  const isLead = user.role === 'cs_lead';
  const isFinance = user.role === 'finance';
  const isStaff = user.role === 'staff' || user.role === 'admin';
  const isDispatch = user.role === 'dispatch' || user.role === 'admin';

  return (
    <div>
      <div className="appbar">
        <span className="logo">🚐 观光车调度平台</span>
        <div className="tabs">
          {tabs.map((t) => (
            <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>{TAB_LABEL[t]}</button>
          ))}
        </div>
        <span className="spacer" />
        <span className="who">{user.name} · {ROLE_LABEL[user.role]}</span>
        <button className="btn secondary sm" onClick={() => { logout(); location.reload(); }}>退出</button>
      </div>
      <div className="container">
        {tab === 'visitor' && <VisitorView ref={ref} />}
        {tab === 'station' && <StationView ref={ref} onChanged={loadRef} />}
        {tab === 'driver' && <DriverView ref={ref} />}
        {tab === 'board' && <DispatchView ref={ref} onChanged={loadRef} />}
        {tab === 'trips' && <TripsView ref={ref} onChanged={loadRef} />}
        {tab === 'charters' && <CharterView ref={ref} onChanged={loadRef} />}
        {tab === 'refunds' && <RefundView lead={isLead} finance={isFinance} staff={isStaff || isDispatch} />}
        {tab === 'incidents' && <IncidentsView role={user.role} />}
        {tab === 'report' && <ReportView />}
      </div>
    </div>
  );
}

export function App() {
  const user = getUser();
  return <ToastProvider>{user ? <Shell /> : <Login />}</ToastProvider>;
}
