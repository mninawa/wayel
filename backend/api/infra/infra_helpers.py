"""Shared helpers for the infra/* one-shot scripts (smoke + migrator)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
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


def mint_jwt(
    signing_key: str,
    *,
    sub: str,
    email: str,
    name: str,
    role: str,
    tenant_id: str | None,
    issuer: str = "wayel-api",
    audience: str = "wayel-clients",
    ttl_seconds: int = 600,
) -> str:
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


def mint_super_admin_jwt(signing_key: str) -> str:
    """Mint a SuperAdmin JWT for the seeded mninawa@gmail.com account."""
    return mint_jwt(
        signing_key,
        sub="019db04c-10a1-72dc-abe1-61764b61702e",
        email="mninawa@gmail.com",
        name="Backfill SuperAdmin",
        role="SuperAdmin",
        tenant_id=None,
        ttl_seconds=1200,
    )
