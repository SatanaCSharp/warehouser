---
status: Living
updated_at: '2026-08-06'
---

# Domain Context — users-management

## Glossary

- Initial Password — The password value a Warehouse Member with the create-user Permission supplies when creating a new Warehouse Member, which becomes that new member's credential immediately usable for signing in. NOT a self-service password change, which the acting Warehouse Member performs on their own credential without a Permission check and is out of scope for this feature.

## Invariants

- A User holding the Warehouse Manager Role can never be deleted; the Role always must be transferred away first.
- A Warehouse can never be left without a Warehouse Manager as a result of a deletion, even under a concurrent Warehouse Manager transfer.
- The acting Warehouse Member can never delete their own User record.
- A newly created Warehouse Member's assigned Role can never grant Permissions beyond the creator's own current Permissions.
- A User holding the Warehouse Manager Role can never have their email or password changed by another Warehouse Member; the Role always must be transferred away first.
- A Warehouse Member can never change their own email or password through this feature's manager-driven action; that is a separate, out-of-scope self-service capability.
- A Warehouse Member's email or password can never be changed by an actor whose current Permissions do not include every Permission held by the target's Role.
- A newly created Warehouse Member can never be assigned the Warehouse Manager Role; that Role changes hands only through the existing manager-transfer capability.

## Out of scope

- Reversible deactivation or suspension of a Warehouse Member — this release only supports permanent deletion; a future release may add a reversible state.
