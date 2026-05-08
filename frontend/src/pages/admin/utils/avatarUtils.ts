export const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

export function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
}

export function avatarBg(idx: number): string {
  return AVATAR_COLORS[idx % AVATAR_COLORS.length];
}
