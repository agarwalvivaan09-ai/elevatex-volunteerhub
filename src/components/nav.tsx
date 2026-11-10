import type { ReactElement } from 'react';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { readSet } from '../pages/Announcements';
import { pollIsOpen } from '../pages/Polls';
import {
  IconLink, IconMegaphone,
  IconBell, IconBuilding, IconCalc, IconCalendar, IconChart, IconChat, IconClock, IconHome, IconInbox, IconOrg, IconTask, IconUser, IconUsers, IconVideo,
} from './icons';

export const SITE_URL = 'https://elevate-x.in';

export interface NavItem { to: string; label: string; icon: ReactElement; count?: number; hint?: string }
export interface NavSection { label: string | null; items: NavItem[] }

/** One definition of the app's navigation, used by the sidebar, the phone tab bar and the More page. */
export function useNav() {
  const { profile, can } = useMe();
  const { notifications, tasks, activities, announcements, polls, applications, feedback, deptRequests, certRequests, departmentById } = useData();

  const unread = notifications.filter((n) => !n.read).length;
  const openTasks = tasks.filter((t) => t.assigneeUid === profile.id && t.status !== 'done').length;
  const approvals = can.isCore ? activities.filter((a) => a.status === 'proposed' && can.canApproveDrive(a)).length : 0;
  const hr = can.canSeeFeedback
    ? feedback.filter((f) => f.status === 'new').length + deptRequests.filter((r) => r.status === 'pending').length + certRequests.filter((r) => r.status === 'pending' && r.uid !== profile.id).length
    : 0;
  const seen = readSet();
  const newAnnouncements = announcements.filter((a) => a.createdBy !== profile.id && !seen.has(a.id)).length;
  const openPolls = polls.filter(pollIsOpen).length;
  const newApplications = applications.filter((a) => a.status === 'new').length;
  const myDept = profile.departmentId ? departmentById.get(profile.departmentId) : undefined;

  const sections: NavSection[] = [
    {
      label: null,
      items: [
        { to: '/', label: 'Home', icon: <IconHome /> },
        { to: '/notifications', label: 'Notifications', icon: <IconBell />, count: unread },
        { to: '/announcements', label: 'Announcements', icon: <IconMegaphone />, count: newAnnouncements, hint: 'News from leadership and your head' },
        { to: '/activities', label: 'Drives & fundraisers', icon: <IconCalendar />, hint: 'Volunteer or propose a drive' },
        { to: '/meetings', label: 'Meetings', icon: <IconVideo />, hint: 'Join online meetings' },
        { to: '/tasks', label: 'Tasks', icon: <IconTask />, count: openTasks, hint: 'Work from your department head' },
        { to: '/polls', label: 'Polls', icon: <IconChart />, count: openPolls, hint: 'Vote on decisions' },
      ],
    },
    {
      label: 'You',
      items: [
        { to: '/contributions', label: 'My credits', icon: <IconClock />, hint: 'Credits and history' },
        { to: '/hr', label: 'HR', icon: <IconChat />, count: hr, hint: can.canSeeFeedback ? 'Feedback, certificates, department requests' : 'Certificates, feedback, change department' },
        { to: '/profile', label: 'My profile', icon: <IconUser /> },
      ],
    },
    ...(can.isCore
      ? [{
          label: 'Core team',
          items: [
            { to: '/review', label: 'Approvals', icon: <IconInbox />, count: approvals, hint: 'Drive proposals' },
            { to: '/members', label: 'People', icon: <IconUsers />, hint: 'Everyone at ElevateX' },
            ...(can.canSeeFeedback ? [{ to: '/applications', label: 'Applications', icon: <IconInbox />, count: newApplications, hint: 'People who applied on elevate-x.in' }] : []),
            { to: '/analytics', label: 'Analytics', icon: <IconChart />, hint: 'Credits and drive scores' },
            { to: '/report', label: 'Monthly report', icon: <IconCalendar />, hint: 'Print-ready summary of a month' },
            ...(can.canRecordPast ? [{ to: '/record', label: 'Record past activity', icon: <IconClock />, hint: 'Add past drives, events and credits' }] : []),
            ...(can.isLeadership ? [{ to: '/history', label: 'Change history', icon: <IconOrg />, hint: 'Who changed what' }] : []),
          ],
        }]
      : []),
    {
      label: 'ElevateX',
      items: [
        ...(!can.isCore ? [{ to: '/members', label: 'Contacts', icon: <IconUsers />, hint: 'Your points of contact' }] : []),
        ...(myDept ? [{ to: `/departments/${myDept.id}`, label: myDept.name, icon: <IconBuilding />, hint: 'Your department' }] : []),
        { to: '/documents', label: 'Documents', icon: <IconLink />, hint: 'Brochures, templates, guides' },
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
  const moreCount = unread + approvals + hr + newAnnouncements + openPolls + newApplications;

  return { sections, tabs, moreCount, unread };
}
