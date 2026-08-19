import { IPAK_YULI_TOKEN, IPAK_YULI_URL } from './ipakConfig';
import axios from 'axios';
import logger from '../../utils/logger';
import { handleError } from '../../config/lib';
import { Request, Response } from 'express';
import {
   JsonRpcRequest,
   JsonRpcResponse,
   ContractCreateRequestParams,
   ContractGetRequestParams,
   IpakResultWrapper,
   ContractCreateResultData,
   ContractGetResultData,
   PaymentPayRequestParams,
   PaymentPayResultData,
   PaymentGetRequestParams,
   PaymentGetResultData,
   PaymentCancelRequestParams,
   PaymentCancelResultData,
   ContractCancelRequestParams,
   ContractCancelResultData,
   OfdInfo,
} from './dto/ipakDto';
import { ipakCallbackSchema } from './dto/callBackRequest';
import {
   BadRequestError,
   ServiceUnavailableError,
} from '../../utils/errorHandler';
import { ErrorCode } from '../../utils/errorCodes';
import { measureExternalCall } from '../../utils/appMetrics';
import * as userCardService from '../../../src/payment/service/userCardService';
import * as paymentService from '../../../src/payment/service/paymentService';
import * as https from 'https';
const API_URL = `${IPAK_YULI_URL}/tokenized-contract`;

const createRpcBody = <T>(method: string, params: T): JsonRpcRequest<T> => ({
   jsonrpc: '2.0',
   method,
   id: crypto.randomUUID(),
   params,
});

const httpsAgent = new https.Agent({
   rejectUnauthorized: false,
   keepAlive: true,
});

// Платёжный RPC: без таймаута зависший банк держит запрос бесконечно.
// 15с — с запасом на медленные операции; таймаут не означает, что платёж
// не прошёл на стороне банка, поэтому статус потом сверяется через payment_get.
const IPAK_TIMEOUT_MS = 15_000;

