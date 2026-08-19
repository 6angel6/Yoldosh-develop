import * as yandexApi from '../api/yandexMap/yandexGeocoder';
import { BadRequestError } from './errorHandler';
import { normalizeCityName } from '../i18n/regionLocalization';

export const getGeoData = async (longitude: number, latitude: number) => {
   const geoResult = await yandexApi.getAddressFromCoords(longitude, latitude);

   if (
      !geoResult ||
      geoResult.response.GeoObjectCollection.featureMember.length === 0
   ) {
      throw new BadRequestError(
         `Could not find location data for coordinates: ${latitude}, ${longitude}`,
      );
   }

   const geoObject =
      geoResult.response.GeoObjectCollection.featureMember[0].GeoObject;
   const formattedAddress = geoObject.name;
   const components =
      geoObject.metaDataProperty.GeocoderMetaData.Address.Components;

   const regionComponent = components.find((c) => c.kind === 'province');

   let regionNameForCity = '';

   if (regionComponent) {
      regionNameForCity = regionComponent.name;
   }

   const cityComponent =
      components.find((c) => c.kind === 'locality') || regionComponent;

   const rawCityName = cityComponent
      ? cityComponent.name
      : regionNameForCity || 'Unknown City';

   return {
      address: formattedAddress,
      cityName: normalizeCityName(rawCityName),
   };
};
