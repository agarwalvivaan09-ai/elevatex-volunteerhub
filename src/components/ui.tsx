import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { IconX } from './icons';
import type { Activity, HoursStatus, Participation, ParticipationStatus } from '../lib/types';
import { PARTICIPATION_LABEL, TYPE_LABEL } from '../lib/types';

// ---------------------------------------------------------------- toasts
type Toast = { id: number; text: string; kind: 'ok' | 'error' };
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'error') => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Turns Firebase errors into sentences a non-technical volunteer can act on. */
export function friendlyError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'permission-denied': "You don't have permission to do that. If you think you should, ask the Admin.",
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'Email or password is incorrect.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/network-request-failed': 'No internet connection. Check your network and try again.',
    'auth/popup-closed-by-user': 'Sign-in window was closed.',
    unavailable: 'Cannot reach the server right now. Check your connection.',
  };
  if (map[code]) return map[code];
  if (e instanceof Error && e.message && !e.message.startsWith('Firebase')) return e.message;
  return 'Something went wrong. Please try again.';
}

/** Wraps an async action with busy state + toasts. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (fn: () => Promise<unknown>, success?: string) => {
      setBusy(true);
      try {
        await fn();
        if (success) toast(success);
        return true;
      } catch (e) {
        console.error(e);
        toast(friendlyError(e), 'error');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { busy, run };
}

// ---------------------------------------------------------------- modal
export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><IconX /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose }: { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => Promise<unknown> | void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try { await onConfirm(); onClose(); } finally { setBusy(false); }
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="muted">{message}</div>
    </Modal>
  );
}

// ---------------------------------------------------------------- bits
export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className ?? ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <b>{title}</b>
      {children}
    </div>
  );
}

export function Avatar({ name, size }: { name: string; size?: 'sm' | 'lg' }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
  return <span className={`avatar ${size ?? ''}`} aria-hidden="true">{initials}</span>;
}

export function Loading() {
  return <div className="loading-page"><div className="spinner" aria-label="Loading" /></div>;
}

const statusTone: Record<ParticipationStatus, string> = { requested: 'warn', approved: 'ok', deferred: 'info', rejected: 'bad' };
export function RequestBadge({ status }: { status: ParticipationStatus }) {
  return <span className={`badge ${statusTone[status]}`}>{PARTICIPATION_LABEL[status]}</span>;
}

const hoursTone: Record<HoursStatus, string> = { none: '', pending: 'warn', verified: 'ok', rejected: 'bad' };
const hoursText: Record<HoursStatus, string> = { none: 'Not logged', pending: 'Awaiting verification', verified: 'Verified', rejected: 'Not accepted' };
export function HoursBadge({ p }: { p: Participation }) {
  return <span className={`badge ${hoursTone[p.hoursStatus]}`}>{hoursText[p.hoursStatus]}</span>;
}

export function AttendanceBadge({ p }: { p: Participation }) {
  if (p.attendance === 'present') return <span className="badge ok">Present</span>;
  if (p.attendance === 'absent') return <span className="badge bad">Absent</span>;
  return <span className="badge">Not marked</span>;
}

const typeTone: Record<Activity['type'], string> = { drive: 'brand', fundraiser: 'brown', event: 'info', meeting: '' };
export function TypeBadge({ type }: { type: Activity['type'] }) {
  return <span className={`badge plain ${typeTone[type]}`}>{TYPE_LABEL[type]}</span>;
}

export function ActivityStatusBadge({ a }: { a: Activity }) {
  if (a.status === 'proposed') return <span className="badge warn">Awaiting approval</span>;
  if (a.status === 'declined') return <span className="badge bad">Not approved</span>;
  if (a.status === 'completed') return <span className="badge ok">Completed</span>;
  if (a.status === 'cancelled') return <span className="badge bad">Cancelled</span>;
  return <span className="badge info">Upcoming</span>;
}
