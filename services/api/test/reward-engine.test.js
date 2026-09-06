import test from 'node:test';
import assert from 'node:assert/strict';
import { RewardEngine } from '../dist/modules/rewards/engine.js';

class FakeRedis { constructor(){this.count=0;} async incrementWithExpiry(){return ++this.count;} }
function makeDb(fraudOverrides={}){
  const state={
    user:{id:'u1',status:'ACTIVE'}, session:{id:'s1',userId:'u1',appId:'app1',deviceId:'d1',status:'ACTIVE',expiresAt:new Date(Date.now()+60000),ipAddress:'10.0.0.1'},
    userApp:{appId:'app1',userId:'u1',status:'ACTIVE'}, device:{id:'d1',appId:'app1',userId:'u1',status:'ACTIVE',integrityStatus:'VERIFIED',riskScore:fraudOverrides.deviceRiskScore ?? 0},
    reward:{id:'rw1',appId:'app1',sourceType:'ads',sourceId:'ad1',amount:50n,status:'CONFIRMED',createdAt:new Date()}, redemption:null, account:{id:'ca1',appId:'app1',userId:'u1',balance:0n,version:0n}, ledger:[],
  };
  const api={
    users:{findUnique:async()=>state.user},
    userSessions:{findUnique:async()=>state.session,count:async()=>fraudOverrides.sessions ?? 1,findMany:async()=>Array.from({length:fraudOverrides.ipUsers ?? 1},(_,i)=>({userId:`u${i}`}))},
    userApps:{findUnique:async()=>state.userApp}, userDevices:{findUnique:async()=>state.device},
    rewards:{findFirst:async()=>state.reward},
    rewardRedemptions:{findUnique:async({where})=>where.idempotencyKey===state.redemption?.idempotencyKey?state.redemption:null,create:async({data})=>{state.redemption={id:`red-${state.ledger.length+1}`,...data};return state.redemption;},update:async({where,data})=>{Object.assign(state.redemption,data);return state.redemption;},count:async({where})=>where.createdAt?.gte && (Date.now()-where.createdAt.gte.getTime() > 23*60*60*1000 ? (fraudOverrides.rewardsDay ?? 0) : (fraudOverrides.rewardsHour ?? 0)),findMany:async()=>fraudOverrides.recentRewards ?? []},
    withdrawals:{count:async()=>fraudOverrides.withdrawals ?? 0}, referrals:{findMany:async()=>fraudOverrides.referrals ?? []}, deviceRelationships:{count:async()=>fraudOverrides.relationships ?? 0,upsert:async()=>({})},
    fraudScores:{create:async({data})=>({id:'fs1',...data})}, fraudEvents:{create:async({data})=>({id:'fe1',...data})}, riskSignals:{createMany:async({data})=>({count:data.length})}, securityActions:{create:async({data})=>({id:'sa1',...data})}, rewardHolds:{create:async({data})=>({id:'rh1',...data})},
    coinAccounts:{findUnique:async()=>state.account,upsert:async({create})=>state.account??=create,update:async({data})=>{Object.assign(state.account,data);return state.account;}},
    coinLedger:{findUnique:async({where})=>state.ledger.find(x=>x.idempotencyKey===where.appId_idempotencyKey.idempotencyKey)??null,findFirst:async({where})=>state.ledger.find(x=>x.appId===where.appId&&x.referenceId===where.referenceId)??null,create:async({data})=>{const x={id:`led-${state.ledger.length+1}`,...data};state.ledger.push(x);return x;}},
    $queryRaw:async()=>[{id:state.account.id,balance:state.account.balance,version:state.account.version}],
  };
  api.$transaction=async fn=>fn(api);
  return {api,state};
}
function req(extra={}){return {userId:'u1',appId:'app1',sessionId:'s1',sourceType:'ads',sourceId:'ad1',idempotencyKey:'idem-123456',...extra};}

test('reward amount is calculated from backend reward config, not client input',async()=>{const {api,state}=makeDb();const engine=new RewardEngine(api,new FakeRedis());const result=await engine.grant(req({metadata:{clientAmount:999999}}));assert.equal(result.amount,50n);assert.equal(state.account.balance,50n);assert.equal(state.ledger[0].amount,50n);});
test('duplicate/replay returns the original confirmed reward',async()=>{const {api}=makeDb();const engine=new RewardEngine(api,new FakeRedis());const first=await engine.grant(req());const second=await engine.grant(req());assert.equal(second.replayed,true);assert.equal(second.ledgerId,first.ledgerId);assert.equal(second.amount,50n);});
test('idempotency key cannot be reused for another user',async()=>{const {api}=makeDb();const engine=new RewardEngine(api,new FakeRedis());await engine.grant(req());await assert.rejects(()=>engine.grant(req({userId:'u2'})),/different reward/);});
test('integrity and fraud controls reject unsafe device',async()=>{const {api,state}=makeDb();state.device.integrityStatus='FAILED';const engine=new RewardEngine(api,new FakeRedis());await assert.rejects(()=>engine.grant(req()),/integrity check failed/);state.device.integrityStatus='VERIFIED';const highRisk={deviceRiskScore:100,rewardsHour:20,rewardsDay:100,withdrawals:10,ipUsers:10,relationships:3,referrals:[{status:'REJECTED'},{status:'REJECTED'},{status:'REJECTED'}]};const highDb=makeDb(highRisk);const highEngine=new RewardEngine(highDb.api,new FakeRedis());await assert.rejects(()=>highEngine.grant(req({idempotencyKey:'idem-223456'})),/fraud controls/);});
test('rate limit rejects excessive reward requests',async()=>{const {api}=makeDb();const redis=new FakeRedis();const engine=new RewardEngine(api,redis);redis.count=30;await assert.rejects(()=>engine.grant(req()),/rate limit exceeded/);});
test('concurrent same-key requests create one redemption and one ledger',async()=>{const {api,state}=makeDb();let locked=Promise.resolve();api.$transaction=async fn=>{const previous=locked;let release;locked=new Promise(r=>{release=r});await previous;try{return await fn(api);}finally{release();}};const engine=new RewardEngine(api,new FakeRedis());const results=await Promise.allSettled([engine.grant(req()),engine.grant(req())]);const fulfilled=results.filter(x=>x.status==='fulfilled');const rejected=results.filter(x=>x.status==='rejected');assert.equal(fulfilled.length,1);assert.equal(rejected.length,1);assert.equal(state.ledger.length,1);assert.equal(state.redemption.status,'CONFIRMED');assert.equal(state.account.balance,50n);});
test('unsupported reward source is rejected',async()=>{const {api}=makeDb();const engine=new RewardEngine(api,new FakeRedis());await assert.rejects(()=>engine.grant(req({sourceType:'unknown'})),/Unsupported reward source/);});
