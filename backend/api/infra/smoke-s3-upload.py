#!/usr/bin/env python3
"""
End-to-end S3 upload smoke test.

Walks the same three-step flow the SPA will follow:

  1. Mint a SuperAdmin JWT locally (HS256, signed with JWT_SIGNING_KEY).
  2. POST /api/v1/media/upload-tickets to get a presigned PUT URL.
  3. PUT the bytes against the presigned URL with the SSE header.
  4. HEAD the persisted CloudFront URL to confirm CloudFront -> S3 round-trip.
  5. aws s3 ls the resulting prefix to confirm the object key shape.

Run from backend/api:
    python3 infra/smoke-s3-upload.py
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import subprocess
import sys
import time
import urllib.request
import uuid
from pathlib import Path


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")


def load_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        out[k.strip()] = v.split("#", 1)[0].strip()
    return out


def mint_jwt(signing_key: str, *, sub: str, email: str, name: str, role: str,
             tenant_id: str | None, issuer: str, audience: str,
             ttl_seconds: int = 600) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload: dict[str, object] = {
        "iss": issuer,
        "aud": audience,
        "sub": sub,
        "email": email,
        "name": name,
        "role": role,
        "jti": uuid.uuid4().hex,
        "nbf": now,
        "iat": now,
        "exp": now + ttl_seconds,
    }
    if tenant_id is not None:
        payload["tid"] = tenant_id

    h = b64url(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    p = b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{h}.{p}".encode("ascii")
    sig = hmac.new(signing_key.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{h}.{p}.{b64url(sig)}"


def http(req: urllib.request.Request) -> tuple[int, dict[str, str], bytes]:
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), e.read()


def main() -> int:
    here = Path(__file__).resolve().parent.parent
    env = load_env(here / ".env")

    api_base = os.environ.get("API_BASE", "http://localhost:5099")
    tenant_id = os.environ.get("TENANT_ID", "019dba00-0000-7000-9000-000000000001")
    super_admin_id = os.environ.get(
        "SUPER_ADMIN_ID", "019db04c-10a1-72dc-abe1-61764b61702e"
    )
    super_admin_email = os.environ.get("SUPER_ADMIN_EMAIL", "mninawa@gmail.com")
    child_id = os.environ.get("CHILD_ID", "8fe41f6c-8920-466d-b252-273076a0880a")
    bucket = env["MEDIA_STORAGE_BUCKET"]
    cdn_host = env["MEDIA_STORAGE_CDN_HOST"]

    print(f"[smoke] api={api_base} bucket={bucket} cdn={cdn_host} tenant={tenant_id}")

    token = mint_jwt(
        env["JWT_SIGNING_KEY"],
        sub=super_admin_id,
        email=super_admin_email,
        name="Smoke Test SuperAdmin",
        role="SuperAdmin",
        tenant_id=None,
        issuer="wayel-api",
        audience="wayel-clients",
    )
    print(f"[smoke] minted JWT (len={len(token)})")

    body = json.dumps({
        "contentType": "image/png",
        "fileName": "smoke-test.png",
        "scope": "daily-reports",
        "ttlSeconds": 300,
        "ownerType": "Child",
        "ownerId": child_id,
    }).encode("utf-8")

    ticket_url = f"{api_base}/api/v1/media/upload-tickets?tenantId={tenant_id}"
    req = urllib.request.Request(
        ticket_url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    code, _, payload = http(req)
    print(f"[smoke] POST /upload-tickets -> {code}")
    if code != 200:
        print(payload.decode("utf-8", errors="replace"))
        return 2
    ticket = json.loads(payload)
    print(f"[smoke]   mediaId    = {ticket['mediaId']}")
    print(f"[smoke]   mediaUrl   = {ticket['mediaUrl']}")
    print(f"[smoke]   uploadUrl  = {ticket['uploadUrl'][:100]}...")
    print(f"[smoke]   headers    = {ticket['headers']}")

    # 1x1 transparent PNG.
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
        "890000000d49444154789c63600100000005000136fc6c6e0000000049454e44ae426082"
    )
    put = urllib.request.Request(
        ticket["uploadUrl"],
        data=png,
        method="PUT",
        headers={**ticket["headers"], "Content-Length": str(len(png))},
    )
    code, headers, payload = http(put)
    print(f"[smoke] PUT presigned url -> {code} (etag={headers.get('ETag', '?')})")
    if code not in (200, 204):
        print(payload.decode("utf-8", errors="replace")[:500])
        return 3

    # mediaUrl -> CloudFront
    head = urllib.request.Request(ticket["mediaUrl"], method="HEAD")
    code, headers, _ = http(head)
    print(f"[smoke] HEAD {ticket['mediaUrl']} -> {code} (ct={headers.get('Content-Type','?')}, len={headers.get('Content-Length','?')})")

    # Confirm key shape on the bucket itself.
    prefix = f"{tenant_id}/daily-reports/Child/{child_id}/"
    print(f"[smoke] aws s3 ls s3://{bucket}/{prefix}")
    subprocess.run(
        ["aws", "s3", "ls", f"s3://{bucket}/{prefix}"],
        check=False,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
