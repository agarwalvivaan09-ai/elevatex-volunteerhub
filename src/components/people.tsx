import { Link } from 'react-router-dom';
import type { Department, Position, Role, UserProfile } from '../lib/types';
import { ROLE_LABEL } from '../lib/types';
import { normRole } from '../lib/access';
import { Avatar } from './ui';
import { IconMail } from './icons';

/** "Founder, Former CEO & Chairman" if set, else the position title, else the access tier. */
export function displayTitle(u: UserProfile, positionById: Map<string, Position>) {
  if (u.title) return u.title;
  const pos = u.positionId ? positionById.get(u.positionId) : undefined;
  return pos?.title ?? ROLE_LABEL[u.role];
}

const tone: Record<string, string> = { chairman: 'brown', vice_chairman: 'brown', executive: 'brown', board: 'info', hod: 'brand', member: '' };
export function RoleBadge({ role }: { role: Role }) {
  const r = normRole(role);
  return <span className={`badge plain ${tone[r]}`}>{ROLE_LABEL[r]}</span>;
}

export function PersonCard({ u, positionById, departmentById, showDept = true }: { u: UserProfile; positionById: Map<string, Position>; departmentById: Map<string, Department>; showDept?: boolean }) {
  const dept = u.departmentId ? departmentById.get(u.departmentId)?.name : undefined;
  return (
    <div className="card person-card">
      <Avatar name={u.name} />
      <div className="who">
        <Link to={`/members/${u.id}`}>{u.name}</Link>
        <div>{displayTitle(u, positionById)}{showDept && dept && normRole(u.role) === 'member' ? ` · ${dept}` : ''}</div>
      </div>
      <a className="icon-btn" href={`mailto:${u.email}`} title={`Email ${u.email}`} aria-label={`Email ${u.name}`}><IconMail /></a>
    </div>
  );
}

/** Sort order for showing people by seniority. */
export const ROLE_ORDER: Record<string, number> = { chairman: 0, admin: 0, vice_chairman: 1, executive: 2, board: 3, hod: 4, member: 5, core: 5 };
export const bySeniority = (a: UserProfile, b: UserProfile) => (ROLE_ORDER[a.role] - ROLE_ORDER[b.role]) || a.name.localeCompare(b.name);
