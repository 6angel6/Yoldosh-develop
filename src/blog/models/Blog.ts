import db from '../../../shared/config/database';
import { Model, DataTypes, Optional } from 'sequelize';
import Admin from '../../admin/auth/models/Admin';

export interface MultiLangField {
   ru: string;
   uz: string;
   en: string;
}

export interface BlogAttributes {
   id: string;
   slug: string;
   title: MultiLangField;
   subtitle?: MultiLangField;
   content: MultiLangField;
   coverImage?: string;
   isPublished: boolean;
   views: number;
   seoTitle?: MultiLangField;
   seoDescription?: MultiLangField;
   seoKeywords?: MultiLangField;
   authorId: string;
   createdAt?: Date;
   updatedAt?: Date;
}

export type BlogCreationAttributes = Optional<
   BlogAttributes,
   'id' | 'slug' | 'views' | 'isPublished'
>;

class Blog
   extends Model<BlogAttributes, BlogCreationAttributes>
   implements BlogAttributes
{
   public id!: string;
   public slug!: string;
   public title!: MultiLangField;
   public subtitle?: MultiLangField;
   public content!: MultiLangField;
   public coverImage?: string;
   public isPublished!: boolean;
   public views!: number;
   public seoTitle?: MultiLangField;
   public seoDescription?: MultiLangField;
   public seoKeywords?: MultiLangField;
   public authorId!: string;
   public readonly createdAt!: Date;
   public readonly updatedAt!: Date;
}

Blog.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      slug: { type: DataTypes.STRING, unique: true, allowNull: false },
      title: { type: DataTypes.JSONB, allowNull: false },
      subtitle: { type: DataTypes.JSONB, allowNull: true },
      content: { type: DataTypes.JSONB, allowNull: false },
      coverImage: { type: DataTypes.STRING, allowNull: true },
      isPublished: { type: DataTypes.BOOLEAN, defaultValue: false },
      views: { type: DataTypes.INTEGER, defaultValue: 0 },
      seoTitle: { type: DataTypes.JSONB, allowNull: true },
      seoDescription: { type: DataTypes.JSONB, allowNull: true },
      seoKeywords: { type: DataTypes.JSONB, allowNull: true },
      authorId: {
         type: DataTypes.UUID,
         allowNull: false,
         references: { model: Admin, key: 'id' },
      },
   },
   {
      sequelize: db,
      tableName: 'blogs',
      timestamps: true,
      hooks: {
         beforeValidate: (blog) => {
            // Генерируем slug из русского тайтла
            if (blog.title && blog.title.ru && !blog.slug) {
               blog.slug = blog.title.ru
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/(^-|-$)+/g, '');
            }
         },
      },
   },
);

export default Blog;
