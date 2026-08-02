---
kind: change-request
status: Draft
owner: '<owner>'
reviewers: ['Tech Lead']
updated_at: '<today YYYY-MM-DD>'
feature_size: '<XS/S/M/L/XL>'
change_record: './change.md'
---

# Change-request specification — <slug>

## 1. Context

<The intended behavior change, affected actors, motivation, and links to change.md override rows.>

## 2. Goals

- <Observable outcome of the changed behavior.>

## 3. Non-goals

- <Behavior explicitly not changed by this request and why.>

## 4. Changed user stories

### CR-US-01: <title>

**As a** <canonical role>
**I want** <changed action or rule>
**So that** <observable benefit>

## 5. Acceptance criteria

### CR-AC-01 (CR-US-01, CH-01) — <coverage type>

**Given** <business precondition>
**When** <business action>
**Then** <observable changed outcome>

## 5.1 Regression boundaries

### CR-RG-01 — <important unchanged behavior>

**Given** <precondition outside or beside the override>
**When** <existing action>
**Then** <existing outcome remains unchanged>

## 6. Non-functional requirements

| Aspect   | Previous target | New target                    | Measurement |
| -------- | --------------- | ----------------------------- | ----------- |
| <aspect> | <old or N/A>    | <numeric target or unchanged> | <metric>    |

## 6.1 Security / privacy

- **Data classification:** <...>
- **Personal data impact:** <...>
- **Authorization impact:** <...>
- **Security review:** <Required / N/A with reason>

## 7. Metrics / KPIs

- **<metric>** — baseline: <...>, target: <... within ...>.

## 8. Open questions

- [ ] <question>? Default now: <...>. — owner: <role>, due: <stage/date>
