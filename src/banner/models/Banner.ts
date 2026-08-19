import { Model, DataTypes, Optional } from 'sequelize';
import db from '../../../shared/config/database';

export enum BannerType {
   popup = 'popup',
   inline_banner = 'inline_banner',
   carousel = 'carousel',
   fullscreen = 'fullscreen',
}

export enum MediaType {
   video = 'video',
   image = 'image',
}

export interface Media {
   type: MediaType;
   url: string;
}

export interface MultiLangField {
   ru: string;
   uz: string;
   en: string;
}

export interface BannerAttributes {
   id: string;
   type: BannerType;
   placement: string; // экран/слот: 'home', 'catalog', ...
   title?: MultiLangField | null;
   body?: MultiLangField | null;
   media?: Media | null;
   action_url?: string | null; // диплинк по тапу
   priority: number;
   start_at?: Date | null;
   end_at?: Date | null;
   is_active: boolean;
   // Зарезервировано под фазу 2 (decision engine). Пока не используется.
   targeting?: Record<string, unknown> | null;
   frequency?: Record<string, unknown> | null;
   authorId?: string | null;
   createdAt?: Date;
   updatedAt?: Date;
}

export type BannerCreationAttributes = Optional<
   BannerAttributes,
   'id' | 'priority' | 'is_active' | 'createdAt' | 'updatedAt'
>;

export class Banner
   extends Model<BannerAttributes, BannerCreationAttributes>
   implements BannerAttributes
{
   public id!: string;
   public type!: BannerType;
   public placement!: string;
   public title?: MultiLangField | null;
   public body?: MultiLangField | null;
   public media?: Media | null;
   public action_url?: string | null;
   public priority!: number;
   public start_at?: Date | null;
   public end_at?: Date | null;
   public is_active!: boolean;
   public targeting?: Record<string, unknown> | null;
   public frequency?: Record<string, unknown> | null;
   public authorId?: string | null;

   public readonly createdAt!: Date;
   public readonly updatedAt!: Date;
}

Banner.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      type: {
         type: DataTypes.ENUM(...Object.values(BannerType)),
         allowNull: false,
      },
      placement: { type: DataTypes.STRING, allowNull: false },
      title: { type: DataTypes.JSONB, allowNull: true },
      body: { type: DataTypes.JSONB, allowNull: true },
      media: { type: DataTypes.JSONB, allowNull: true },
      action_url: {
         type: DataTypes.STRING,
         allowNull: true,
         field: 'action_url',
      },
      priority: {
         type: DataTypes.INTEGER,
         allowNull: false,
         defaultValue: 0,
      },
      start_at: { type: DataTypes.DATE, allowNull: true, field: 'start_at' },
      end_at: { type: DataTypes.DATE, allowNull: true, field: 'end_at' },
      is_active: {
         type: DataTypes.BOOLEAN,
         allowNull: false,
         defaultValue: true,
         field: 'is_active',
      },
      targeting: { type: DataTypes.JSONB, allowNull: true },
      frequency: { type: DataTypes.JSONB, allowNull: true },
      authorId: {
         type: DataTypes.UUID,
         allowNull: true,
         field: 'author_id',
         references: { model: 'admins', key: 'id' },
      },
   },
   {
      sequelize: db,
      modelName: 'Banner',
      tableName: 'banners',
      timestamps: true,
      underscored: true,
      indexes: [
         {
            name: 'idx_banners_placement_active',
            fields: ['placement', 'is_active'],
         },
         { name: 'idx_banners_priority', fields: ['priority'] },
      ],
   },
);

export default Banner;
