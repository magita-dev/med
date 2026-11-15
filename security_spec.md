# MedGuard Firestore Security Specification

## 1. Data Invariants
1. Default-deny catch-all rule rejects all unmatched paths.
2. Every `UserProfile` document at `/users/{userId}` can only be created, read, or updated by its authenticated, email-verified owner (`request.auth.uid == userId`) or a verified admin (`isAdmin()`).
3. `UserProfile` contains no client-controlled RBAC (`role`, `isAdmin`) fields.
4. Every `SavedCheck` document at `/users/{userId}/checks/{checkId}` requires the parent `/users/{userId}` document to exist (`exists(...)`), enforces `data.userId == request.auth.uid` and `data.id == checkId`, and uses server timestamps (`createdAt == request.time`).
5. All `allow list` rules on `/users/{userId}/checks` explicitly inspect `resource.data.userId == request.auth.uid` with zero `get()`/`exists()` calls inside `list`.
6. All string fields enforce `.size()` bounds; all path IDs match `^[a-zA-Z0-9_\\-]+$` and `<= 128` chars.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated read** of `/users/user_1`.
2. **Cross-user PII read**: `user_2` reads `/users/user_1`.
3. **Unverified email write**: `user_1` with `email_verified: false` attempts creating `/users/user_1`.
4. **UID spoofing**: `user_1` creates `/users/user_1` with `{ uid: "user_2", ... }`.
5. **Shadow ghost field**: `user_1` creates `/users/user_1` with extra `{ isAdmin: true }`.
6. **Privilege escalation / immutable field update**: `user_1` updates `email` or `createdAt` on `/users/user_1`.
7. **ID poisoning**: `user_1` writes to `/users/user_1/checks/bad$id..slash` or a 300-char checkId.
8. **Orphaned subcollection write**: `user_1` creates `/users/user_1/checks/chk_1` when `/users/user_1` does not exist.
9. **Client timestamp forgery**: `user_1` creates `/users/user_1/checks/chk_1` with a past client timestamp instead of `request.time`.
10. **String size overflow (Denial of Wallet)**: `user_1` creates `/users/user_1/checks/chk_1` with a 5,000-char `patientCondition`.
11. **Invalid enum / type poisoning**: `user_1` writes `{ verdict: "ADMIN_BYPASS", patientAge: "not_an_int" }`.
12. **Blanket collection scrape**: `user_2` attempts `list` on `/users` or `/users/user_1/checks`.
