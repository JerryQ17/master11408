import type { Bindings } from './env';
import type { createAuth } from './auth';

export type AuthSession = ReturnType<typeof createAuth>['$Infer']['Session'];
export interface AppEnv {
  Bindings: Bindings;
  Variables: { user: AuthSession['user']; session: AuthSession['session'] };
}
