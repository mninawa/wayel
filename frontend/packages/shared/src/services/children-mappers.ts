import type { Phase0ChildDto } from '../core/contracts/children.phase0';
import type { MockChildRow } from '../core/mock/mock-data';

/** Phase 0 DTO uses the same field names as the legacy mock — keep the UI stable. */
export function phase0ChildDtoToMock(dto: Phase0ChildDto): MockChildRow {
  return {
    id: dto.id,
    displayName: dto.displayName,
    dateOfBirth: dto.dateOfBirth,
    guardianNames: [...dto.guardianNames],
    membershipState: dto.membershipState,
    otherSubscriptionsCount: dto.otherSubscriptionsCount ?? 0,
  };
}
