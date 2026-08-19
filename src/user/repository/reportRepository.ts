import { Transaction } from 'sequelize';
import Report, { ReportCreationAttributes } from '../models/Report';

export const createReport = async (
   reportData: ReportCreationAttributes,
   transaction?: Transaction,
): Promise<Report> => {
   return await Report.create(reportData, { transaction });
};

export const findReportById = async (
   reportId: string,
   transaction?: Transaction,
) => {
   return await Report.findByPk(reportId, { transaction });
};
