import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import {
  ApplicationConfig,
  LOCALE_ID,
  importProvidersFrom,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { LucideAngularModule, icons } from 'lucide-angular';

import { routes } from './app.routes';

// Sem isso, os pipes de currency/date usam o locale padrão (en-US) por baixo dos panos —
// foi por isso que o saldo apareceu como "R$127.31" em vez de "R$ 127,31".
registerLocaleData(localePt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    importProvidersFrom(LucideAngularModule.pick(icons)),
    { provide: LOCALE_ID, useValue: 'pt-BR' }
  ]
};
