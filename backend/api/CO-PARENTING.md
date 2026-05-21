# Co-parenting (multi-guardian households)

Phase 1 design for letting two (or more) Google-authenticated parents
share a single child profile + receive the same in-app notifications +
push notifications.

> **Status:** design locked, build in progress. Decisions captured here
> are the source of truth; if you find the code disagreeing with this
> doc, this doc lost the argument and should be amended.

## Use case

> "My wife and I co-parent our daughter. She has her Gmail, I have
> mine. We both want to see Charlie's daily reports, upload her
> documents, and get the push when the school posts a new report —
> without sharing a login."

Plus the grandma case:
> "My mum helps with both of my kids' families on different weekdays.
> She wants the same view into both households from one Google login."

## Decisions (locked)

| Question | Decision | Rationale |
|---|---|---|
| Equal members or roles? | **Roles**: `Primary` (the original signer-up) + `CoParent`. | Primary is the only one who can remove others / transfer primary status. Phase-1 simple. |
| Can one User be in multiple households? | **Yes**. | Grandma case. Drives the path-based routing decision below. |
| Email fan-out (SES)? | **No** in Phase 1 — only in-app inbox + FCM push. | Email targeting stays at the Primary's account email; saves the SES template churn until someone complains. |
| Build scope this round | **End-to-end**: domain → API → SSO → SPA → Flutter, in dependency order, one merged chunk at a time. | User chose the maximalist option. |

## Aggregate shape

`Parent` becomes a household. `ParentMember` is a new entity inside
the aggregate (so the per-guardian profile bits — title, ID number,
mobile, financial email — live with the *member*, not the household).

```csharp
public sealed class Parent : AggregateRoot<ParentId>
{
    private readonly Dictionary<UserId, ParentMember> _members;
    private readonly List<ParentChild> _children;

    public IReadOnlyCollection<ParentMember> Members => _members.Values;
    public ParentMember? FindMember(UserId u) => _members.GetValueOrDefault(u);
    public bool IsMember(UserId u) => _members.ContainsKey(u);
    public UserId PrimaryUserId =>
        _members.Values.Single(m => m.Role == ParentRole.Primary).UserId;

    // Membership transitions (all guarded; raise events).
    public Result AddMember(UserId user, Email email, string displayName,
        ParentRole role, DateTime nowUtc);
    public Result RemoveMember(UserId actor, UserId target, DateTime nowUtc);
    public Result TransferPrimary(UserId actor, UserId target, DateTime nowUtc);
}

public sealed class ParentMember : Entity<ParentMemberId>
{
    public UserId UserId { get; }
    public Email Email { get; private set; }
    public string DisplayName { get; private set; }
    public ParentRole Role { get; private set; }
    public GuardianProfile Profile { get; private set; }   // moves down from Parent
    public DateTime JoinedOnUtc { get; }
}

public enum ParentRole { Primary = 1, CoParent = 2 }
```

### Invariants

- A `Parent` always has **exactly one** `Primary`. `RemoveMember` of the
  current Primary fails until `TransferPrimary` has run. `AddMember`
  defaults to `CoParent`.
- A `User` can be a member of N `Parent`s but at most **one** entry per
  Parent. (Index: unique on `(parentId, members.userId)`; multikey on
  `members.userId` for "find my households".)
- `_children` is shared across all members. There's no per-member view.

### Migration from current model

| Today | Tomorrow |
|---|---|
| `Parent.OwnerUserId: UserId` | `Parent._members[OwnerUserId] = ParentMember(role: Primary, profile: <copied>, ...)` |
| `Parent.Email`, `Parent.DisplayName`, `Parent.Phone`, `Parent.Profile` | Move to the single primary `ParentMember`. The aggregate-level `Email`/`DisplayName` fields are dropped (household has no own name; we render "Charlie's family" in UI). |

Backfill is a one-shot Mongo migration: every existing Parent doc gets
a `members: [...]` array with one entry, `Primary`, copying the old
top-level fields. Index swap happens in the same migration.

## Routing (Phase 1: read-only multi-household; Phase 2: full path-based)

> **Phase 1 decision**: full path-based routing (`/me/parents/{parentId}/...`
> for every parent endpoint) is **deferred to Phase 2**. The Mom+Dad
> co-parenting case — both members in the SAME household — works
> perfectly with the existing `/me/parent/...` routes because Chunk 1
> made `IParentRepository.GetByOwnerUserIdAsync` resolve via the
> `members[].userId` multikey path. Dad signs in, asks for `/me/parent`,
> sees the same household Mom does. Identical view; identical inbox;
> identical push.
>
> The grandma-helps-both-families case (one User in N households) is
> the only thing that needs the household id in the path. We add a
> single read endpoint in Phase 1 that lists households the user is a
> member of (so a household picker can render); full per-feature
> path-based routes follow in Phase 2 once we actually have a user
> who's in two households. The aggregate, repository, and notification
> fan-out are already shaped correctly — Phase 2 is purely an API
> ergonomics change.

