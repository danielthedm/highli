export interface TargetUser {
  name: string;
  email: string;
  github?: { username: string };
  linear?: { userId: string; displayName: string };
  slack?: { userId: string };
  notion?: { userId: string };
}

let _targetUser: TargetUser | null = null;

export function getTargetUser(): TargetUser | null {
  return _targetUser;
}

export function setTargetUser(user: TargetUser | null): void {
  _targetUser = user;
}
