import * as bannerRepository from '../repository/bannerRepository';
import Banner, {
   BannerAttributes,
   BannerCreationAttributes,
} from '../models/Banner';
import { getOrSetCache, clearCache } from '../../../shared/config/redis';
import {
   uploadBannerMedia,
   getBannerMedia,
} from '../../../shared/config/storage';
import { NotFoundError } from '../../../shared/utils/errorHandler';
import { BannerDto } from '../models/dto/bannerValidation';

const CACHE_TTL = 300; // 5 минут; инвалидируется при любом изменении баннера
const placementKey = (placement: string) => `banner:placement:${placement}`;

// Клиентский контракт: только то, что нужно рендерить. Внутренние поля
// (is_active, start/end, targeting, frequency, author, timestamps) не отдаём.
const formatBanner = (b: BannerAttributes) => ({
   id: b.id,
   type: b.type,
   placement: b.placement,
   title: b.title ?? null,
   body: b.body ?? null,
   media: b.media ?? null,
   action_url: b.action_url ?? null,
   priority: b.priority,
});

/**
 * Баннеры для экрана (pull-модель). Кэшируем активные баннеры плейсмента, а окно
 * расписания (start_at/end_at) применяем НА ВЫДАЧЕ — иначе баннер появлялся бы
 * или пропадал с задержкой до TTL. Сортировка по priority. Контент один для всех
 * (мультиязычный JSON — клиент берёт нужный язык), поэтому кэш без язык-измерения.
 */
export const getBannersForPlacement = async (placement: string) => {
   const all = await getOrSetCache<BannerAttributes[]>(
      placementKey(placement),
      async () => {
         const rows = await bannerRepository.findActiveByPlacement(placement);
         return rows.map((r) => r.toJSON() as BannerAttributes);
      },
      CACHE_TTL,
   );

   const now = Date.now();
   const banners = all
      .filter((b) => {
         const startOk = !b.start_at || new Date(b.start_at).getTime() <= now;
         const endOk = !b.end_at || new Date(b.end_at).getTime() >= now;
         return startOk && endOk;
      })
      .sort((a, b) => b.priority - a.priority)
      .map(formatBanner);

   return { banners };
};

const invalidate = (placement?: string) =>
   clearCache(placement ? placementKey(placement) : 'banner:placement:*').catch(
      () => {},
   );

export const createBanner = async (
   authorId: string,
   data: BannerDto,
): Promise<Banner> => {
   const banner = await bannerRepository.createBanner({
      ...data,
      authorId,
   } as BannerCreationAttributes);
   await invalidate(data.placement);
   return banner;
};

export const updateBanner = async (
   id: string,
   data: BannerDto,
): Promise<Banner> => {
   const existing = await bannerRepository.findBannerById(id);
   if (!existing) throw new NotFoundError('Баннер не найден');

   const [, rows] = await bannerRepository.updateBanner(
      id,
      data as Partial<BannerCreationAttributes>,
   );

   await invalidate(existing.placement);
   if (data.placement && data.placement !== existing.placement) {
      await invalidate(data.placement);
   }
   return rows[0];
};

export const deleteBanner = async (id: string) => {
   const existing = await bannerRepository.findBannerById(id);
   if (!existing) throw new NotFoundError('Баннер не найден');

   await bannerRepository.deleteBanner(id);
   await invalidate(existing.placement);
   return { message: 'Баннер удалён' };
};

export const listBannersAdmin = (page: number, limit: number) =>
   bannerRepository.findAllAdmin({ limit, offset: (page - 1) * limit });

// Загрузка медиа (фото/видео) в MinIO через наш API. Возвращает { key, url },
// где url — публичная ссылка (Node-роут), её кладём в media.url баннера.
export const uploadMedia = (buffer: Buffer, contentType: string) =>
   uploadBannerMedia(buffer, contentType);

// Отдача медиа из MinIO для стриминга клиенту (поддерживает Range для видео).
export const getMedia = (key: string, range?: string) =>
   getBannerMedia(key, range);
