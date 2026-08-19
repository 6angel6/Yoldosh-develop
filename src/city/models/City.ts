import { Model, DataTypes, Optional } from 'sequelize';
import db from '../../../shared/config/database';

export type CityKind = 'region' | 'city';

export interface CityAttributes {
   id: string;
   osm_id?: number | null;
   admin_level: number;
   kind: CityKind;
   region_id?: string | null; // self-ref FK: city → region или region → self
   canonical_ru: string;
   canonical_uz: string;
   canonical_en?: string | null;
   region?: string | null; // denormalized RU-имя региона для отображения
   center_geo?: any; // geography(Point, 4326)
   bbox_geo?: any; // geography(MultiPolygon, 4326) — исключён из defaultScope
   search_radius_m: number;
   population?: number | null;
   aliases: string[];
   is_active: boolean;
   created_at?: Date;
   updated_at?: Date;
}

export interface CityCreationAttributes
   extends Optional<
      CityAttributes,
      | 'id'
      | 'osm_id'
      | 'kind'
      | 'region_id'
      | 'canonical_en'
      | 'region'
      | 'center_geo'
      | 'bbox_geo'
      | 'population'
      | 'aliases'
      | 'is_active'
      | 'created_at'
      | 'updated_at'
   > {}

export class City
   extends Model<CityAttributes, CityCreationAttributes>
   implements CityAttributes
{
   public id!: string;
   public osm_id?: number | null;
   public admin_level!: number;
   public kind!: CityKind;
   public region_id?: string | null;
   public canonical_ru!: string;
   public canonical_uz!: string;
   public canonical_en?: string | null;
   public region?: string | null;
   public center_geo?: any;
   public bbox_geo?: any;
   public search_radius_m!: number;
   public population?: number | null;
   public aliases!: string[];
   public is_active!: boolean;

   public readonly created_at!: Date;
   public readonly updated_at!: Date;
}

City.init(
   {
      id: {
         type: DataTypes.UUID,
         defaultValue: DataTypes.UUIDV4,
         primaryKey: true,
      },
      // Уникальность теперь composite (osm_id, kind) — Toshkent относится и к
      // регионам, и к городам под одним osm_id. Индекс создаётся миграцией.
      osm_id: { type: DataTypes.BIGINT, allowNull: true },
      admin_level: { type: DataTypes.SMALLINT, allowNull: false },
      // В БД это TEXT с CHECK-constraint (см. миграцию) — не PG ENUM, потому
      // что добавлять новый kind через ALTER TYPE в будущем проще, чем ALTER ENUM.
      kind: {
         type: DataTypes.TEXT,
         allowNull: false,
         defaultValue: 'city',
         validate: { isIn: [['region', 'city']] },
      },
      region_id: {
         type: DataTypes.UUID,
         allowNull: true,
         references: { model: 'cities', key: 'id' },
      },
      canonical_ru: { type: DataTypes.TEXT, allowNull: false },
      canonical_uz: { type: DataTypes.TEXT, allowNull: false },
      canonical_en: { type: DataTypes.TEXT, allowNull: true },
      region: { type: DataTypes.TEXT, allowNull: true },
      center_geo: {
         type: DataTypes.GEOGRAPHY('POINT', 4326),
         allowNull: false,
      },
      bbox_geo: {
         type: DataTypes.GEOGRAPHY('MULTIPOLYGON', 4326),
         allowNull: true,
      },
      search_radius_m: {
         type: DataTypes.INTEGER,
         allowNull: false,
         defaultValue: 20000,
      },
      population: { type: DataTypes.INTEGER, allowNull: true },
      aliases: {
         type: DataTypes.ARRAY(DataTypes.TEXT),
         allowNull: false,
         defaultValue: [],
      },
      is_active: {
         type: DataTypes.BOOLEAN,
         allowNull: false,
         defaultValue: true,
      },
   },
   {
      sequelize: db,
      modelName: 'City',
      tableName: 'cities',
      timestamps: true,
      underscored: true,
      // Не тянем тяжёлый полигон по умолчанию
      defaultScope: {
         attributes: { exclude: ['bbox_geo'] },
      },
   },
);

export default City;
