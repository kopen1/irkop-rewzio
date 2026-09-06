export const openapiDocument = {
  openapi: '3.0.3',
  info: { title: 'Rewzio API', version: '0.1.0', description: 'Canonical API contract for Rewzio Android, Admin and backend integrations.' },
  servers: [{ url: '/' }],
  tags: [
    { name: 'auth' }, { name: 'user' }, { name: 'rewards' }, { name: 'missions' }, { name: 'watch' },
    { name: 'ads' }, { name: 'survey' }, { name: 'offerwall' }, { name: 'referral' }, { name: 'lucky' },
    { name: 'spin' }, { name: 'quiz' }, { name: 'game' }, { name: 'wallet' }, { name: 'withdrawal' },
    { name: 'support' }, { name: 'notifications' }, { name: 'admin' }, { name: 'webhook' }, { name: 'payout' }
  ],
  paths: {
    '/api/v1/auth/request-otp': { post: op('auth', 'Request OTP', body(['appId','phone'])) },
    '/api/v1/auth/verify-otp': { post: op('auth', 'Verify OTP', body(['appId','phone','code'])) },
    '/api/v1/auth/google': { post: op('auth', 'Google login', body(['appId','idToken'])) },
    '/api/v1/auth/refresh': { post: op('auth', 'Refresh access token', body(['appId','refreshToken'])) },
    '/api/v1/auth/logout': { post: op('auth', 'Logout', body(['refreshToken'])) },
    '/api/v1/user/me': { get: op('user','Get current user'), patch: op('user','Update current user', body([])) },
    '/api/v1/user/devices': { get: op('user','List devices'), post: op('user','Register device', body(['installationId','platform','appVersion'])) },
    '/api/v1/user/devices/{id}': { delete: op('user','Delete device', undefined, ['id']) },
    '/api/v1/user/sessions': { get: op('user','List sessions') },
    '/api/v1/user/sessions/{id}': { delete: op('user','Revoke session', undefined, ['id']) },
    '/api/v1/user/account': { delete: op('user','Request account deletion', body(['refreshToken','confirmation'])) },
    '/api/v1/rewards': { get: op('rewards','List daily rewards') },
    '/api/v1/missions': { get: op('missions','List missions') },
    '/api/v1/missions/{id}': { get: op('missions','Get mission', undefined, ['id']) },
    '/api/v1/missions/{id}/start': { post: op('missions','Start mission', body([]), ['id']) },
    '/api/v1/missions/{id}/complete': { post: op('missions','Complete mission', body(['idempotencyKey']), ['id']) },
    '/api/v1/rewards/claim': { post: op('rewards','Claim daily reward', body(['idempotencyKey'])) },
    '/api/v1/watch': { get: op('watch','List watch content') },
    '/api/v1/watch/session': { post: op('watch','Start watch session', body(['contentId','idempotencyKey'])) },
    '/api/v1/watch/heartbeat': { post: op('watch','Watch heartbeat', body(['watchSessionId','positionSeconds'])) },
    '/api/v1/watch/complete': { post: op('watch','Complete watch session', body(['watchSessionId','idempotencyKey'])) },
    '/api/v1/ads': { get: op('ads','List ads') },
    '/api/v1/ads/callback': { post: op('webhook','Ads provider callback', body([]), undefined, false) },
    '/api/v1/survey': { get: op('survey','List surveys') },
    '/api/v1/survey/callback': { post: op('webhook','Survey provider callback', body([]), undefined, false) },
    '/api/v1/offerwall': { get: op('offerwall','List offerwalls') },
    '/api/v1/offerwall/callback': { post: op('webhook','Offerwall provider callback', body([]), undefined, false) },
    '/api/v1/referral/apply': { post: op('referral','Apply referral code', body(['code'])) },
    '/api/v1/referral/{id}/qualify': { post: op('referral','Qualify referral', body([]), ['id']) },
    '/api/v1/lucky/play': { post: op('lucky','Play lucky reward', body(['idempotencyKey'])) },
    '/api/v1/spin/play': { post: op('spin','Play spin', body(['idempotencyKey'])) },
    '/api/v1/game/play': { post: op('game','Play game', body(['idempotencyKey'])) },
    '/api/v1/quiz': { get: op('quiz','List quizzes') },
    '/api/v1/quiz/{id}': { get: op('quiz','Get quiz', undefined, ['id']) },
    '/api/v1/quiz/{id}/complete': { post: op('quiz','Complete quiz', body(['answers','idempotencyKey']), ['id']) },
    '/api/v1/wallet': { get: op('wallet','Get wallet') },
    '/api/v1/withdrawals': { get: op('withdrawal','List withdrawals'), post: op('withdrawal','Create withdrawal', body(['methodId','amount','idempotencyKey'])) },
    '/api/v1/withdrawals/{id}': { get: op('withdrawal','Get withdrawal', undefined, ['id']) },
    '/api/v1/withdrawals/history': { get: op('withdrawal','Get withdrawal history') },
    '/api/v1/payouts/{withdrawalId}': { get: op('payout','Get payout', undefined, ['withdrawalId']) },
    '/api/v1/payouts/{withdrawalId}/process': { post: op('payout','Process payout', undefined, ['withdrawalId']) },
    '/api/v1/payouts/reconciliation': { get: op('payout','Reconcile payouts') },
    '/api/v1/webhooks/payout/{provider}': { post: op('webhook','Receive payout provider webhook', body([]), ['provider'], false) },
    '/api/v1/notifications': { get: op('notifications','List notifications') },
    '/api/v1/notifications/{id}/read': { post: op('notifications','Mark notification read', undefined, ['id']) },
    '/api/v1/notifications/preferences': { get: op('notifications','Get notification preferences'), put: op('notifications','Update notification preferences', body([])) },
    '/api/v1/support/categories': { get: op('support','List support categories') },
    '/api/v1/support/tickets': { get: op('support','List support tickets'), post: op('support','Create support ticket', body(['categoryId','subject','body','idempotencyKey'])) },
    '/api/v1/support/tickets/{id}': { get: op('support','Get support ticket', undefined, ['id']) },
    '/api/v1/support/tickets/{id}/reply': { post: op('support','Reply to support ticket', body(['body']), ['id']) },
    '/api/v1/support/tickets/{id}/attachments': { post: op('support','Add attachment metadata', body(['fileName','mimeType','sizeBytes','fileUrl']), ['id']) },
    '/api/v1/support/admin/tickets/{id}/action': { post: op('admin','Admin support action', body(['action','adminUserId']), ['id']) }
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      ApiSuccess: { type: 'object', required: ['success','data','message'], properties: { success: { type:'boolean', enum:[true] }, data: {}, message: { type:['string','null'], default:null } } },
      ApiError: { type:'object', required:['success','error'], properties:{ success:{type:'boolean',enum:[false]}, error:{'$ref':'#/components/schemas/ErrorBody'} } },
      ErrorBody: { type:'object', required:['code','message'], properties:{ code:{type:'string'}, message:{type:'string'} } },
      ErrorCodes: { type:'string', enum:['BAD_REQUEST','UNAUTHORIZED','FORBIDDEN','NOT_FOUND','CONFLICT','VALIDATION_ERROR','RATE_LIMITED','APP_NOT_AUTHORIZED','INVALID_IDEMPOTENCY_KEY','INVALID_WITHDRAWAL','INVALID_WITHDRAWAL_AMOUNT','INSUFFICIENT_BALANCE','WITHDRAWAL_METHOD_NOT_FOUND','WITHDRAWAL_CAPACITY_FULL','FRAUD_REVIEW_REQUIRED','FRAUD_REJECTED','INVALID_WATCH_SESSION','INVALID_HEARTBEAT','INVALID_COMPLETION','REPLAY_DETECTED','WEBHOOK_APP_REQUIRED','INVALID_SIGNATURE','PROVIDER_TIMEOUT','PROVIDER_ERROR','PAYOUT_NOT_FOUND','PAYOUT_CONFLICT','QUIZ_NOT_FOUND','SUPPORT_TICKET_NOT_FOUND','ATTACHMENT_INVALID','INTERNAL_ERROR'] }
    }
  }
} as const;

