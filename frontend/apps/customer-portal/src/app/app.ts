import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmHostComponent } from '@wayel/shared/components/confirm-host.component';
import { ToastHostComponent } from '@wayel/shared/components/toast-host.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastHostComponent, ConfirmHostComponent],
  template: `
    <router-outlet />
    <nk-toast-host />
    <nk-confirm-host />
  `,
})
export class App {}
