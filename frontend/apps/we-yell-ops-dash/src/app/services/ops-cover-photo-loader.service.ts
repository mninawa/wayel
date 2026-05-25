import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ReceivingApiService } from './receiving-api.service';
import { buildOpsHeaders } from './ops-request-headers';

/** Loads authenticated ops parcel photo blobs as object URLs for Kanban covers. */
@Injectable({ providedIn: 'root' })
export class OpsCoverPhotoLoaderService {
  private readonly http = inject(HttpClient);
  private readonly receivingApi = inject(ReceivingApiService);

  /** Normalizes GUID strings so map lookups stay stable across API casing. */
  normalizePhotoId(photoId: string | null | undefined): string | null {
    const trimmed = photoId?.trim();
    return trimmed ? trimmed.toLowerCase() : null;
  }

  /**
   * Fetches cover images for the given photo ids.
   * Returns a cleanup function that revokes created object URLs.
   */
  load(
    photoIds: Iterable<string | null | undefined>,
    onLoaded: (urls: Record<string, string>) => void,
  ): () => void {
    const ids = [
      ...new Set(
        [...photoIds]
          .map((id) => this.normalizePhotoId(id))
          .filter((id): id is string => !!id),
      ),
    ];

    const objectUrls: string[] = [];
    const loaded: Record<string, string> = {};

    if (ids.length === 0) {
      onLoaded({});
      return () => undefined;
    }

    for (const photoId of ids) {
      this.http
        .get(this.receivingApi.photoFileUrl(photoId, ''), {
          headers: buildOpsHeaders(),
          responseType: 'blob',
        })
        .subscribe({
          next: (blob) => {
            if (blob.size === 0) {
              return;
            }
            const url = URL.createObjectURL(blob);
            objectUrls.push(url);
            loaded[photoId] = url;
            onLoaded({ ...loaded });
          },
        });
    }

    return () => {
      for (const url of objectUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }
}