function body(required: string[]) {
  const properties: Record<string, unknown> = {
    appId:{type:'string'}, phone:{type:'string'}, code:{type:'string'}, idToken:{type:'string'}, refreshToken:{type:'string'},
    installationId:{type:'string'}, platform:{type:'string'}, appVersion:{type:'string'}, confirmation:{type:'string'},
    idempotencyKey:{type:'string',minLength:8,maxLength:255}, contentId:{type:'string'}, deviceId:{type:'string'}, watchSessionId:{type:'string'},
    positionSeconds:{type:'integer',minimum:0}, evidence:{type:'object',additionalProperties:true}, sessionId:{type:'string'},
    answers:{type:'array',items:{type:'string'}}, code:{type:'string'}, methodId:{type:'string'}, amount:{oneOf:[{type:'string',pattern:'^\\d+$'},{type:'integer',minimum:1}]},
    categoryId:{type:'string'}, subject:{type:'string'}, body:{type:'string'}, priority:{type:'string',enum:['LOW','NORMAL','HIGH','URGENT']},
    fileName:{type:'string'}, mimeType:{type:'string'}, sizeBytes:{type:'integer',minimum:0}, fileUrl:{type:'string',format:'uri'}, action:{type:'string'}, adminUserId:{type:'string'}
  };
  return { required, properties, type:'object', additionalProperties:true };
}
function op(tag:string, summary:string, requestBody?:unknown, params?:string[], auth=true) {
  const out: Record<string,unknown> = { tags:[tag], summary, responses:{'200':{'description':'Success','content':{'application/json':{'schema':{'$ref':'#/components/schemas/ApiSuccess'}}}},'400':errorRef,'401':errorRef,'403':errorRef,'404':errorRef,'409':errorRef,'429':errorRef,'500':errorRef} };
  if (auth) out.security=[{bearerAuth:[]}];
  if (requestBody) out.requestBody={required:true,content:{'application/json':{schema:requestBody}}};
  if (params) out.parameters=params.map(name=>({name,in:'path',required:true,schema:{type:'string'}}));
  return out;
}
const errorRef = { description:'Error', content:{'application/json':{schema:{'$ref':'#/components/schemas/ApiError'}}} };
