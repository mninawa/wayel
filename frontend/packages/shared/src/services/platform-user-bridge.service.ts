import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '@app/environment';
import type { Phase0ListUsersQuery } from '../core/contracts/platform-users.phase0';
import type { MockPlatformUser } from '../core/mock/mock-data';
import { MockPlatformUserService } from './mock-platform-user.service';
import { PlatformUserApiService } from './platform-user-api.service';
import { phase0UserDtoToMock } from './platform-user-mappers';

/** Paged user list — shape mirrors `PlatformTenantListResult`. */
export interface PlatformUserListResult {
  items: MockPlatformUser[];
  totalCount: number;
  page: number;
  pageSize: number;
}

function filterMockUsers(rows: MockPlatformUser[], q: Phase0ListUsersQuery): MockPlatformUser[] {
  const s = q.search?.trim().toLowerCase();
  if (!s) return rows;
  return rows.filter((u) =>
    [u.email, u.displayName, u.role, u.homeTenantName ?? '']
      .join(' ')
      .toLowerCase()
      .includes(s),
  );
}

@Injectable({ providedIn: 'root' })
export class PlatformUserBridgeService {
  private readonly mock = inject(MockPlatformUserService);
  private readonly api = inject(PlatformUserApiService);

  /**
   * @param query Defaults: `page=1`, `pageSize=20`.
   */
  loadUsers(query: Phase0ListUsersQuery = {}): Observable<PlatformUserListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const q: Phase0ListUsersQuery = { ...query, page, pageSize };

    if (environment.useMock) {
      const filtered = filterMockUsers([...this.mock.users()], q);
      const totalCount = filtered.length;
      const start = (page - 1) * pageSize;
      const items = filtered.slice(start, start + pageSize);
      return of({ items, totalCount, page, pageSize });
    }
    return this.api.listUsers(q).pipe(
      map((r) => ({
        items: r.items.map(phase0UserDtoToMock),
        totalCount: r.totalCount,
        page: r.page,
        pageSize: r.pageSize,
      })),
    );
  }

  getUser(id: string): Observable<MockPlatformUser | undefined> {
    if (environment.useMock) {
      return of(this.mock.getById(id));
    }
    return this.api.getUser(id).pipe(
      map(phase0UserDtoToMock),
      catchError(() => of(undefined)),
    );
  }
}
