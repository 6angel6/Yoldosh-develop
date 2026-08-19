import logger from '../utils/logger';
import Admin, { AdminRole } from '../../src/admin/auth/models/Admin';

export const seedAdmins = async () => {
   try {
      const [superAdmin, createdSuper] = await Admin.findOrCreate({
         where: { email: 'super@yoldosh.uz' },
         defaults: {
            firstName: 'Super',
            lastName: 'Admin',
            role: AdminRole.SuperAdmin,
            password: null, // will be set on first login
         },
      });

      if (createdSuper) {
         logger.info(`Super admin was created ${superAdmin.email}`);
      } else {
         logger.info(
            `Super admin with this email is already exist ${superAdmin.email}`,
         );
      }

      const [admin, createdAdmin] = await Admin.findOrCreate({
         where: { email: 'admin@yoldosh.uz' },
         defaults: {
            firstName: 'Test',
            lastName: 'Admin',
            role: AdminRole.Admin,
            password: null, // will be set on first login
         },
      });

      if (createdAdmin) {
         logger.info(`Admin was created ${admin.email}`);
      } else {
         logger.warn(`Admin with this email is exists ${admin.email}`);
      }
   } catch (error) {
      logger.error(`Error while creating an admin`);
   }
};
