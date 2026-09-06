import type { Permission, AdminRole } from "../lib/rbac";
export type { Permission, AdminRole } from "../lib/rbac";

const MENU_PERMISSION: Record<string, Permission> = { Users:"users.view", Rewards:"rewards.view", Withdrawals:"withdrawals.view", Payout:"payout.view", "Fraud & Security":"fraud.view", Settings:"settings.view" };
export function menuPermission(section:string): Permission|undefined { return MENU_PERMISSION[section]; }
export function hasPermission(role:AdminRole, permission:Permission|undefined){ return permission ? (role === "ADMIN" || ["users.view","users.edit","users.suspend","withdrawals.view","rewards.view","fraud.view","settings.view","payout.view"].includes(permission)) : true; }
