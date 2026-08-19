import Admin from '../models/Admin';

export const findAdminByEmail = async (
   email: string,
): Promise<Admin | null> => {
   return await Admin.findOne({ where: { email } });
};
