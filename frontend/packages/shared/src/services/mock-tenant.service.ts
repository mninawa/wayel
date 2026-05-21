import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { MOCK_TENANT_SETTINGS, MockTenantSettings } from '../core/mock/mock-data';

@Injectable({ providedIn: 'root' })
export class MockTenantService {
  getSettings(): Observable<MockTenantSettings> {
    return of({ ...MOCK_TENANT_SETTINGS }).pipe(delay(120));
  }
}
