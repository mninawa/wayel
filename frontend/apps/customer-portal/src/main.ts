import { bootstrapApplication } from '@angular/platform-browser';
import { registerChunkLoadRecovery } from '@wayel/shared/utils/chunk-load-recovery';
import { appConfig } from './app/app.config';
import { App } from './app/app';

registerChunkLoadRecovery();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
