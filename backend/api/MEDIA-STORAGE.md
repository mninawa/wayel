# Media storage (S3)

The Wayel API stores all binary assets (daily-report photos, child
documents, tenant branding, parent vault uploads, …) in **AWS S3**, with
**CloudFront** in front for the read path. This document describes the
key layout, the env vars that wire the SDK, and the AWS-side
prerequisites (bucket, IAM, CORS).

## Key layout

Every uploaded object lives at:

```
s3://{bucket}/{tenantId}/{scope}/{ownerType}/{ownerId}/{guid}.{ext}
```

| Segment      | Source                                                                 |
| ------------ | ---------------------------------------------------------------------- |
| `tenantId`   | `EffectiveTenant.Resolve(currentUser, ?tenantId=)` — never trust input; for **personal** parent-vault uploads the SuperAdmin tooling may pass the parent's `OwnerUserId` in the tenant slot so keys stay `{userId}/{scope}/…` portable across institutions (see infra script `infra/materialise-placeholders.py`). |
| `scope`      | `MediaStorageOptions.Scopes` key (e.g. `daily-reports`, `documents`)   |
| `ownerType`  | `MediaAssetOwnerType` (`Tenant` / `Child` / `Parent` / `User`)         |
| `ownerId`    | The owning aggregate id (Child id, Parent id, User id, Tenant id)      |
| `guid`       | Per-upload random GUID — re-uploads always mint a new key              |
| `ext`        | Inferred from the file name first, then from the `Content-Type`        |

When the SPA uploads a file without owner context (legacy call sites),
the key falls back to the flat shape `{tenantId}/{scope}/{guid}.{ext}`.
Every new call site should pass owner info — see
`WayelAdminMediaService.uploadFile({ owner })`.

The CDN read URL persisted on aggregates is just
`https://{CdnHost}/{key}` so it survives ticket expiry, key churn, and
bucket migrations.

## Scopes and what each one accepts

Defined in `MediaStorageOptions.Scopes` (Infrastructure layer):

| Scope          | Allowed MIME types                                            | Max size |
| -------------- | ------------------------------------------------------------- | -------- |
| `daily-reports`| Image, Video, Audio, Document (PDF)                           | 50 MB    |
| `branding`     | Image + SVG/ICO overlay                                       |  4 MB    |
| `avatars`      | Raster image **+ SVG** (`ExtraContentTypes` — generative avatar services often serve SVG) |  4 MB    |
| `memories`     | Image, Video                                                  | 25 MB    |
| `documents`    | Image, Document (PDF) — generic per-child / per-tenant vault  | 25 MB    |

Adding a new MIME to an existing scope is usually a one-line change to
the scope's `AllowedKinds` or `ExtraContentTypes`. Adding a new scope
means a new entry in the dictionary plus an audit-log action constant.

## Configuration (env vars)

All values are bound from configuration; the recommended path is env
vars (compose forwards them from `.env`):

| Env var                          | Maps to                                | Notes                                                  |
| -------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| `MEDIA_STORAGE_PROVIDER`         | `MediaStorage:Provider`                | `s3` (default) or `in-memory`                          |
| `MEDIA_STORAGE_REGION`           | `MediaStorage:Region`                  | e.g. `eu-west-1`                                       |
| `MEDIA_STORAGE_BUCKET`           | `MediaStorage:BucketName`              | The bucket bytes get written to                        |
| `MEDIA_STORAGE_CDN_HOST`         | `MediaStorage:CdnHost`                 | CloudFront host (or the bucket regional endpoint)      |
| `MEDIA_STORAGE_ENVIRONMENT`      | `MediaStorage:Environment`             | Token used in `BucketTemplate`. Defaults to `dev`.     |
| `MEDIA_STORAGE_SERVICE_URL`      | `MediaStorage:ServiceUrlOverride`      | Set for LocalStack / MinIO. Leave blank for AWS.       |
| `MEDIA_STORAGE_FORCE_PATH_STYLE` | `MediaStorage:ForcePathStyle`          | `true` when ServiceUrl is set. `false` otherwise.      |
| `AWS_ACCESS_KEY_ID`              | (SDK chain)                            | Dev IAM user key                                       |
| `AWS_SECRET_ACCESS_KEY`          | (SDK chain)                            | Dev IAM user secret                                    |
| `AWS_REGION`                     | (SDK chain)                            | Optional — falls back to `MEDIA_STORAGE_REGION`        |

Credentials resolve via the standard AWS SDK chain (env vars take
precedence, then the shared profile in `~/.aws/credentials`, then
EC2/ECS/EKS instance roles). We never accept inline access keys in
`appsettings.json`.

The `S3MediaStorage` backend throws a clear `InvalidOperationException`
at first upload if `Region` / `BucketName` / `CdnHost` are missing —
silent misconfiguration is rejected by design.

## AWS prerequisites

The bucket (`nestiq-kids-platform` in dev/staging), its IAM policy,
its CORS rules, default SSE-S3 encryption, and the CloudFront
distribution are all provisioned out-of-band (infra repo). This
service expects:

* `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` granted to the
  identity the SDK chain resolves (developer profile, EC2/ECS/EKS
  role, etc.).
* CORS that allows `PUT` + `GET` from the four SPA origins
  (4200–4203 in dev, the prod hosts in prod).
* Default bucket encryption set to SSE-S3. The API also stamps
  `x-amz-server-side-encryption: AES256` on every presigned `PUT` as
  defence-in-depth.

The `MEDIA_STORAGE_CDN_HOST` env var must point at the CloudFront
distribution domain (or, for dev, the bucket's regional endpoint).

## Falling back to in-memory

Contributors who don't have an AWS account yet can opt out:

```bash
# backend/api/.env
MEDIA_STORAGE_PROVIDER=in-memory
```

Bytes then live in the API process. The dev API serves them back from
`/api/v1/media/{**key}` so the SPA preview thumbnails keep working. The
key shape is identical to S3 so flipping back to `s3` later is a config
change, not a code change.
