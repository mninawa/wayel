import type { MockPlatformUser } from '../core/mock/mock-data';
import type { Phase0PlatformUserDto } from '../core/contracts/platform-users.phase0';

export function phase0UserDtoToMock(d: Phase0PlatformUserDto): MockPlatformUser {
  return {
    id: d.id,
    email: d.email,
    displayName: d.displayName,
    role: d.role,
    homeTenantId: d.homeTenantId,
    homeTenantName: d.homeTenantName,
    status: d.status,
    lastLoginAt: d.lastLoginAt,
    createdAt: d.createdAt,
  };
}
