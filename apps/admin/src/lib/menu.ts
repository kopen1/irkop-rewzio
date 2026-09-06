import type { Permission, AdminRole } from "./rbac-types";
export type { Permission, AdminRole } from "./rbac-types";
const STAFF_PERMISSIONS: Permission[]=["users.view","users.edit","users.suspend","withdrawals.view","rewards.view","fraud.view","settings.view","payout.view"];
const MENU_PERMISSION: Record<string,Permission>={Users:"users.view",Rewards:"rewards.view",Withdrawals:"withdrawals.view",Payout:"payout.view","Fraud & Security":"fraud.view",Settings:"settings.view"};
export function menuPermission(section:string){return MENU_PERMISSION[section];}
export function can(role:AdminRole,permission:Permission){return role==="ADMIN"||STAFF_PERMISSIONS.includes(permission);}
export const hasPermission=(role:AdminRole,permission?:Permission)=>permission?can(role,permission):true;
