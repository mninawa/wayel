import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, switchMap, throwError } from 'rxjs';
import { from } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildOpsHeaders } from './ops-request-headers';
import type { OpsPhotoDto } from './receiving-api.service';

export interface OpsPhotoUploadTicketDto {
  photoId: string;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  expiresAtUtc: string;
}

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable({ providedIn: 'root' })
export class OpsParcelPhotoUploadService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/borderbox/ops/receiving`;

  upload(
    parcelId: string,
    category: 'INTAKE' | 'INSPECTION',
    file: File,
    opsKeyOrToken: string,
  ): Observable<OpsPhotoDto> {
    const contentType = this.resolveContentType(file);
    const validationError = this.validate(file, contentType);
    if (validationError) {
      return throwError(() => new Error(validationError));
    }

    const headers = buildOpsHeaders(opsKeyOrToken);
    const fileName = file.name?.trim() || 'photo.jpg';
    const ticketBody = {
      category,
      fileName,
      contentType,
      sizeBytes: file.size,
    };

    return this.http
      .post<OpsPhotoUploadTicketDto>(`${this.base}/parcels/${parcelId}/photos/upload-ticket`, ticketBody, {
        headers,
      })
      .pipe(
        switchMap((ticket) =>
          from(this.putBytes(ticket, file, contentType, opsKeyOrToken)).pipe(switchMap(() => [ticket])),
        ),
        switchMap((ticket) =>
          this.http.post<OpsPhotoDto>(
            `${this.base}/parcels/${parcelId}/photos/confirm`,
            {
              photoId: ticket.photoId,
              category,
              fileName,
              contentType,
              sizeBytes: file.size,
            },
            { headers },
          ),
        ),
      );
  }

  private async putBytes(
    ticket: OpsPhotoUploadTicketDto,
    file: File,
    contentType: string,
    opsKeyOrToken: string,
  ): Promise<void> {
    const uploadHeaders = { ...(ticket.uploadHeaders ?? {}) };
    uploadHeaders['Content-Type'] ??= contentType;

    if (ticket.uploadUrl.startsWith('/')) {
      let headers = buildOpsHeaders(opsKeyOrToken);
      for (const [key, value] of Object.entries(uploadHeaders)) {
        headers = headers.set(key, value);
      }
      await firstValueFrom(
        this.http.put(ticket.uploadUrl, file, {
          headers,
          responseType: 'text',
        }),
      );
      return;
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(uploadHeaders)) {
      headers.set(key, value);
    }

    const response = await fetch(ticket.uploadUrl, { method: 'PUT', body: file, headers });
    if (!response.ok) {
      throw new Error('Photo upload failed while sending bytes to storage.');
    }
  }

  private resolveContentType(file: File): string {
    const type = file.type?.trim().toLowerCase();
    if (type && type !== 'application/octet-stream') {
      return type;
    }

    const name = file.name.toLowerCase();
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  private validate(file: File, contentType: string): string | null {
    if (!file.size) {
      return 'Choose a photo to upload.';
    }
    if (file.size > MAX_BYTES) {
      return 'Photo must be under 12 MB.';
    }
    if (!ALLOWED_TYPES.has(contentType)) {
      return 'Photo must be JPEG, PNG, or WebP.';
    }
    return null;
  }
}

export function opsPhotoUploadError(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === 'object' && err !== null) {
    const body = (err as { error?: { detail?: string; title?: string } }).error;
    if (body?.detail) return body.detail;
    if (body?.title) return body.title;
  }
  return 'Photo upload failed.';
}
