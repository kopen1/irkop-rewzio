export type AdminRole="ADMIN"|"STAFF";
export const PERMISSIONS=["users.view","users.edit","users.suspend","withdrawals.view","withdrawals.approve","withdrawals.reject","rewards.view","rewards.edit","fraud.view","fraud.action","settings.view","settings.edit","payout.view","payout.action"] as const;
export type Permission=(typeof PERMISSIONS)[number];
