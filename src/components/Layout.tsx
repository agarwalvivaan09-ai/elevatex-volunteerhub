import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { ROLE_LABEL } from '../lib/types';
import { Avatar, Loading } from './ui';
import { IconCalc, IconCalendar, IconChart, IconClock, IconHome, IconInbox, IconLogout, IconMenu, IconOrg, IconUser, IconUsers } from './icons';

export function Layout() {
  const { profile, isCore } = useMe();
  const { ready, participations, positionById } = useData();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  const toReview = isCore
    ? participations.filter((p) => p.status === 'requested' || p.hoursStatus === 'pending').length
    : 0;
  const position = profile.positionId ? positionById.get(profile.positionId)?.title : null;

  return (
    <div className={`shell ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar" aria-label="Main navigation">
        <NavLink to="/" className="brand">
          <img src="/logo-icon.png" alt="" />
          <div><b>ElevateX</b><span>Volunteer Hub</span></div>
        </NavLink>
        <nav className="nav">
          <NavLink to="/" end><IconHome />Dashboard</NavLink>
          <NavLink to="/activities"><IconCalendar />Activities</NavLink>
          <NavLink to="/contributions"><IconClock />My contributions</NavLink>
          {isCore && (
            <>
              <div className="nav-label">Manage</div>
              <NavLink to="/review"><IconInbox />Review queue{toReview > 0 && <span className="count">{toReview}</span>}</NavLink>
              <NavLink to="/analytics"><IconChart />Analytics</NavLink>
            </>
          )}
          <div className="nav-label">Organisation</div>
          <NavLink to="/members"><IconUsers />{isCore ? 'Members' : 'Directory'}</NavLink>
          <NavLink to="/organisation"><IconOrg />Structure & positions</NavLink>
          <NavLink to="/edpi"><IconCalc />EDPI calculator</NavLink>
          <NavLink to="/profile"><IconUser />My profile</NavLink>
        </nav>
        <div className="sidebar-foot">
          <Avatar name={profile.name} />
          <div className="who">
            <b>{profile.name}</b>
            <span>{position ?? ROLE_LABEL[profile.role]}</span>
          </div>
          <button className="icon-btn" title="Sign out" aria-label="Sign out" onClick={() => signOut(auth)}><IconLogout /></button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn" aria-label="Open menu" onClick={() => setOpen(true)}><IconMenu /></button>
          <img src="/logo-icon.png" alt="" />
          <b>ElevateX Hub</b>
        </header>
        <main className="content">{ready ? <Outlet /> : <Loading />}</main>
      </div>
    </div>
  );
}
