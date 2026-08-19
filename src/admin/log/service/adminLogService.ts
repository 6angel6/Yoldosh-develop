import { Request } from 'express';
import logger from '../../../../shared/utils/logger';
import Admin from '../../auth/models/Admin';
import AdminLog, {
   AdminAction,
   AdminLogEntityType,
   EntitySnapshot,
   getActionCategory,
} from '../models/AdminLog';
import * as adminLogRepository from '../repository/adminLogRepository';

/**
 * Расширенный контекст лога. Передаётся опционально — старые вызовы продолжают
 * работать с позиционными аргументами через legacy-обёртку logAction.
 */
export interface LogActionInput {
   adminId: string;
   action: AdminAction;
   details?: string;
   entity?: {
      id?: string;
      type?: AdminLogEntityType | string;
      snapshot?: EntitySnapshot;
   };
   metadata?: Record<string, unknown>;
   request?: Pick<Request, 'ip' | 'headers' | 'admin'> | null;
   sessionId?: string;
}

const extractRequestMeta = (req?: LogActionInput['request']) => {
   if (!req) return { ipAddress: undefined, userAgent: undefined };
   const fwd = (req.headers?.['x-forwarded-for'] as string | undefined)
      ?.split(',')[0]
      ?.trim();
   const ipAddress = (fwd || req.ip || '').toString().slice(0, 64) || undefined;
   const ua = (req.headers?.['user-agent'] as string | undefined)?.slice(
      0,
      512,
   );
   return { ipAddress, userAgent: ua };
};

export const log = async (input: LogActionInput): Promise<AdminLog | null> => {
   try {
      const admin = await Admin.findByPk(input.adminId, {
         attributes: ['id', 'firstName', 'lastName', 'email'],
      });
      const adminName = admin
         ? [admin.firstName, admin.lastName].filter(Boolean).join(' ').trim() ||
           admin.email
         : undefined;

      const { ipAddress, userAgent } = extractRequestMeta(input.request);

      return await adminLogRepository.createLog({
         adminId: input.adminId,
         action: input.action,
         category: getActionCategory(input.action),
         adminName,
         details: input.details,
         relatedEntityId: input.entity?.id,
         relatedEntityType: input.entity?.type,
         entitySnapshot: input.entity?.snapshot,
         metadata: input.metadata,
         ipAddress,
         userAgent,
         sessionId: input.sessionId,
      });
   } catch (error) {
      logger.error(
         { err: error, action: input.action },
         'Failed to log admin action',
      );
      return null;
   }
};

/**
 * Backward-compatible сигнатура. Старые сервисы продолжают звать
 *   logAction(adminId, action, details, entityId, entityType)
 * без изменений; новые места могут передавать extra { snapshot, metadata, request }.
 */
export const logAction = async (
   adminId: string,
   action: AdminAction,
   details?: string,
   relatedEntityId?: string,
   relatedEntityType?: AdminLogEntityType | string,
   extra?: {
      snapshot?: EntitySnapshot;
      metadata?: Record<string, unknown>;
      request?: LogActionInput['request'];
      sessionId?: string;
   },
): Promise<AdminLog | null> => {
   return log({
      adminId,
      action,
      details,
      entity: {
         id: relatedEntityId,
         type: relatedEntityType,
         snapshot: extra?.snapshot,
      },
      metadata: extra?.metadata,
      request: extra?.request,
      sessionId: extra?.sessionId,
   });
};
