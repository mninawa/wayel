import { Injectable, computed, signal } from '@angular/core';
import { MOCK_PLATFORM_USERS, MockPlatformUser } from '../core/mock/mock-data';

@Injectable({ providedIn: 'root' })
export class MockPlatformUserService {
  private readonly _users = signal<MockPlatformUser[]>([...MOCK_PLATFORM_USERS]);

  readonly users = this._users.asReadonly();

  readonly activeCount = computed(() => this._users().filter((u) => u.status === 'active').length);

  getById(id: string): MockPlatformUser | undefined {
    return this._users().find((u) => u.id === id);
  }
}
