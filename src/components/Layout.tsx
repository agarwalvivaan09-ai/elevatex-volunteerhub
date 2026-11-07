import { LOGO } from '../lib/paths';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { migrateToV2 } from '../lib/api';
import { displayTitle } from './people';
import { Avatar, Loading } from './ui';
import {
  IconBell, IconCalc, IconCalendar, IconChart, IconChat, IconClock, IconHome, IconInbox, IconLogout, IconMenu, IconOrg, IconTask, IconUser, IconUsers, IconVideo, IconBuilding,
} from './icons';

export function Layout() {
  const { profile, can } = useMe();
  const { ready, participations, positionById, departmentById, notifications, tasks, activities, feedback } = useData();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  // One-time upgrade of a v1 install: the original Admin becomes Chairman and the ElevateX structure is installed.
  const migrated = useRef(false);
  useEffect(() => {
    if (!ready || migrated.current || !can.isPeopleAdmin) return;
    if (profile.role === 'admin' || !departmentById.has('drive-execution')) {
      migrated.current = true;
      migrateToV2(profile).catch((e) => console.error('migration failed', e));
    }
  }, [ready, can.isPeopleAdmin, profile, departmentById]);

  const unread = notifications.filter((n) => !n.read).length;
  const openTasks = tasks.filter((t) => t.assigneeUid === profile.id && t.status !== 'done').length;
  const proposals = can.isCore ? activities.filter((a) => a.status === 'proposed' && a.createdBy !== profile.id).length : 0;
  const pendingHours = can.isCore ? participations.filter((p) => p.hoursStatus === 'pending' && (activities.find((a) => a.id === p.activityId) ? can.canManageActivity(activities.find((a) => a.id === p.activityId)!) : false)).length : 0;
  const newFeedback = can.canSeeFeedback ? feedback.filter((f) => f.status === 'new').length : 0;
  const myDept = profile.departmentId ? departmentById.get(profile.departmentId) : undefined;

  return (
    <div className={`shell ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar" aria-label="Main navigation">
        <NavLink to="/" className="brand">
          <img src={LOGO} alt="" />
          <div><b>ElevateX</b><span>Volunteer Hub</span></div>
        </NavLink>
        <nav className="nav">
          <NavLink to="/" end><IconHome />Dashboard</NavLink>
          <NavLink to="/notifications"><IconBell />Notifications{unread > 0 && <span className="count">{unread}</span>}</NavLink>
          <NavLink to="/activities"><IconCalendar />Drives & fundraisers</NavLink>
          <NavLink to="/meetings"><IconVideo />Meetings</NavLink>
          <NavLink to="/tasks"><IconTask />Tasks{openTasks > 0 && <span className="count">{openTasks}</span>}</NavLink>
          <NavLink to="/contributions"><IconClock />My contributions</NavLink>
          {myDept && <NavLink to={`/departments/${myDept.id}`}><IconBuilding />{myDept.name}</NavLink>}
          <NavLink to="/feedback"><IconChat />{can.canSeeFeedback ? 'Member feedback' : 'Feedback to HR'}{newFeedback > 0 && <span className="count">{newFeedback}</span>}</NavLink>
          {can.isCore && (
            <>
              <div className="nav-label">Manage</div>
              <NavLink to="/review"><IconInbox />Approvals{proposals + pendingHours > 0 && <span className="count">{proposals + pendingHours}</span>}</NavLink>
              <NavLink to="/analytics"><IconChart />Analytics</NavLink>
            </>
          )}
          <div className="nav-label">Organisation</div>
          <NavLink to="/members"><IconUsers />{can.isPeopleAdmin ? 'People' : 'Directory'}</NavLink>
          <NavLink to="/organisation"><IconOrg />Structure</NavLink>
          <NavLink to="/edpi"><IconCalc />EDPI calculator</NavLink>
          <NavLink to="/profile"><IconUser />My profile</NavLink>
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
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn" aria-label="Open menu" onClick={() => setOpen(true)}><IconMenu /></button>
          <img src={LOGO} alt="" />
          <b style={{ flex: 1 }}>ElevateX Hub</b>
          <Link to="/notifications" className="icon-btn bell" aria-label={`Notifications (${unread} unread)`}>
            <IconBell />{unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
          </Link>
        </header>
        <main className="content">{ready ? <Outlet /> : <Loading />}</main>
      </div>
    </div>
  );
}
