import { Link } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { SITE_URL, useNav } from '../components/nav';
import { displayTitle } from '../components/people';
import { Avatar } from '../components/ui';
import { IconLink, IconLogout } from '../components/icons';

/** Phone menu: every section as a big, easy-to-tap tile. */
export function MorePage() {
  const { profile } = useMe();
  const { positionById } = useData();
  const { sections } = useNav();
  return (
    <div className="stack">
      <Link to="/profile" className="card card-pad row" style={{ textDecoration: 'none', color: 'inherit', flexWrap: 'nowrap' }}>
        <Avatar name={profile.name} size="lg" />
        <div style={{ minWidth: 0 }}><h2>{profile.name}</h2><p className="small muted">{displayTitle(profile, positionById)}</p></div>
      </Link>
      {sections.map((s, i) => (
        <section key={i} className="stack-sm">
          {s.label && <div className="tier">{s.label}</div>}
          <div className="card menu-list">
            {s.items.filter((it) => it.to !== '/').map((it) => (
              <Link key={it.to + it.label} to={it.to} className="menu-item">
                <span className="mi-icon">{it.icon}</span>
                <span className="mi-text"><b>{it.label}</b>{it.hint && <span>{it.hint}</span>}</span>
                {!!it.count && <span className="count">{it.count}</span>}
              </Link>
            ))}
          </div>
        </section>
      ))}
      <div className="card menu-list">
        <a href={SITE_URL} target="_blank" rel="noopener noreferrer" className="menu-item"><span className="mi-icon"><IconLink /></span><span className="mi-text"><b>ElevateX website</b><span>elevate-x.in</span></span></a>
        <button className="menu-item" onClick={() => signOut(auth)}><span className="mi-icon"><IconLogout /></span><span className="mi-text"><b>Sign out</b></span></button>
      </div>
    </div>
  );
}
