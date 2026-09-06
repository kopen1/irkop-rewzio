import type { Prisma, PrismaClient } from '@prisma/client';

export interface MalwareScanner { scan(input: { mimeType: string; sizeBytes: number; fileName: string }): Promise<{ clean: boolean; reason?: string }>; }
export class MockMalwareScanner implements MalwareScanner { async scan(_input: { mimeType: string; sizeBytes: number; fileName: string }) { return { clean: true }; } }

const MAX_ATTACHMENT = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain']);
type Tx = Prisma.TransactionClient;

export class SupportService {
  constructor(private readonly db: PrismaClient, private readonly scanner: MalwareScanner = new MockMalwareScanner()) {}
  async categories(appId: string): Promise<unknown> { return this.db.supportCategories.findMany({ where: { appId, status: 'ACTIVE' }, orderBy: { name: 'asc' } }); }
  async listTickets(appId: string, userId: string): Promise<unknown> { return this.db.supportTickets.findMany({ where: { appId, userId }, orderBy: { updatedAt: 'desc' }, take: 100 }); }
  async getTicket(appId: string, userId: string, ticketId: string, admin = false): Promise<unknown> {
    const ticket = await this.db.supportTickets.findFirst({ where: { appId, id: ticketId, ...(admin ? {} : { userId }) } });
    if (!ticket) throw error(404, 'SUPPORT_TICKET_NOT_FOUND', 'Support ticket not found');
    const [messages, attachments, actions] = await Promise.all([this.db.supportMessages.findMany({ where: { appId, ticketId }, orderBy: { createdAt: 'asc' } }), this.db.supportAttachments.findMany({ where: { appId, ticketId }, orderBy: { createdAt: 'asc' } }), admin ? this.db.supportActions.findMany({ where: { appId, ticketId }, orderBy: { createdAt: 'desc' } }) : Promise.resolve([])]);
    return { ticket, messages, attachments, actions };
  }
  async createTicket(input: { appId: string; userId: string; categoryId: string; subject: string; body: string; priority?: 'LOW'|'NORMAL'|'HIGH'|'URGENT'; idempotencyKey: string }): Promise<unknown> {
    validateKey(input.idempotencyKey);
    const existing = await this.db.supportTickets.findFirst({ where: { appId: input.appId, userId: input.userId, subject: input.subject.trim().slice(0, 160) } });
    if (existing) return existing;
    const category = await this.db.supportCategories.findFirst({ where: { appId: input.appId, id: input.categoryId, status: 'ACTIVE' } });
    if (!category) throw error(400, 'INVALID_SUPPORT_CATEGORY', 'Support category is not active');
    return this.db.$transaction(async (tx: Tx) => {
      const created = await tx.supportTickets.create({ data: { appId: input.appId, userId: input.userId, categoryId: input.categoryId, subject: input.subject.trim().slice(0, 160), status: 'OPEN', priority: input.priority ?? 'NORMAL' } });
      await tx.supportMessages.create({ data: { appId: input.appId, ticketId: created.id, senderUserId: input.userId, body: input.body.trim().slice(0, 10000), isInternal: false } });
      await tx.supportActions.create({ data: { appId: input.appId, ticketId: created.id, action: 'CREATED', reason: 'User created support ticket', metadata: { idempotencyKey: input.idempotencyKey } } });
      return created;
    });
  }
  async reply(input: { appId: string; userId: string; ticketId: string; body: string; admin?: boolean }): Promise<unknown> {
    const ticket = await this.db.supportTickets.findFirst({ where: { appId: input.appId, id: input.ticketId, ...(input.admin ? {} : { userId: input.userId }) } });
    if (!ticket) throw error(404, 'SUPPORT_TICKET_NOT_FOUND', 'Support ticket not found');
    if (ticket.status === 'CLOSED') throw error(409, 'SUPPORT_TICKET_CLOSED', 'Support ticket is closed');
    return this.db.supportMessages.create({ data: { appId: input.appId, ticketId: ticket.id, senderUserId: input.admin ? undefined : input.userId, senderAdminId: input.admin ? input.userId : undefined, body: input.body.trim().slice(0, 10000), isInternal: Boolean(input.admin) } });
  }
  async adminAction(input: { appId: string; adminUserId: string; ticketId: string; action: string; reason?: string; status?: 'OPEN'|'IN_PROGRESS'|'WAITING_USER'|'WAITING_PROVIDER'|'RESOLVED'|'CLOSED'; priority?: 'LOW'|'NORMAL'|'HIGH'|'URGENT' }): Promise<unknown> {
    await this.requireAdmin(input.adminUserId);
    const ticket = await this.db.supportTickets.findFirst({ where: { appId: input.appId, id: input.ticketId } });
    if (!ticket) throw error(404, 'SUPPORT_TICKET_NOT_FOUND', 'Support ticket not found');
    return this.db.$transaction(async (tx: Tx) => {
      const updated = await tx.supportTickets.update({ where: { id: ticket.id }, data: { status: input.status, priority: input.priority, resolvedAt: input.status === 'RESOLVED' || input.status === 'CLOSED' ? new Date() : undefined } });
      await tx.supportActions.create({ data: { appId: input.appId, ticketId: ticket.id, adminUserId: input.adminUserId, action: input.action.slice(0, 100), reason: input.reason?.slice(0, 1000) } });
      return updated;
    });
  }
  async addAttachment(input: { appId: string; userId: string; ticketId: string; messageId?: string; fileName: string; mimeType: string; sizeBytes: number; fileUrl: string }): Promise<unknown> {
    const ticket = await this.db.supportTickets.findFirst({ where: { appId: input.appId, id: input.ticketId, userId: input.userId } });
    if (!ticket) throw error(404, 'SUPPORT_TICKET_NOT_FOUND', 'Support ticket not found');
    validateAttachment(input.fileName, input.mimeType, input.sizeBytes, input.fileUrl);
    if (input.messageId) { const message = await this.db.supportMessages.findFirst({ where: { appId: input.appId, id: input.messageId, ticketId: input.ticketId } }); if (!message) throw error(404, 'SUPPORT_MESSAGE_NOT_FOUND', 'Support message not found'); }
    const scan = await this.scanner.scan({ mimeType: input.mimeType, sizeBytes: input.sizeBytes, fileName: input.fileName });
    if (!scan.clean) throw error(400, 'MALWARE_DETECTED', scan.reason ?? 'Attachment rejected by malware scanner');
    return this.db.supportAttachments.create({ data: { appId: input.appId, ticketId: input.ticketId, messageId: input.messageId, fileUrl: input.fileUrl, mimeType: input.mimeType, sizeBytes: BigInt(input.sizeBytes) } });
  }
  async requireAdmin(adminUserId: string): Promise<void> { const admin = await this.db.adminUsers.findFirst({ where: { id: adminUserId, status: 'ACTIVE' } }); if (!admin) throw error(403, 'ADMIN_REQUIRED', 'Admin authorization required'); }
}
function validateKey(key: string) { if (!key || key.length < 8 || key.length > 255) throw error(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency key must be 8-255 characters'); }
function validateAttachment(fileName: string, mimeType: string, sizeBytes: number, fileUrl: string) { if (!fileName || fileName.length > 255 || fileName.includes('..') || /[\\/]/.test(fileName) || fileName.includes('\0')) throw error(400, 'INVALID_FILE_NAME', 'Invalid attachment file name'); if (!ALLOWED_MIME.has(mimeType)) throw error(400, 'UNSUPPORTED_FILE_TYPE', 'Unsupported attachment type'); if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_ATTACHMENT) throw error(400, 'FILE_TOO_LARGE', 'Attachment exceeds the 10 MB limit'); if (!/^https:\/\//i.test(fileUrl)) throw error(400, 'INVALID_FILE_URL', 'Attachment storage URL must use HTTPS'); }
function error(statusCode: number, code: string, message: string): Error & { statusCode: number; code: string } { const e = new Error(message) as Error & { statusCode: number; code: string }; e.statusCode = statusCode; e.code = code; return e; }
