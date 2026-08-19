import db from '../../../../shared/config/database';
import { Model, DataTypes, Optional } from 'sequelize';

export interface RestrictedWordAttributes {
   id: number;
   word: string;
   createdAt?: Date;
   updatedAt?: Date;
}

export type RestrictedWordCreationAttributes = Optional<
   RestrictedWordAttributes,
   'id' | 'createdAt' | 'updatedAt'
>;

class RestrictedWord
   extends Model<RestrictedWordAttributes, RestrictedWordCreationAttributes>
   implements RestrictedWordAttributes
{
   public id!: number;
   public word!: string;
   public readonly createdAt!: Date;
   public readonly updatedAt!: Date;
}

RestrictedWord.init(
   {
      id: {
         type: DataTypes.INTEGER,
         autoIncrement: true,
         primaryKey: true,
      },
      word: {
         type: DataTypes.STRING,
         allowNull: false,
         unique: true,
      },
   },
   {
      sequelize: db,
      tableName: 'restricted_words',
      timestamps: true,
   },
);

export default RestrictedWord;
