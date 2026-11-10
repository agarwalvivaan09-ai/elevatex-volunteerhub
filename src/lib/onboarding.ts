/** The new-member checklist. Some items tick themselves; the rest the member ticks. */
import type { Activity, Participation, UserProfile } from './types';

export interface OnboardingItem { key: string; label: string; hint: string; link?: string; auto?: boolean }

export const ONBOARDING: OnboardingItem[] = [
  { key: 'password', label: 'Set your password', hint: 'Done when you first signed in.', auto: true },
  { key: 'profile', label: 'Add your phone and emergency contact', hint: 'Only you and the core team can see them.', link: '/profile' },
  { key: 'whatsapp', label: 'Join the ElevateX WhatsApp community', hint: 'Drives and events are announced there too.', link: 'https://chat.whatsapp.com/F1YwvNztn4LJTFXM8NR43r?mode=hqctcli' },
  { key: 'head', label: 'Say hello to your department head', hint: 'They are your first point of contact.', link: '/members' },
  { key: 'docs', label: 'Read the documents in the library', hint: 'Brochure, guides and how things work.', link: '/documents' },
  { key: 'drive', label: 'Volunteer for your first drive', hint: 'Ticks itself when you sign up.', link: '/activities', auto: true },
  { key: 'meeting', label: 'Attend your first meeting', hint: 'Ticks itself when the host marks you present.', link: '/meetings', auto: true },
];

export const ONBOARDING_DAYS = 45;

export function onboardingState(u: UserProfile, parts: Participation[], activityById: Map<string, Activity>) {
  const mine = parts.filter((p) => p.uid === u.id);
  const ticks = u.onboarding ?? {};
  const done: Record<string, boolean> = {
    ...ticks,
    password: true,
    drive: ticks.drive || mine.some((p) => activityById.get(p.activityId)?.type !== 'meeting' && p.status !== 'rejected'),
    meeting: ticks.meeting || mine.some((p) => activityById.get(p.activityId)?.type === 'meeting' && p.attendance === 'present'),
  };
  const count = ONBOARDING.filter((i) => done[i.key]).length;
  const isNew = !!u.joinedAt && Date.now() - u.joinedAt.getTime() < ONBOARDING_DAYS * 86400000;
  return { done, count, total: ONBOARDING.length, complete: count === ONBOARDING.length, dismissed: !!ticks.dismissed, isNew };
}