### Phase 1 (this rollout)

```
GET    /api/v1/me/parents                                # list every household I'm a member of
GET    /api/v1/me/parent                                 # auto-provisioning, returns my primary household
PATCH  /api/v1/me/parent                                 # ... unchanged
POST   /api/v1/me/parent/children                        # ... unchanged
…all existing /me/parent/... routes stay where they are…
```

### Phase 2 (future, when we ship the grandma case)

If/when we want to ship the grandma case, the cleanest path is:

```
# Households (new)
GET    /api/v1/me/parents                                # list my households (id, displayName, role)
GET    /api/v1/me/parents/{parentId}                     # single household + my role in it

# Children (was /me/parent/children/...)
POST   /api/v1/me/parents/{parentId}/children
GET    /api/v1/me/parents/{parentId}/children
PATCH  /api/v1/me/parents/{parentId}/children/{childId}
DELETE /api/v1/me/parents/{parentId}/children/{childId}

# Co-parents (new)
GET    /api/v1/me/parents/{parentId}/co-parents          # members + pending invites
POST   /api/v1/me/parents/{parentId}/co-parents          # invite by email (Primary only)
DELETE /api/v1/me/parents/{parentId}/co-parents/{userId} # remove member (Primary only)
POST   /api/v1/me/parents/{parentId}/co-parents/{userId}/promote-primary

# Co-parent invitation accept (anonymous + post-SSO)
GET    /api/v1/co-parent-invitations/preview?token=...   # AllowAnonymous
POST   /api/v1/co-parent-invitations/accept              # invoked from the SSO flow

# Other parent surfaces (memories, documents, dev reports, subscription requests, daily reports)
# get rebased the same way: /me/parent/... → /me/parents/{parentId}/...
```

Authorization: every `/me/parents/{parentId}/...` endpoint checks
`parent.IsMember(currentUserId)`. Mutating endpoints (invite member,
remove, promote) additionally check
`parent.FindMember(currentUserId).Role == Primary`.

Backwards compat: keep the singular `/me/parent/...` routes alive for
one release, redirecting to the user's "default" household (the first
one they joined) so the existing mobile app and SPA don't break the
moment we deploy. New clients use `/me/parents/{parentId}/...`. The
`/me/parent` shims log a `Deprecated` warning header and disappear in
the next release after both clients have shipped.

## Co-parent invitation flow

Modelled on the existing `StaffInvitation` aggregate.

```csharp
public sealed class CoParentInvitation : AggregateRoot<CoParentInvitationId>
{
    public ParentId ParentId { get; }
    public UserId InvitedByUserId { get; }
    public Email InvitedEmail { get; }
    public string Token { get; }                  // single-use, opaque
    public CoParentInvitationStatus Status { get; private set; }
    public DateTime ExpiresOnUtc { get; }         // 14 days from creation
    public DateTime CreatedOnUtc { get; }
    public DateTime? AcceptedOnUtc { get; private set; }

    public static Result<CoParentInvitation> Issue(...);
    public Result Accept(UserId acceptingUserId, DateTime nowUtc);
    public Result Revoke(UserId actor, DateTime nowUtc);
}
```

Indexes: unique on `Token`; non-unique on `(ParentId, Status)` for
"list pending"; non-unique on `LOWER(InvitedEmail)` for the SSO
admission lookup.

### Walk-through

1. **Mom** (Primary) → external SPA → Settings → Co-parents → "Invite".
2. SPA posts `{ email: "dad@gmail.com", displayName: "Dad" }` to
   `POST /api/v1/me/parents/{parentId}/co-parents`.
3. Server creates `CoParentInvitation` (token, 14-day expiry), sends
   SES email to Dad with a deep-link:
   `https://wayel-external.onrender.com/invitations/co-parent?token=<opaque>`
4. **Dad** clicks the link. External SPA renders the accept page using
   `GET /api/v1/co-parent-invitations/preview?token=...` (AllowAnonymous):
   "Mom invited you to co-parent Charlie at \<household label>. Sign in
   with Google to accept."
5. Dad clicks "Continue with Google" → BFF kicks off OIDC → Google
   round-trip → BFF posts `id_token` to `POST /api/v1/auth/sso/google`
   with `audience: External`.
