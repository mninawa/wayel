import { Component } from '@angular/core';
import { OpsShellComponent } from './layout/ops-shell.component';

@Component({
  selector: 'ops-root',
  standalone: true,
  imports: [OpsShellComponent],
  template: `<ops-shell />`,
})
export class AppComponent {}
