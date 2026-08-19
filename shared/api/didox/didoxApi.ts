import axios from 'axios';
import { DIDOX_URL, header } from './didoxConfig';
import logger from '../../utils/logger';

// Без таймаута зависший Didox держит соединение бесконечно.
const DIDOX_TIMEOUT_MS = 10_000;

export const inviteWorker = async (
   pinfl: string,
   phoneNumber: string,
   cardNumber?: string,
) => {
   const extractedPhone = phoneNumber.replace(/\+/g, '');
   const requestBody = {
      phoneNumber: extractedPhone,
      pinfl: pinfl,
      cardNumber: cardNumber || null,
   };
   const url = `${DIDOX_URL}/inviteWorker`;

   const response = await axios.post(url, requestBody, {
      ...header,
      timeout: DIDOX_TIMEOUT_MS,
   });

   logger.info(
      {
         url: url,
         headers: header.headers,
         body: requestBody,
      },
      'inviteWorker Request',
   );

   if (response.data.error || response.data.success == false) {
      const apiError = response.data.error;
      logger.error({ apiError }, 'Didox API error in inviteWorker');
      throw new Error(
         `Didox API error : ${apiError.msg || JSON.stringify(apiError)}`,
      );
   }

   logger.info({ response: response.data }, 'Successfully sent invitation.');
   return response.data;
};

export const getWorker = async (pinfl: string) => {
   const url = `${DIDOX_URL}/getWorker?pinfl=${pinfl}`;

   const response = await axios.post(
      url,
      {},
      {
         ...header,
         timeout: DIDOX_TIMEOUT_MS,
      },
   );

   logger.info(
      {
         url: url,
         headers: header.headers,
      },
      'Get worker information',
   );

   if (response.data.error || response.data.success == false) {
      const apiError = response.data.error;
      logger.error({ apiError }, 'Didox API error in getWorker Api ');
      throw new Error(
         `Didox API error : ${apiError.msg || JSON.stringify(apiError)}`,
      );
   }

   logger.info(
      { response: response.data },
      'Successfully received worker data.',
   );
   return response.data;
};

export const getInvitationLink = async (pinfl: string) => {
   const requestBody = {
      pinfl: pinfl,
   };
   const response = await axios.post(
      `${DIDOX_URL}/getInvitationLink?pinfl${pinfl}`,
      header,
   );

   logger.info(
      {
         url: `${DIDOX_URL}/getInvitationLink?pinfl${pinfl}`,
         headers: header.headers,
         body: requestBody,
      },
      'inviteWorker Request',
   );

   if (response.data.error || response.data.success == false) {
      const apiError = response.data.error;
      logger.error({ apiError }, 'Didox API error in inviteWorker');
      throw new Error(
         `Didox API error : ${apiError.msg || JSON.stringify(apiError)}`,
      );
   }

   logger.info({ response: response.data }, 'Successfully sent invitation.');
   return response.data;
};
