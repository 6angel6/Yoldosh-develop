import Banner, { BannerCreationAttributes } from '../models/Banner';

// Активные баннеры плейсмента (окно расписания фильтруется в сервисе на выдаче).
export const findActiveByPlacement = (placement: string): Promise<Banner[]> =>
   Banner.findAll({ where: { placement, is_active: true } });

export const createBanner = (data: BannerCreationAttributes): Promise<Banner> =>
   Banner.create(data);

export const findBannerById = (id: string): Promise<Banner | null> =>
   Banner.findByPk(id);

export const updateBanner = (
   id: string,
   data: Partial<BannerCreationAttributes>,
): Promise<[number, Banner[]]> =>
   Banner.update(data, { where: { id }, returning: true });

export const deleteBanner = (id: string): Promise<number> =>
   Banner.destroy({ where: { id } });

export const findAllAdmin = (options: {
   limit: number;
   offset: number;
}): Promise<{ count: number; rows: Banner[] }> =>
   Banner.findAndCountAll({
      limit: options.limit,
      offset: options.offset,
      order: [
         ['priority', 'DESC'],
         ['created_at', 'DESC'],
      ],
   });
