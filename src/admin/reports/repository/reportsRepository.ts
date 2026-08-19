import User from '../../../user/models/User';
import { Op } from 'sequelize';
import Report, { ReportStatus } from '../../../user/models/Report';
import {
   DateRangeInput,
   getDateRangeBounds,
} from '../../../../shared/utils/dateRange';

export const getAllReports = async (
   reportStatuses: ReportStatus[],
   limit: number,
   offset: number,
   options: DateRangeInput & {
      sortBy: string;
      sortOrder: string;
      search?: string;
   },
): Promise<{ rows: Report[]; count: number }> => {
   const { sortBy, sortOrder, search } = options;
   const whereClause: any = { status: reportStatuses };

   if (search) {
      whereClause[Op.or] = [
         { reason: { [Op.iLike]: `%${search}%` } },
         { '$reportingUser.firstName$': { [Op.iLike]: `%${search}%` } },
         { '$reportedUser.firstName$': { [Op.iLike]: `%${search}%` } },
      ];
   }

   const bounds = getDateRangeBounds(options);
   if (bounds) {
      whereClause.createdAt = { [Op.between]: [bounds.start, bounds.end] };
   }

   return await Report.findAndCountAll({
      where: whereClause,
      include: [
         {
            model: User,
            as: 'reportingUser',
            attributes: ['id', 'firstName'],
         },
         {
            model: User,
            as: 'reportedUser',
            attributes: ['id', 'firstName'],
         },
      ],
      order: [[sortBy, sortOrder]],
      limit,
      offset,
   });
};
