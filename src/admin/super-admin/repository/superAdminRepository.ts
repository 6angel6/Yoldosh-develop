import Admin, {
   AdminCreationAttributes,
   AdminRole,
} from '../../auth/models/Admin';

export const findAdminByEmail = async (
   email: string,
): Promise<Admin | null> => {
   return await Admin.findOne({ where: { email } });
};

export const findAdminById = async (id: string): Promise<Admin | null> => {
   return await Admin.findByPk(id);
};

export const createAdmin = async (
   adminData: AdminCreationAttributes,
): Promise<Admin> => {
   return Admin.create(adminData);
};

export const deleteAdminById = async (
   adminId: string,
   transaction?: any,
): Promise<number> => {
   return Admin.destroy({
      where: { id: adminId, role: AdminRole.Admin },
      transaction,
   });
};

export const findAllAdminsWithStats = async () => {
   return Admin.findAndCountAll({
      attributes: { exclude: ['password'] },
   });
};