async function sendRpcRequest<TParams, TResult>(
   method: string,
   params: TParams,
   logContext: string,
): Promise<TResult> {
   const requestBody = createRpcBody(method, params);

   try {
      logger.info(
         { url: API_URL, method, params },
         `${logContext}: Request sent`,
      );

      const response = await measureExternalCall('ipak', () =>
         axios.post<JsonRpcResponse<IpakResultWrapper<TResult>>>(
            API_URL,
            requestBody,
            {
               headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${IPAK_YULI_TOKEN}`,
               },
               httpsAgent: httpsAgent,
               timeout: IPAK_TIMEOUT_MS,
            },
         ),
      );

      const { data: responseBody } = response;

      if (responseBody.error) {
         logger.error(
            { apiError: responseBody.error, method },
            `${logContext}: API returned error`,
         );

         const errorMsg = responseBody.error.message || '';
         // Ошибка уровня API банка — бизнес-кейс (невалидная карта, отклонённый
         // платёж), а не сбой сервера: клиенту уходит 400, не 500
         if (
            errorMsg.includes('Validation DTO failed') ||
            errorMsg.includes('data.pan')
         ) {
            throw new BadRequestError(
               `Card data is invalid or incomplete. Please create a new card. (IPAK Error: ${errorMsg.substring(0, 100)})`,
               ErrorCode.PAYMENT_PROVIDER_ERROR,
            );
         }

         throw new BadRequestError(
            `Ipak API Error [${responseBody.error.code}]: ${responseBody.error.message}`,
            ErrorCode.PAYMENT_PROVIDER_ERROR,
         );
      }
      const resultData =
         responseBody.result?.data || (responseBody as any).data;

      if (!resultData) {
         logger.error(
            { responseBody },
            `${logContext}: Invalid API response structure`,
         );
         throw new Error(`${logContext}: Missing result.data in response`);
      }

      return resultData as TResult;
   } catch (error) {
      handleError(error, `Error in ${logContext}`, { method, params });
      // Сетевой сбой или таймаут банка — это 503 «провайдер недоступен»,
      // а не 500: клиенту есть смысл повторить позже.
      if (axios.isAxiosError(error) && !error.response) {
         throw new ServiceUnavailableError(
            'Payment provider is unavailable. Please try again later.',
            ErrorCode.PAYMENT_PROVIDER_ERROR,
         );
      }
      throw error;
   }
}

interface CreateContractArgs {
   clientId: string;
   successUrl: string;
   failUrl: string;
   clientInfo?: Record<string, any>;
}

export const contractCreate = async ({
   clientId,
   successUrl,
   failUrl,
   clientInfo = {},
}: CreateContractArgs): Promise<ContractCreateResultData> => {
   return sendRpcRequest<ContractCreateRequestParams, ContractCreateResultData>(
      'tokenized.contract_create',
      {
         client_id: clientId,
         client_info: clientInfo,
         redirects: { successUrl, failUrl },
      },
      'Contract Create',
   );
};

interface GetContractArgs {
   contract_id: string;
}

export const ContractGet = async ({
   contract_id,
}: GetContractArgs): Promise<ContractGetResultData> => {
   return sendRpcRequest<ContractGetRequestParams, ContractGetResultData>(
      'tokenized.contract_get',
      { contract_id },
      'Contract Get',
   );
};

interface PaymentRequestArgs {
   contract_id: string;
   order_id: string;
   amount: number;
   ofdInfo?: OfdInfo;
   taxInfo?: Record<any, any>;
}

export const paymentPay = async ({
   contract_id,
   order_id,
   amount,
   ofdInfo,
   taxInfo,
}: PaymentRequestArgs): Promise<PaymentPayResultData> => {
   const numericNumber = Number(amount);
   return sendRpcRequest<PaymentPayRequestParams, PaymentPayResultData>(
      'tokenized.payment_pay',
      {
         contract_id: contract_id,
         order_id: order_id,
         amount: numericNumber,
         ofdInfo: ofdInfo,
         taxInfo: taxInfo,
      },
      'Payment Pay',
   );
};

interface PaymentCancelArgs {
   contract_id: string;
   transfer_id: string;
}

export const PaymentCancel = async ({
   contract_id,
   transfer_id,
}: PaymentCancelArgs): Promise<PaymentCancelResultData> => {
   return sendRpcRequest<PaymentCancelRequestParams, PaymentCancelResultData>(
      'tokenized.payment_cancel',
      {
         contract_id,
         transfer_id,
      },
      'Payment Cancel',
   );
};

interface PaymentGetArgs {
   contract_id: string;
   transfer_id: string;
}

export const PaymentGet = async ({
   contract_id,
   transfer_id,
}: PaymentGetArgs): Promise<PaymentGetResultData> => {
   return sendRpcRequest<PaymentGetRequestParams, PaymentGetResultData>(
      'tokenized.payment_get',
      {
         contract_id,
         transfer_id,
      },
      'Payment Get',
   );
};

interface ContractCancelArgs {
   contract_id: string;
}

export const ContractCancel = async ({
   contract_id,
}: ContractCancelArgs): Promise<ContractCancelResultData> => {
   return sendRpcRequest<ContractCancelRequestParams, ContractCancelResultData>(
      'tokenized.contract_cancel',
      { contract_id },
      'Contract Cancel',
   );
};

export const callBackIpak = async (req: Request, res: Response) => {
   try {
      const parseResult = ipakCallbackSchema.safeParse(req.body);

      if (!parseResult.success) {
         logger.warn(
            { errors: parseResult.error, body: req.body },
            'Invalid callback payload from IpakYuli',
         );
         return res.status(400).json({ error: 'Invalid payload' });
      }

      const data = parseResult.data;

      if ('tokenizedContractId' in data) {
         logger.info(
            {
               contractId: data.tokenizedContractId,
               orderId: data.orderId,
               status: data.status,
               amount: data.amount,
            },
            'Received IpakYuli Payment Callback',
         );

         if (data.status === 'success') {
            await paymentService.handlePaymentSuccessCallback({
               tokenizedContractId: data.tokenizedContractId,
               status: data.status,
               amount: data.amount,
               orderId: data.orderId,
               details: data.details,
            });
         } else if (data.status === 'failed') {
            logger.warn({ data }, 'Payment callback reported failure status');
            await paymentService.handlePaymentFailedCallback({
               tokenizedContractId: data.tokenizedContractId,
               status: data.status,
               amount: data.amount,
               orderId: data.orderId,
               details: data.details,
            });
         }
      } else if ('contract_id' in data) {
         logger.info(
            {
               contractId: data.contract_id,
               clientId: data.client_id,
               card: data.card.pan_masked,
            },
            'Received IpakYuli Tokenization Callback',
         );

         if (data.status === 'active') {
            await userCardService.confirmUserCardCreate({
               contractId: data.contract_id,
               userId: data.client_id,
               panMasked: data.card.pan_masked,
               expiry: data.card.expiry,
            });
         }
      }

      return res.status(200).send('OK');
   } catch (error) {
      handleError(error, `Error in processing callback`, {});
      return res.status(500).send('Internal Server Error');
   }
};
