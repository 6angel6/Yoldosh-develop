import RestrictedWord, {
   RestrictedWordCreationAttributes,
} from '../models/RestrictedWord';
import { Op } from 'sequelize';

export const createRestrictedWord = async (
   data: RestrictedWordCreationAttributes,
): Promise<RestrictedWord> => {
   return RestrictedWord.create(data);
};

export const findRestrictedWordById = async (
   id: number,
): Promise<RestrictedWord | null> => {
   return RestrictedWord.findByPk(id);
};

export const deleteRestrictedWord = async (id: number): Promise<number> => {
   return RestrictedWord.destroy({ where: { id } });
};

export const findAllRestrictedWords = async (): Promise<string[]> => {
   const results = await RestrictedWord.findAll({ attributes: ['word'] });
   return results.map((r) => r.word);
};

export const findAllWordsWithPagination = async (options: {
   limit: number;
   offset: number;
   search?: string;
   sortBy: string;
   sortOrder: string;
}) => {
   const { limit, offset, search, sortBy, sortOrder } = options;
   const whereClause: any = {};
   if (search) {
      whereClause.word = { [Op.iLike]: `%${search}%` };
   }
   return RestrictedWord.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
   });
};