6. The API's SSO admission policy looks up
   `co-parent-invitation by email, status=Pending, not expired`.
   - **Hit**: admission decision returns `attachToParentId` of the
     existing household. The SSO command handler:
     - Provisions a new `User` for Dad (or finds the existing one if
       he'd already self-signed up).
     - Calls `parent.AddMember(dad.Id, dad.Email, dad.DisplayName,
       ParentRole.CoParent, now)`.
     - Calls `invitation.Accept(dad.Id, now)`.
     - Returns the standard `AuthSession` payload to the BFF.
   - **Miss**: existing self-signup branch (creates a fresh `Parent`
     with Dad as Primary). Backwards compatible.
7. BFF mints its session cookie, redirects to the SPA. From this
   point Dad sees Charlie + reports + memories + documents identically
   to Mom.

### Invite-while-already-a-User edge cases

- Dad already has a Wayel `User` (he self-signed-up earlier). Same flow
  works — the SSO handler just doesn't create a new User; it adds the
  existing one to Mom's household.
- Dad is already in *another* household (he co-parents with his
  ex-wife). Allowed — multi-household is opted in. Mobile/SPA show a
  household picker after sign-in.
- Token is expired or already accepted. Preview endpoint returns 410
  Gone with a friendly explanation; SPA renders "this invite is no
  longer valid".

## Notification fan-out

Every notification handler that today addresses
`recipientUserId: parent.OwnerUserId` becomes:

```csharp
foreach (var member in parent.Members)
{
    var rowId = UserNotificationId.DeriveFor(ev.EventId, member.UserId);
    var row = UserNotification.CreateXxx(
        recipientUserId: member.UserId,
        ...);
    await inbox.AddAsync(row, ct);
}

await pushSender.SendAsync(
    parent.Members.Select(m => m.UserId),
    pushTitle, pushBody, data, ct);
```

`UserNotificationId.DeriveFor(eventId, userId)` already exists and
makes the fan-out idempotent — replaying the outbox produces the same
per-recipient row IDs.

`IPushNotificationSender` grows a batch overload:

```csharp
Task SendAsync(IEnumerable<UserId> recipients, string title, string body,
    IReadOnlyDictionary<string, string> data, CancellationToken ct);
```

Implementation just `Task.WhenAll`s over a single-recipient send,
swallowing per-recipient failures so one stale FCM token doesn't kill
the broadcast.

Handlers updated:

- `DailyReportPublishedNotificationHandler`
- `SubscriptionRequestApprovedNotificationHandler`
- `SubscriptionRequestRejectedNotificationHandler`
- `ChildDocumentUploadedNotificationHandler`
- Any direct `pushSender.SendAsync(parent.OwnerUserId, ...)` site
  (grep before merging the chunk).

## Mongo schema diff

```diff
 {
   _id: ParentId,
-  ownerUserId: <Guid>,                        // was: unique index
-  email: "primary@example.com",
-  displayName: "Mom Smith",
-  phone: "...",
-  profile: { title, firstName, ..., financialEmail },
+  members: [
+    {
+      userId: <Guid>,
+      email: "mom@example.com",
+      displayName: "Mom Smith",
+      role: "Primary",
+      profile: { title, firstName, ..., financialEmail },
+      joinedOnUtc: <ISO>,
+    },
+    {
+      userId: <Guid>,
+      email: "dad@example.com",
+      displayName: "Dad Smith",
+      role: "CoParent",
+      profile: { ... },
+      joinedOnUtc: <ISO>,
+    },
+  ],
   children: [...],
   createdOnUtc: <ISO>,
   updatedOnUtc: <ISO>,
 }
```

Indexes:
- DROP unique index on `ownerUserId`.
- ADD multikey index on `members.userId` (non-unique on the index, but
  the aggregate enforces uniqueness within a single document).

Migration script: `infra/migrations/2026-05-co-parenting.js` (one-shot,
idempotent — checks for `ownerUserId` field existence per doc).

## Build order (one chunk per PR)

| # | Chunk | Status |
|---|---|---|
| 1 | Domain refactor: `Members` + `ParentMember` + role invariants. Repos + Mongo migration. Existing tests pass via single-member backfill. | not started |
| 2 | Notification fan-out (5–6 handlers + `IPushNotificationSender` batch overload). | not started |
| 3 | API surface: new path-based routes `/me/parents/{parentId}/...`. Old `/me/parent/...` shim redirects to user's first household. | not started |
| 4 | `CoParentInvitation` aggregate + endpoints + SES template. | not started |
| 5 | SSO admission update: pending-invite → attach-to-parent branch. | not started |
| 6 | External SPA: household picker, Co-parents settings tab, accept-invitation page. | not started |
| 7 | Flutter app: Co-parents screen, household picker, deep-link handling. | not started |

Each chunk leaves the build green, tests passing, and the deployed
system still functional. Chunks 1–5 are the backend; 6–7 are the
clients. We can ship chunks 1–4 to staging without changing user-facing
behaviour at all.

## Open follow-ups (Phase 2)

- SES email fan-out to all members (currently primary only).
- Notification preferences per-member rather than per-household.
- "Audit trail" of household membership changes (who invited whom,
  who removed whom, when).
- WhatsApp fan-out (mirrors push fan-out once notification preferences
  are per-member).
- Soft-delete + recover for accidentally-removed co-parents (right now
  a removed member's User survives but loses access immediately).
