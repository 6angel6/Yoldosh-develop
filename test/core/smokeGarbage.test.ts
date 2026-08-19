import { describe, expect, it } from 'vitest';
import request from 'supertest';

/**
 * Смоук §5.2: мусорный вход на каждый роут приложения не должен давать 500.
 * Роуты перечисляются из стека Express во время выполнения — список не может
 * разойтись с реальностью. Валидация обязана резать мусор до контроллера
 * (400/401/403/404 допустимы, 500 — нет).
 *
 * Express 5 не хранит строку пути маунта в Layer, поэтому Router.use
 * патчится ДО импорта приложения и запоминает «роутер → путь маунта».
 */
const routerModule = await import('router');
const Router: any = (routerModule as any).default ?? routerModule;

const mountPaths = new WeakMap<object, string>();
const origUse = Router.prototype.use;
Router.prototype.use = function patchedUse(...args: any[]) {
   if (typeof args[0] === 'string') {
      for (const handler of args.slice(1).flat(Infinity)) {
         if (typeof handler === 'function') {
            mountPaths.set(handler, args[0]);
         }
      }
   }
   return origUse.apply(this, args);
};

const { app } = await import('../../src/main');
const { default: User, UserRole } = await import('../../src/user/models/User');
const { default: Admin } = await import('../../src/admin/auth/models/Admin');
const { loginUser } = await import('../auth/test-helpers');

interface RouteInfo {
   method: string;
   path: string;
}

const joinPaths = (prefix: string, tail: string): string => {
   const p = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
   const t = tail === '/' ? '' : tail;
   return `${p}${t}` || '/';
};

const collectRoutes = (stack: any[], prefix: string, out: RouteInfo[]) => {
   for (const layer of stack) {
      if (layer.route) {
         for (const m of Object.keys(layer.route.methods)) {
            if (m === '_all') continue;
            out.push({ method: m, path: joinPaths(prefix, layer.route.path) });
         }
      } else if (layer.name === 'router' && layer.handle?.stack) {
         const mounted = mountPaths.get(layer.handle) ?? '';
         collectRoutes(layer.handle.stack, joinPaths(prefix, mounted), out);
      }
   }
};

export const listAppRoutes = (): RouteInfo[] => {
   const out: RouteInfo[] = [];
   const root = (app as any).router ?? (app as any)._router;
   collectRoutes(root.stack, '', out);
   return out;
};

// undefined = запрос вовсе без тела (без Content-Type): в Express 5 при этом
// req.body === undefined, и голая деструктуризация в контроллере даёт 500
const GARBAGE_BODIES = [undefined, {}, { a: 1 }];

describe('Смоук: мусорный вход на все роуты', () => {
   it('ни один роут не отвечает 500 на мусор', async () => {
      const passengerPhone = '+998990000001';
      const driverPhone = '+998990000002';

      await User.create({
         firstName: 'Smoke',
         lastName: 'Passenger',
         phoneNumber: passengerPhone,
         role: UserRole.Passenger,
         verified: true,
      } as any);
      await User.create({
         firstName: 'Smoke',
         lastName: 'Driver',
         phoneNumber: driverPhone,
         role: UserRole.Driver,
         verified: true,
      } as any);
      const passengerToken = await loginUser(passengerPhone);
      const driverToken = await loginUser(driverPhone);

      await Admin.create({
         email: 'smoke@yoldosh.uz',
         password: 'Smoke-Pass-123',
         firstName: 'Smoke',
         lastName: 'Admin',
         role: 'SuperAdmin',
      } as any);
      const adminLogin = await request(app)
         .post('/api/v1/admin/login')
         .send({ email: 'smoke@yoldosh.uz', password: 'Smoke-Pass-123' });
      expect(adminLogin.status).toBe(200);
      const adminToken: string = adminLogin.body.data.accessToken;

      const routes = listAppRoutes();
      if (process.env.SMOKE_DUMP_ROUTES) {
         const { writeFileSync } = await import('node:fs');
         writeFileSync(
            process.env.SMOKE_DUMP_ROUTES,
            routes.map((r) => `${r.method.toUpperCase()} ${r.path}`).join('\n'),
         );
      }
      expect(routes.length).toBeGreaterThan(100);

      const failures: string[] = [];

      for (const route of routes) {
         const url =
            route.path.replace(/:[^/]+/g, 'abc') +
            (route.method === 'get' ? '?limit=abc&page=abc' : '');

         const tokens = url.includes('/admin')
            ? [adminToken]
            : [passengerToken, driverToken];

         for (const token of tokens) {
            const bodies: Array<Record<string, unknown> | undefined> =
               route.method === 'get' ? [undefined] : GARBAGE_BODIES;

            for (const body of bodies) {
               let req = (request(app) as any)
                  [route.method](url)
                  .set('Authorization', `Bearer ${token}`);
               if (body !== undefined) {
                  req = req.send(body);
               }
               const res = await req;
               // 503 допустим: «внешний сервис недоступен» — честный ответ
               // (в тестовой среде IPAK/Яндекс всегда недоступны)
               if (res.status >= 500 && res.status !== 503) {
                  failures.push(
                     `${route.method.toUpperCase()} ${url} -> ${res.status} (body=${JSON.stringify(body)})`,
                  );
               }
            }
         }
      }

      const unique = [...new Set(failures)];
      expect(unique, `Роуты с 500 на мусор:\n${unique.join('\n')}`).toEqual([]);
   }, 300_000);
});
