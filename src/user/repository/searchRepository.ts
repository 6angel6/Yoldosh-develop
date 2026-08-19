import Search, { SearchCreationAttributes } from '../models/Search';

export const createSearch = async (
   data: SearchCreationAttributes,
): Promise<Search> => {
   const whereClause: any = {
      from_city: data.from_city,
      to_city: data.to_city,
      from_address: data.from_address,
      to_address: data.to_address,
   };

   if (data.userId) {
      whereClause.userId = data.userId;
   } else if (data.guestId) {
      whereClause.guestId = data.guestId;
   }

   const [search, created] = await Search.findOrCreate({
      where: whereClause,
      defaults: data,
   });

   if (!created) {
      await search.update({ updated_at: new Date() });
   }

   return search;
};

export const findSearchesByIdentifier = async (identifier: {
   userId?: string;
   guestId?: string;
}): Promise<Search[]> => {
   const whereClause: any = {};

   if (identifier.userId) {
      whereClause.userId = identifier.userId;
   } else if (identifier.guestId) {
      whereClause.guestId = identifier.guestId;
   } else {
      return [];
   }

   return await Search.findAll({
      where: whereClause,
      order: [['updatedAt', 'DESC']],
      limit: 10,
      include: [],
   });
};
