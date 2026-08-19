import logger from '../../utils/logger';
import { Request, Response } from 'express';
import * as paynetService from '../../../src/payment/service/paynetService';
import { PaynetError } from '../../utils/errorHandler';

interface PaynetRequest {
   jsonrpc: '2.0';
   method:
      | 'GetInformation'
      | 'PerformTransaction'
      | 'CheckTransaction'
      | 'CancelTransaction'
      | 'GetStatement';
   id: number | string;
   params: any;
}

export const handlePaynetRequest = async (req: Request, res: Response) => {
   const rpcRequest = req.body as PaynetRequest;
   const responseId = rpcRequest?.id || null;
   logger.info({ paynetRequest: rpcRequest }, 'Received request from Paynet');

   try {
      let result;

      switch (rpcRequest.method) {
         case 'GetInformation':
            result = await paynetService.getInformation(rpcRequest.params);
            break;
         case 'PerformTransaction':
            result = await paynetService.performTransaction(rpcRequest.params);
            break;
         case 'CheckTransaction':
            result = await paynetService.checkTransaction(rpcRequest.params);
            break;
         case 'CancelTransaction':
            result = await paynetService.cancelTransaction(rpcRequest.params);
            break;
         case 'GetStatement':
            result = await paynetService.getStatement(rpcRequest.params);
            break;
         default:
            throw new PaynetError('Method not found', -32601);
      }

      return res.json({
         jsonrpc: '2.0',
         id: rpcRequest.id,
         result: result,
      });
   } catch (error) {
      logger.error(
         {
            err: error,
            rpcRequest,
            method: rpcRequest?.method,
            stack: error instanceof Error ? error.stack : undefined,
         },
         'Error processing Paynet RPC request',
      );
      const code = error instanceof PaynetError ? error.code : -32603;
      const message =
         error instanceof Error ? error.message : 'Internal server error';

      return res.json({
         jsonrpc: '2.0',
         id: responseId,
         error: {
            code: code,
            message: message,
         },
      });
   }
};
