#!/usr/bin/env python3
"""
One-shot migrator: rewrite every external placeholder image URL in the
live Mongo DB into an S3 asset served from CloudFront.

For each match:

  1. Download the original bytes from the external host.
  2. Mint an upload ticket via POST /api/v1/media/upload-tickets so
     the resulting key follows the canonical
     {tenantId}/{scope}/{ownerType}/{ownerId}/{guid}.{ext} shape.
  3. PUT the bytes against the presigned URL with SSE-S3.
  4. Mongo $set the document field with the new CloudFront URL so the
     SPA renders the migrated asset on next read.

Idempotent: only acts on URLs whose host is in PLACEHOLDER_HOSTS, so
re-running skips already-migrated documents.

Scope of this run:

    daily_reports.media[].url      (picsum.photos  -> S3 / {tenantId}/daily-reports/Child)
    tenants.profile.imageUrl       (picsum.photos  -> S3 / {tenantId}/branding/Tenant)
    parents.children[].photoUrl    (api.dicebear   -> S3 / {ownerUserId}/avatars/Child)
    memories.photos[]              (picsum.photos  -> S3 / {ownerUserId}/memories/Child)

The parent/memory aggregates have no tenantId because they are personal
to a parent. We use the parent's OwnerUserId as the namespace prefix so
the parent owns their entire vault and stays portable across institutions.

Run from backend/api with the same .env compose uses:

    python3 infra/materialise-placeholders.py [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
import uuid
from pathlib import Path

from infra_helpers import load_env, mint_super_admin_jwt  # type: ignore

PLACEHOLDER_HOSTS = {"picsum.photos", "api.dicebear.com", "i.pravatar.cc"}

CONTENT_TYPE_BY_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
}


def is_placeholder(url: str | None) -> bool:
    if not isinstance(url, str) or not url:
        return False
    try:
        host = url.split("://", 1)[1].split("/", 1)[0].split("?", 1)[0].lower()
    except IndexError:
        return False
    return host in PLACEHOLDER_HOSTS


def infer_content_type(url: str, body_head: bytes) -> str:
    # Picsum redirects to a *.jpg, dicebear serves SVG. Trust the
    # response Content-Type at fetch time; this helper is the URL-only
    # fallback used when we haven't downloaded yet (for size policy
    # negotiation we cap at infer-by-host).
    if "dicebear.com" in url:
        return "image/svg+xml"
    if body_head.startswith(b"\x89PNG"):
        return "image/png"
    if body_head.startswith(b"GIF8"):
        return "image/gif"
    if body_head.startswith(b"<svg") or body_head.startswith(b"<?xml"):
        return "image/svg+xml"
    return "image/jpeg"  # picsum default


def fetch_bytes(url: str) -> tuple[bytes, str]:
    # picsum 302s through to a CDN; urllib follows redirects by default.
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "wayel-placeholder-migrator/1.0"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read()
        ct = resp.headers.get("Content-Type", "").split(";", 1)[0].strip()
    if not ct:
        ct = infer_content_type(url, body[:16])
    # Normalise jpg
    if ct == "image/jpg":
        ct = "image/jpeg"
    return body, ct


def post_json(url: str, body: dict, headers: dict) -> tuple[int, dict | bytes]:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={**headers, "Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def put_bytes(url: str, body: bytes, headers: dict) -> int:
    req = urllib.request.Request(
        url,
        data=body,
        method="PUT",
        headers={**headers, "Content-Length": str(len(body))},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"PUT {url[:120]}... -> {e.code}\n{e.read().decode('utf-8', errors='replace')[:500]}\n")
        return e.code


def fmt_guid(b) -> str:
    """Convert a Binary/UUID/str to a 36-char dashed Guid string."""
    if isinstance(b, uuid.UUID):
        return str(b)
    if hasattr(b, "as_uuid"):
        try:
            return str(b.as_uuid())
        except Exception:
            pass
    if isinstance(b, str):
        return str(uuid.UUID(b))
    raw = bytes(b)
    return str(uuid.UUID(bytes=raw))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="report what would change without uploading or writing")
    ap.add_argument("--limit", type=int, default=0, help="cap items per collection for testing (0 = no cap)")
    args = ap.parse_args()

    here = Path(__file__).resolve().parent.parent
    env = load_env(here / ".env")
    api_base = os.environ.get("API_BASE", "http://localhost:5099")

    try:
        from pymongo import MongoClient
        from bson.binary import UuidRepresentation
    except ImportError:
        print("ERR: pymongo missing. pip install 'pymongo[srv]'", file=sys.stderr)
        return 7

    client = MongoClient(env["MONGO_CONNECTION_STRING"], uuidRepresentation="standard")
    db = client[env.get("MONGO_DATABASE_NAME", "wayel")]

    token = mint_super_admin_jwt(env["JWT_SIGNING_KEY"])
    auth_header = {"Authorization": f"Bearer {token}"}
    print(f"[migrate] minted SuperAdmin JWT (len={len(token)}); api={api_base}")

    counters = {"scanned": 0, "migrated": 0, "skipped_already_s3": 0, "errors": 0}

    def migrate_one(*, tenant_id: str, scope: str, owner_type: str, owner_id: str,
                    source_url: str, suggested_name: str) -> str | None:
        """Returns new CloudFront URL on success, or None on failure (counters updated)."""
        try:
            body, ct = fetch_bytes(source_url)
        except Exception as e:
            print(f"  ! fetch FAILED for {source_url[:80]}: {e}")
            counters["errors"] += 1
            return None

        ext = ".svg" if ct == "image/svg+xml" else ".jpg" if ct == "image/jpeg" else ".png" if ct == "image/png" else ""
        ticket_url = f"{api_base}/api/v1/media/upload-tickets?tenantId={tenant_id}"
        ticket_body = {
            "contentType": ct,
            "fileName": f"{suggested_name}{ext}",
            "scope": scope,
            "ttlSeconds": 600,
            "sizeBytes": len(body),
            "ownerType": owner_type,
            "ownerId": owner_id,
        }

        if args.dry_run:
            print(f"  [dry] would POST ticket scope={scope} owner=({owner_type},{owner_id}) bytes={len(body)} ct={ct}")
            return f"https://{env['MEDIA_STORAGE_CDN_HOST']}/<dryrun>"

        code, ticket = post_json(ticket_url, ticket_body, auth_header)
        if code != 200 or not isinstance(ticket, dict):
            print(f"  ! ticket FAILED ({code}): {ticket}")
            counters["errors"] += 1
            return None

        put_code = put_bytes(ticket["uploadUrl"], body, ticket["headers"])
        if put_code not in (200, 204):
            counters["errors"] += 1
            return None

        return ticket["mediaUrl"]

    # ── 1) daily_reports.media[].url ────────────────────────────────────────
    print("\n=== daily_reports.media[].url ===")
    q = {"media.url": {"$regex": "|".join(PLACEHOLDER_HOSTS), "$options": "i"}}
    cur = db.daily_reports.find(q)
    if args.limit:
        cur = cur.limit(args.limit)
    for doc in cur:
        tenant_id = fmt_guid(doc["tenantId"])
        child_id = fmt_guid(doc["childId"])
        media = doc.get("media", []) or []
        any_changed = False
        new_media = []
        for m in media:
            url = m.get("url")
            counters["scanned"] += 1
            if not is_placeholder(url):
                if url and "cloudfront.net" in url:
                    counters["skipped_already_s3"] += 1
                new_media.append(m)
                continue
            print(f"  daily_report {doc['_id']!r:>32} media={m.get('_id')} tenant={tenant_id[:8]} child={child_id[:8]}")
            new_url = migrate_one(
                tenant_id=tenant_id,
                scope="daily-reports",
                owner_type="Child",
                owner_id=child_id,
                source_url=url,
                suggested_name=m.get("_id", "asset"),
            )
            if new_url is None:
                new_media.append(m)
                continue
            new_media.append({**m, "url": new_url})
            any_changed = True
            counters["migrated"] += 1
        if any_changed and not args.dry_run:
            db.daily_reports.update_one({"_id": doc["_id"]}, {"$set": {"media": new_media}})

    # ── 2) tenants.profile.imageUrl ─────────────────────────────────────────
    print("\n=== tenants.profile.imageUrl ===")
    q = {"profile.imageUrl": {"$regex": "|".join(PLACEHOLDER_HOSTS), "$options": "i"}}
    cur = db.tenants.find(q)
    if args.limit:
        cur = cur.limit(args.limit)
    for doc in cur:
        tenant_id = fmt_guid(doc["_id"])
        url = (doc.get("profile") or {}).get("imageUrl")
        counters["scanned"] += 1
        if not is_placeholder(url):
            continue
        print(f"  tenant {tenant_id[:8]} ({doc.get('slug', '?')}) -> migrate profile.imageUrl")
        new_url = migrate_one(
            tenant_id=tenant_id,
            scope="branding",
            owner_type="Tenant",
            owner_id=tenant_id,
            source_url=url,
            suggested_name=doc.get("slug", "tenant-image"),
        )
        if new_url is None:
            continue
        if not args.dry_run:
            db.tenants.update_one({"_id": doc["_id"]}, {"$set": {"profile.imageUrl": new_url}})
        counters["migrated"] += 1

    # ── 3) parents.children[].photoUrl ──────────────────────────────────────
    # Parents have no tenantId (a parent crosses institutions). Use the
    # parent's OwnerUserId as the namespace so the per-parent vault stays
    # portable.
    print("\n=== parents.children[].photoUrl (namespace = ownerUserId) ===")
    q = {"children.photoUrl": {"$regex": "|".join(PLACEHOLDER_HOSTS), "$options": "i"}}
    cur = db.parents.find(q)
    if args.limit:
        cur = cur.limit(args.limit)
    for doc in cur:
        owner_user_id = fmt_guid(doc["ownerUserId"])
        children = doc.get("children", []) or []
        any_changed = False
        new_children = []
        for c in children:
            url = c.get("photoUrl")
            if not is_placeholder(url):
                new_children.append(c)
                continue
            counters["scanned"] += 1
            child_id = fmt_guid(c["_id"])
            print(f"  parent ownerUserId={owner_user_id[:8]} child={c.get('displayName','?')} -> migrate")
            new_url = migrate_one(
                tenant_id=owner_user_id,  # personal vault: tenantId-slot = ownerUserId
                scope="avatars",
                owner_type="Child",
                owner_id=child_id,
                source_url=url,
                suggested_name=f"avatar-{child_id[:8]}",
            )
            if new_url is None:
                new_children.append(c)
                continue
            new_children.append({**c, "photoUrl": new_url})
            any_changed = True
            counters["migrated"] += 1
        if any_changed and not args.dry_run:
            db.parents.update_one({"_id": doc["_id"]}, {"$set": {"children": new_children}})

    # ── 4) memories.photos[] (string list, not document list) ───────────────
    print("\n=== memories.photos[] (namespace = parent.ownerUserId) ===")
    q = {"photos": {"$elemMatch": {"$regex": "|".join(PLACEHOLDER_HOSTS), "$options": "i"}}}
    cur = db.memories.find(q)
    if args.limit:
        cur = cur.limit(args.limit)
    # Cache parentId -> ownerUserId so we don't refetch per memory.
    parent_user_cache: dict[str, str] = {}
    def parent_owner_user(parent_id) -> str | None:
        key = fmt_guid(parent_id)
        if key in parent_user_cache:
            return parent_user_cache[key]
        p = db.parents.find_one({"_id": parent_id}, {"ownerUserId": 1})
        if p is None or "ownerUserId" not in p:
            return None
        parent_user_cache[key] = fmt_guid(p["ownerUserId"])
        return parent_user_cache[key]

    for doc in cur:
        owner_user_id = parent_owner_user(doc["parentId"])
        if owner_user_id is None:
            print(f"  ! memory {doc['_id']!r} has no resolvable parent ownerUserId — skipping")
            counters["errors"] += 1
            continue
        child_id = fmt_guid(doc["parentChildId"])
        photos = doc.get("photos", []) or []
        new_photos: list[str] = []
        any_changed = False
        for i, url in enumerate(photos):
            if not is_placeholder(url):
                new_photos.append(url)
                continue
            counters["scanned"] += 1
            print(f"  memory {doc.get('title','?')!r:<30} child={child_id[:8]} photo[{i}] -> migrate")
            new_url = migrate_one(
                tenant_id=owner_user_id,
                scope="memories",
                owner_type="Child",
                owner_id=child_id,
                source_url=url,
                suggested_name=f"memory-{fmt_guid(doc['_id'])[:8]}-{i}",
            )
            if new_url is None:
                new_photos.append(url)
                continue
            new_photos.append(new_url)
            any_changed = True
            counters["migrated"] += 1
        if any_changed and not args.dry_run:
            db.memories.update_one({"_id": doc["_id"]}, {"$set": {"photos": new_photos}})

    print("\n=== summary ===")
    print(f"  scanned (urls touched):     {counters['scanned']}")
    print(f"  migrated (uploaded + set):  {counters['migrated']}")
    print(f"  already-s3 (skipped):       {counters['skipped_already_s3']}")
    print(f"  errors:                     {counters['errors']}")
    return 0 if counters["errors"] == 0 else 4


if __name__ == "__main__":
    sys.exit(main())
