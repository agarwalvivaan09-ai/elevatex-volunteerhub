import type { ReactElement } from 'react';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
  IconBell, IconBuilding, IconCalc, IconCalendar, IconChart, IconChat, IconClock, IconHome, IconInbox, IconOrg, IconTask, IconUser, IconUsers, IconVideo,
} from './icons';

export const SITE_URL = 'https://elevate-x.in';

export interface NavItem { to: string; label: string; icon: ReactElement; count?: number; hint?: string }
export interface NavSection { label: string | null; items: NavItem[] }

/** One definition of the app's navigation, used by the sidebar, the phone tab bar and the More page. */
export function useNav() {
  const { profile, can } = useMe();
  const { notifications, tasks, activities, participations, activityById, feedback, deptRequests, departmentById } = useData();

  const unread = notifications.filter((n) => !n.read).length;
  const openTasks = tasks.filter((t) => t.assigneeUid === profile.id && t.status !== 'done').length;
  const approvals = can.isCore
    ? activities.filter((a) => a.status === 'proposed' && can.canApproveDrive(a)).length +
      participations.filter((p) => {
        const a = activityById.get(p.activityId);
        return p.hoursStatus === 'pending' && !!a && can.canManageActivity(a) && (p.uid !== profile.id || can.isLeadership);
      }).length
    : 0;
  const hr = can.canSeeFeedback ? feedback.filter((f) => f.status === 'new').length + deptRequests.filter((r) => r.status === 'pending').length : 0;
  const myDept = profile.departmentId ? departmentById.get(profile.departmentId) : undefined;

  const sections: NavSection[] = [
    {
      label: null,
      items: [
        { to: '/', label: 'Home', icon: <IconHome /> },
        { to: '/notifications', label: 'Notifications', icon: <IconBell />, count: unread },
        { to: '/activities', label: 'Drives & fundraisers', icon: <IconCalendar />, hint: 'Volunteer or propose a drive' },
        { to: '/meetings', label: 'Meetings', icon: <IconVideo />, hint: 'Join online meetings' },
        { to: '/tasks', label: 'Tasks', icon: <IconTask />, count: openTasks, hint: 'Work from your department head' },
      ],
    },
    {
      label: 'You',
      items: [
        { to: '/contributions', label: 'My hours', icon: <IconClock />, hint: 'Verified hours and history' },
        { to: '/hr', label: 'HR', icon: <IconChat />, count: hr, hint: can.canSeeFeedback ? 'Feedback and department requests' : 'Give feedback or change department' },
        { to: '/profile', label: 'My profile', icon: <IconUser /> },
      ],
    },
    ...(can.isCore
      ? [{
          label: 'Core team',
          items: [
            { to: '/review', label: 'Approvals', icon: <IconInbox />, count: approvals, hint: 'Drive proposals and hours' },
            { to: '/members', label: 'People', icon: <IconUsers />, hint: 'Everyone at ElevateX' },
            { to: '/analytics', label: 'Analytics', icon: <IconChart />, hint: 'Hours and drive scores' },
          ],
        }]
      : []),
    {
      label: 'ElevateX',
      items: [
        ...(!can.isCore ? [{ to: '/members', label: 'Contacts', icon: <IconUsers />, hint: 'Your points of contact' }] : []),
        ...(myDept ? [{ to: `/departments/${myDept.id}`, label: myDept.name, icon: <IconBuilding />, hint: 'Your department' }] : []),
        { to: '/organisation', label: 'Structure', icon: <IconOrg />, hint: 'Leadership, board, departments' },
        { to: '/edpi', label: 'EDPI calculator', icon: <IconCalc />, hint: 'Score a drive' },
      ],
    },
  ];

  /** Phone tab bar: the four things people use most, plus More. */
  const tabs: NavItem[] = [
    { to: '/', label: 'Home', icon: <IconHome /> },
    { to: '/activities', label: 'Drives', icon: <IconCalendar /> },
    { to: '/meetings', label: 'Meetings', icon: <IconVideo /> },
    { to: '/tasks', label: 'Tasks', icon: <IconTask />, count: openTasks },
  ];
  const moreCount = unread + approvals + hr;

  return { sections, tabs, moreCount, unread };
}
