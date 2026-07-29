---
status: Living
updated_at: '2026-07-25'
---

# Domain Context — auth

## Glossary

- Account — A domain object representing the authentication identity that owns one globally unique email address, password credential, and persistent sessions, and is linked to exactly one User. NOT User, which represents the person in the warehouse domain rather than their credentials.
- Account Holder — A User whose linked Account has established a valid authenticated session. NOT Visitor, who has not established an authenticated session.
- User — A domain object representing one person in the warehouse domain, created atomically with and linked to exactly one Account. NOT Account, which owns authentication credentials and sessions.
- Visitor — A person who has not established an authenticated session and may sign up or sign in. NOT Account Holder, who has authenticated access.

## Invariants

- An Account always must be linked to exactly one User, and a User always must be linked to exactly one Account.
- Account and User creation always succeeds or fails as one sign-up outcome.
- A normalized email address can belong to only one Account.
