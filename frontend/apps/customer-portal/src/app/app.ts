import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConnectivityBannerComponent } from '@wayel/shared/components/connectivity-banner.component';
import { ConfirmHostComponent } from '@wayel/shared/components/confirm-host.component';
import { ToastHostComponent } from '@wayel/shared/components/toast-host.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    ConnectivityBannerComponent,
    ToastHostComponent,
    ConfirmHostComponent,
  ],
  template: `
    <nk-connectivity-banner />
    <router-outlet />
    <nk-toast-host />
    <nk-confirm-host />
  `,
})
export class App {}
