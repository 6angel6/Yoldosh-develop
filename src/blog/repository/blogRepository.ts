import { Op, literal } from 'sequelize';
import Blog, { BlogCreationAttributes } from '../models/Blog';
import Admin from '../../admin/auth/models/Admin';

export const createBlog = async (
   data: BlogCreationAttributes,
   transaction?: any,
): Promise<Blog> => {
   return await Blog.create(data, { transaction });
};

export const updateBlog = async (
   id: string,
   data: Partial<BlogCreationAttributes>,
   transaction?: any,
): Promise<[number, Blog[]]> => {
   return await Blog.update(data, {
      where: { id },
      returning: true,
      transaction,
   });
};

export const deleteBlog = async (
   id: string,
   transaction?: any,
): Promise<number> => {
   return await Blog.destroy({ where: { id }, transaction });
};

export const incrementViews = async (id: string): Promise<void> => {
   await Blog.increment('views', { where: { id } });
};

export const findBlogById = async (id: string): Promise<Blog | null> => {
   return await Blog.findByPk(id, {
      include: [
         {
            model: Admin,
            as: 'author',
            attributes: ['id', 'firstName', 'lastName'],
         },
      ],
   });
};

export const findBlogBySlug = async (slug: string): Promise<Blog | null> => {
   return await Blog.findOne({
      where: { slug },
      include: [
         {
            model: Admin,
            as: 'author',
            attributes: ['id', 'firstName', 'lastName'],
         },
      ],
   });
};

export const checkSlugExists = async (
   slug: string,
   excludeId?: string,
): Promise<boolean> => {
   const whereClause: any = { slug };
   if (excludeId) whereClause.id = { [Op.ne]: excludeId };
   return (await Blog.count({ where: whereClause })) > 0;
};

const jsonbTextSearch = (column: string, search: string) =>
   literal(`"${column}"::text ILIKE '%${search.replace(/'/g, "''")}%'`);

// Для админки (все блоги включая черновики)
export const findAllBlogsAdmin = async (options: {
   page: number;
   limit: number;
   offset: number;
   search?: string;
   sortBy: string;
   sortOrder: string;
   isPublished?: string;
}) => {
   const { limit, offset, search, sortBy, sortOrder, isPublished } = options;
   const whereClause: any = {};

   if (search) {
      whereClause[Op.or] = [
         jsonbTextSearch('title', search),
         jsonbTextSearch('subtitle', search),
         { slug: { [Op.iLike]: `%${search}%` } },
      ];
   }

   if (isPublished !== undefined) {
      whereClause.isPublished = isPublished === 'true';
   }

   return await Blog.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
      include: [
         {
            model: Admin,
            as: 'author',
            attributes: ['id', 'firstName', 'lastName'],
         },
      ],
   });
};

// Для лэндинга (только опубликованные)
export const findPublishedBlogs = async (options: {
   limit: number;
   offset: number;
   search?: string;
}) => {
   const { limit, offset, search } = options;
   const whereClause: any = { isPublished: true };

   if (search) {
      whereClause[Op.or] = [
         jsonbTextSearch('title', search),
         jsonbTextSearch('subtitle', search),
      ];
   }

   return await Blog.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['content'] },
      include: [
         { model: Admin, as: 'author', attributes: ['firstName', 'lastName'] },
      ],
   });
};
