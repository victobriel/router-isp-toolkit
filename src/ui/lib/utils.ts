import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

export function val(v: string | boolean | undefined | null): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'boolean') return v ? 'Enabled' : 'Disabled';
  return String(v);
}
