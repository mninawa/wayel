import { HttpHeaders } from '@angular/common/http';
import { getStoredOpsActor, getStoredOpsKey } from './ops-api-key';
import { getStoredOpsToken } from './ops-auth-storage';

export function buildOpsHeaders(fallbackKey = ''): HttpHeaders {
  const bearer = getStoredOpsToken();
  if (bearer) {
    return new HttpHeaders({ Authorization: `Bearer ${bearer}` });
  }

  const key = fallbackKey.trim() || getStoredOpsKey() || '';
  let headers = new HttpHeaders({ 'X-Wayel-Ops-Key': key });
  const actor = getStoredOpsActor();
  if (actor) {
    headers = headers.set('X-Wayel-Ops-Actor', actor);
  }
  return headers;
}
