import crypto from 'crypto';
import { User } from '../../user/models/User';
import logger from '../../../shared/utils/logger';
import { sendSMS } from '../../../shared/api/eskiz/eskizApi';
import * as process from 'node:process';
import dotenv from 'dotenv';
dotenv.config();

const OTP_EXPIRY_MINUTES = 10;
const testOTP = '0000';
const DEV_PHONE = '+998000000000';

export const sendOtp = async (
   user: User,
   platform?: 'ios' | 'android',
): Promise<string> => {
   const otpExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

   if (user.phoneNumber === DEV_PHONE) {
      logger.debug(`Dev phone ${DEV_PHONE}, using test OTP`);
      user.otp = testOTP;
      user.otpExpires = otpExpires;
      await user.save();
      return testOTP;
   }

   if (process.env.NODE_ENV === 'production') {
      const otp = crypto.randomInt(1000, 9999).toString();
      logger.debug(otp);
      user.otp = otp;
      user.otpExpires = otpExpires;
      await user.save();

      const isIos = platform === 'ios';
      const action = user.verified ? 'kirish' : 'registratsiya';
      const message = isIos
         ? `Yo'ldosh ilovasiga ${action} kod : ${otp} VLoH+c/vNkP`
         : `<#> Yo'ldosh ilovasiga ${action} kod : ${otp}\nVLoH+c/vNkP`;

      await sendSMS(user.phoneNumber, message);

      if (user.verified) {
         return otp;
      }

      logger.info(
         { phone: user.phoneNumber },
         `Generated production OTP, ${otp}`,
      );

      return otp;
   } else {
      logger.debug(testOTP);
      user.otp = testOTP;
      user.otpExpires = otpExpires;
      await user.save();

      return testOTP;
   }
};
