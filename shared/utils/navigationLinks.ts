import { NavigatorPreference } from '../../src/user/models/User';

interface LinkData {
   link: string;
   app_data: {
      android_id: string;
      ios_id: string;
      scheme: string;
   };
}
const APP_METADATA = {
   [NavigatorPreference.YandexNavi]: {
      android_id: 'ru.yandex.navigator',
      ios_id: '474500851',
      scheme: 'yandexnavi',
   },
   [NavigatorPreference.GoogleMaps]: {
      android_id: 'com.google.android.apps.maps',
      ios_id: '585027354',
      scheme: 'comgooglemaps',
   },
   [NavigatorPreference.None]: {
      android_id: '',
      ios_id: '',
      scheme: '',
   },
};

const generateYandexNaviLink = (points): string => {
   const rtext = points.map((p) => `${p.lat},${p.lon}`).join('~');
   return `https://yandex.ru/maps/?rtext=${rtext}&rtt=auto`;
};

const generateGoogleMapsLink = (points): string => {
   const origin = `${points[0].lat},${points[0].lon}`;
   const destination = `${points[points.length - 1].lat},${points[points.length - 1].lon}`;

   const waypoints = points
      .slice(1, -1)
      .map((p) => `${p.lat},${p.lon}`)
      .join('|');

   return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${waypoints}&travelmode=driving`;
};

export const generateAllRouteLinks = (
   points,
): Record<NavigatorPreference, LinkData> => {
   if (points.length < 2) {
      throw new Error('Route requires at least 2 points.');
   }
   return {
      [NavigatorPreference.YandexNavi]: {
         link: generateYandexNaviLink(points),
         app_data: APP_METADATA[NavigatorPreference.YandexNavi],
      },
      [NavigatorPreference.GoogleMaps]: {
         link: generateGoogleMapsLink(points),
         app_data: APP_METADATA[NavigatorPreference.GoogleMaps],
      },
      [NavigatorPreference.None]: {
         link: '',
         app_data: { android_id: '', ios_id: '', scheme: '' },
      },
   } as Record<NavigatorPreference, LinkData>;
};
