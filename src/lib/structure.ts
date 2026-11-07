/** The ElevateX organisation structure. Seeded on first setup; editable by the Chairman / Vice Chairman. */
import type { Department, Position } from './types';

export const DEPARTMENTS: Department[] = [
  { id: 'finance', name: 'Finance', order: 0, description: 'Budgets, fund allocation, drive spending and receipts.' },
  { id: 'marketing', name: 'Marketing', order: 1, description: 'Instagram, filming and content, campaigns and outreach.' },
  { id: 'hr', name: 'HR', order: 2, description: 'Member satisfaction, feedback and recruitment of new members.' },
  { id: 'project-operations', name: 'Project Operations', order: 3, description: 'Organises fundraisers end to end.' },
  { id: 'drive-execution', name: 'Drive Execution', order: 4, description: 'Plans and runs drives on the ground.' },
];

export const POSITIONS: Position[] = [
  { id: 'chairman', title: 'Chairman', role: 'chairman', departmentId: null, order: 0, responsibilities: ['Overall direction of ElevateX', 'Adds and removes members, assigns positions', 'Calls all-member, core, HOD and board meetings'] },
  { id: 'vice-chairman', title: 'Vice Chairman', role: 'vice_chairman', departmentId: null, order: 1, responsibilities: ['Shares overall direction with the Chairman', 'Adds and removes members, assigns positions', 'Calls all-member, core, HOD and board meetings'] },
  { id: 'ceo', title: 'Chief Executive Officer (CEO)', role: 'executive', departmentId: null, order: 2, responsibilities: ['Runs ElevateX day to day', 'Overall access to every department', 'Calls core team and all-member meetings'] },
  { id: 'coo', title: 'Chief Operating Officer (COO)', role: 'executive', departmentId: null, order: 3, responsibilities: ['Oversees execution across departments', 'Overall access to every department', 'Calls core team and all-member meetings'] },
  { id: 'board-advisor', title: 'Board of Advisors', role: 'board', departmentId: null, order: 4, responsibilities: ['Advises on strategy and continuity', 'Can call board meetings', 'Full view of the organisation'] },
  { id: 'cfo', title: 'Chief Financial Officer (CFO)', role: 'hod', departmentId: 'finance', order: 5, responsibilities: ['Heads the Finance department', 'Approves budgets and spending', 'Assigns tasks to Finance members'] },
  { id: 'cmo', title: 'Chief Marketing Officer (CMO)', role: 'hod', departmentId: 'marketing', order: 6, responsibilities: ['Heads the Marketing department', 'Instagram, filming and campaigns', 'Assigns tasks to Marketing members'] },
  { id: 'head-hr', title: 'Head of HR', role: 'hod', departmentId: 'hr', order: 7, responsibilities: ['Heads the HR department', 'Reviews member feedback and satisfaction', 'Leads recruitment of new members'] },
  { id: 'head-project-operations', title: 'Head of Project Operations', role: 'hod', departmentId: 'project-operations', order: 8, responsibilities: ['Heads Project Operations', 'Creates and runs fundraisers', 'Assigns tasks to Project Operations members'] },
  { id: 'head-drive-execution', title: 'Head of Drive Execution', role: 'hod', departmentId: 'drive-execution', order: 9, responsibilities: ['Heads Drive Execution', 'Creates drives and drive meetings', 'Assigns tasks to Drive Execution members'] },
  { id: 'member', title: 'Member', role: 'member', departmentId: null, order: 10, responsibilities: ['Volunteer in drives and fundraisers', 'Complete tasks from your department head', 'Log your hours honestly'] },
];

/** Maximum Heads per department. */
export const MAX_HODS = 2;

/** v1 starter structure, removed on migration. */
export const LEGACY_DEPARTMENTS = ['leadership', 'operations', 'projects', 'outreach'];
export const LEGACY_POSITIONS = ['president', 'head-finance', 'head-operations', 'project-head', 'head-outreach', 'general-member'];
