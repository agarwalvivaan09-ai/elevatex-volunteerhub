import { LOGO } from '../lib/paths';
import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { migrateToV2 } from '../lib/api';
import { displayTitle } from './people';
import { SITE_URL, useNav } from './nav';
import { Avatar, Loading } from './ui';
import { IconBell, IconLink, IconLogout, IconMenu } from './icons';

export function Layout() {
  const { profile, can } = useMe();
  const { ready, positionById, departmentById, activityById } = useData();
  const { sections, tabs, moreCount, unread } = useNav();
  const location = useLocation();
  const main = useRef<HTMLElement>(null);

  // Scroll to top on every page change (important on phones).
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  // One-time upgrade of a v1 install: the original Admin becomes Chairman and the ElevateX structure is installed.
  const migrated = useRef(false);
  useEffect(() => {
    if (!ready || migrated.current || !can.isPeopleAdmin) return;
    if (profile.role === 'admin' || !departmentById.has('drive-execution')) {
      migrated.current = true;
      migrateToV2(profile).catch((e) => console.error('migration failed', e));
    }
  }, [ready, can.isPeopleAdmin, profile, departmentById]);

  // Which phone tab is "current": a meeting's page belongs to Meetings, not Drives.
  const path = location.pathname;
  const viewedActivity = path.startsWith('/activities/') ? activityById.get(path.split('/')[2] ?? '') : undefined;
  const isMeetingPage = path.startsWith('/meetings') || viewedActivity?.type === 'meeting' || (path === '/activities/new' && location.search.includes('type=meeting'));
  const activeTab = path === '/' ? '/' : isMeetingPage ? '/meetings' : path.startsWith('/activities') ? '/activities' : path.startsWith('/tasks') ? '/tasks' : '/more';

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Main navigation">
        <NavLink to="/" className="brand">
          <img src={LOGO} alt="" />
          <div><b>ElevateX</b><span>Volunteer Hub</span></div>
        </NavLink>
        <nav className="nav">
          {sections.map((s, i) => (
            <div key={i} className="nav-group">
              {s.label && <div className="nav-label">{s.label}</div>}
              {s.items.map((it) => (
                <NavLink key={it.to + it.label} to={it.to} end={it.to === '/'}>{it.icon}{it.label}{!!it.count && <span className="count">{it.count}</span>}</NavLink>
              ))}
            </div>
          ))}
          <a href={SITE_URL} target="_blank" rel="noopener noreferrer" className="site-link"><IconLink />elevate-x.in</a>
        </nav>
        <div className="sidebar-foot">
          <Avatar name={profile.name} />
          <div className="who">
            <b>{profile.name}</b>
            <span>{displayTitle(profile, positionById)}</span>
          </div>
          <button className="icon-btn" title="Sign out" aria-label="Sign out" onClick={() => signOut(auth)}><IconLogout /></button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <Link to="/" className="topbar-brand"><img src={LOGO} alt="" /><b>ElevateX Hub</b></Link>
          <Link to="/notifications" className="icon-btn bell" aria-label={`Notifications (${unread} unread)`}>
            <IconBell />{unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
          </Link>
        </header>
        <main className="content" ref={main}>{ready ? <Outlet /> : <Loading />}</main>
      </div>

      <nav className="tabbar" aria-label="Quick navigation">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} className={() => (activeTab === t.to ? 'active' : '')}>
            <span className="ti">{t.icon}{!!t.count && <span className="dot">{t.count}</span>}</span>{t.label}
          </NavLink>
        ))}
        <NavLink to="/more" className={() => (activeTab === '/more' ? 'active' : '')}>
          <span className="ti"><IconMenu />{moreCount > 0 && <span className="dot">{moreCount > 9 ? '9+' : moreCount}</span>}</span>More
        </NavLink>
      </nav>
    </div>
  );
}
