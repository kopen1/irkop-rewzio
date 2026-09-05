export type UserRole = 'USER' | 'ADMIN' | 'STAFF';

export type Currency = 'IDR';

export interface ApiError {
  code: string;
  message: string;
}
