---
status: Draft
owner: 'QA'
reviewers: ['Backend Lead', 'Frontend Lead', 'Tech Lead']
updated_at: '2026-09-07'
feature_size: 'L'
---

# Test plan — arrival-inspection

Every Purchase Draft Line ending must record **in what state** goods arrived alongside **how much**:
a Condition Split of what was presented into what was accepted and what was refused, a Pre-receipt
Conformance judgement of the frozen instruction, a Rejection per reason carrying its description,
source and disposition — and the Allocation bound must narrow from the Received Quantity to the
derived Accepted Quantity, with a refusal's cause visible only to a reader holding the capability to
read it.

## Levels

| Level                     | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Strategy (generic — no tool names)                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                      | The Condition Split and conformance predicates, the Accepted-Quantity derivation, the four projection shapes, the narrowing-only observed-Permission read, and both ending commands plus the amendment command over controlled repository doubles.                                                                                                                                                                                                                                            | In-memory, no external dependency. Repository doubles for the use-case tier.                                                                                      |
| Integration               | Each repository and command against a real database it owns: the constraints, the conditional updates, the one-transaction ending, the four-shape read, the catalogue resolution.                                                                                                                                                                                                                                                                                                             | An ephemeral real database, spun up per test file and discarded with it. No mocked store.                                                                         |
| Contract                  | The boundary two sides agree on: each endpoint against its shared request/response schema and its Permission rule, and the repository-wide declaration checks that make the condition guarantees mechanical (every ending route carrying `rejections` declaring its observed Permission, every cause-carrying read declaring its own, the route table against its baseline, the import boundaries, the locked-line projection's withheld columns, and no migration mutating a catalogue row). | Validate the real shape and the real declarations against the agreed contract; no hand-rolled stubs. The HTTP half runs against the same ephemeral real database. |
| Component                 | Each web surface exercised in isolation: the condition block, the conformance block, the closed-line condition account in all four shapes, the amend dialog, and the refusal explanations.                                                                                                                                                                                                                                                                                                    | Render in a component harness; assert output, behaviour, permission-driven absence, live-region text and en/uk parity. No full app boot.                          |
| E2E                       | <!-- N/A: no end-to-end tier exists in this repository and `sad.md` §10 names none. The closest evidence — one ending writing its quantity, conformance, refusals, Allocations and resulting Outstanding Quantities together or not at all — is covered at integration level, through the command's real entry point against the ephemeral real database. -->                                                                                                                                 |                                                                                                                                                                   |
| Load                      | <!-- N/A: see "NFR validation (load)" below — the four numeric targets have no suite to run in. -->                                                                                                                                                                                                                                                                                                                                                                                           |                                                                                                                                                                   |
| Visual-regression _(web)_ | <!-- N/A: no approved-baseline image tier exists. The approved 1440 px and 390 px layouts are asserted structurally at component level instead, against `design-handoff.md`. -->                                                                                                                                                                                                                                                                                                              |                                                                                                                                                                   |
| E2E-through-UI            | <!-- N/A: no UI-driving tier exists; `sad.md` §10 records the web evidence as the component tier and notes `apps/web` has no integration script. -->                                                                                                                                                                                                                                                                                                                                          |                                                                                                                                                                   |

Levels were chosen against `sad.md` §10, which already names the required evidence per tier; this
plan's contribution is the trace from each `AC-*` to it, which §10 explicitly delegates here. The
repository-wide declaration and baseline checks are carried at **contract** level: each asserts an
agreement two sides hold — a route against the baseline, a response schema against the observed
Permission it must declare — rather than a rule computed in isolation.

## AC coverage

| AC (spec.md §5)         | Test name (intent-based)                                                                          | Level       | Expected outcome                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| AC-01 happy path        | eight refused of one hundred presented derives ninety-two accepted                                | unit        | accepted equals presented less the sum of refusals                                                                      |
| AC-01                   | the accepted figure, not the presented one, reaches the demand delegation                         | unit        | the delegation receives ninety-two                                                                                      |
| AC-01                   | an ending writes its quantity, conformance, every refusal and every Allocation together           | integration | one hundred presented, eight refused, ninety-two accepted all recorded in one transaction                               |
| AC-01                   | the condition summary states the derived accepted and rejected figures                            | component   | the summary announces ninety-two accepted and eight refused as the member edits                                         |
| AC-01                   | a refusal stated without a Pre-receipt Conformance verdict is blocked                             | unit        | refused under `purchase_drafts.condition_split_invalid` / `verdict_required_with_rejections`, naming the refused figure |
| AC-01b                  | an ending that refuses nothing is recorded with no verdict stated                                 | integration | the ending is written and its conformance stays unrecorded                                                              |
| AC-01a authorization    | the capability assertion fires only on a submission carrying a refusal                            | unit        | a refusal-carrying ending without the refusing capability is declined and records nothing                               |
| AC-01a                  | the ending route carrying refusals declares its observed refusing Permission                      | contract    | the declaration is present on both ending routes; a route carrying refusals without it fails the check                  |
| AC-01a                  | the ending endpoint is denied to a member without the refusing capability                         | contract    | denied, the member told the refusal needs a capability they do not hold, nothing recorded                               |
| AC-01a                  | the refuse control is absent, not disabled, without the refusing capability                       | component   | no refuse control renders and no hint of one appears                                                                    |
| AC-01b authorization    | the capability assertion is absent on a refusal-free submission                                   | unit        | the ending is accepted with only the recording capability                                                               |
| AC-01b                  | an ending refusing nothing records without the refusing capability                                | contract    | permitted and recorded                                                                                                  |
| AC-01b                  | an ending refusing nothing still submits when no refuse control is offered                        | component   | the member completes the ending with the condition block present and no refusal rows                                    |
| AC-02 domain invariant  | refusals totalling more than presented are rejected                                               | unit        | blocked, the member told no more can be refused than was presented                                                      |
| AC-02                   | the sum-of-refusals bound holds at the store                                                      | integration | the write is refused and nothing is recorded                                                                            |
| AC-02                   | the over-refusal explanation names the presented quantity                                         | component   | the refusal alert states the bound in the member's words                                                                |
| AC-03 error             | a refused quantity that is not a whole number of at least one is rejected                         | unit        | blocked, the member told a refused quantity must be a whole number of at least one                                      |
| AC-03                   | the shared ending schema rejects a fractional or non-positive refused quantity                    | contract    | rejected before the command runs                                                                                        |
| AC-03                   | the store refuses a non-positive refused quantity                                                 | integration | the constraint rejects the row                                                                                          |
| AC-04 domain invariant  | a refusal against a line whose ending is already recorded is rejected                             | unit        | blocked, the member told a line's ending including its condition is recorded once                                       |
| AC-04                   | a second ending on one line is refused at the store                                               | integration | the conditional write affects zero rows and nothing changes                                                             |
| AC-04a happy path       | a nothing-received line carries neither a Condition Split nor a conformance judgement             | unit        | both judgements absent, the ending valid                                                                                |
| AC-04a                  | a nothing-received ending records its quantity and neither judgement                              | integration | the ending is recorded with nothing received and both conformance columns empty                                         |
| AC-04a                  | the condition block is absent on a nothing-received line                                          | component   | no condition block and no conformance block render                                                                      |
| AC-05 happy path        | a refusal carries the reason the member stated                                                    | unit        | the reason is recorded against that refused quantity                                                                    |
| AC-05                   | the recorded reason is returned with the line when the closed draft is read                       | integration | the reason appears beside its refused quantity                                                                          |
| AC-05                   | the refusal editor records a reason against a refused quantity                                    | component   | the row shows the chosen reason and its quantity                                                                        |
| AC-06 error             | a reason outside the catalogue is rejected and the available reasons are named                    | unit        | blocked, the member told which reasons are available and that the team maintains the list                               |
| AC-06                   | the catalogue resolves a stated set of reasons in one read                                        | integration | an unknown reason is not resolved and the ending records nothing                                                        |
| AC-06                   | the unknown-reason explanation names the available reasons                                        | component   | the alert lists the catalogue and states members do not maintain it                                                     |
| AC-07 domain invariant  | a reason flagged as requiring prose is rejected with an empty description                         | unit        | blocked, the member told this reason always requires a description                                                      |
| AC-07                   | the prose requirement is driven by the catalogue flag, not by a reason's name                     | integration | any flagged reason with an empty description is refused                                                                 |
| AC-07                   | the empty-description explanation names the reason that requires prose                            | component   | the alert states the requirement against that row                                                                       |
| AC-08 happy path        | two refusals of different reasons on one line both record                                         | unit        | both quantities and both reasons recorded; accepted is what remains after both                                          |
| AC-08                   | one ending writes both refusals against the same line                                             | integration | five damaged-by-packing and three packaging-not-as-instructed recorded together                                         |
| AC-08                   | the refusal editor composes more than one refusal on a line                                       | component   | two rows render and the summary deducts both                                                                            |
| AC-09 domain invariant  | a repeated reason on one line is rejected                                                         | unit        | blocked, the member told one line carries one refusal per reason                                                        |
| AC-09                   | the store refuses a second refusal naming a reason the line already carries                       | integration | the uniqueness rule rejects the second insert (see the concurrency note under "Test data")                              |
| AC-09                   | the repeated-reason explanation says the quantities for a reason belong together                  | component   | the alert states the rule against the duplicate row                                                                     |
| AC-10 happy path        | accepted goods are assigned across two waiting orders                                             | unit        | sixty and thirty-two assigned; each order's outstanding demand reduced accordingly                                      |
| AC-10                   | the ending writes both Allocations and both resulting outstanding quantities                      | integration | both assignments and both reduced outstanding figures recorded in one transaction                                       |
| AC-11 domain invariant  | assigning more than the accepted quantity is rejected                                             | unit        | blocked, the member told only accepted goods may be assigned and that eight were refused                                |
| AC-11                   | no Allocation exceeds the accepted quantity of the line it draws on                               | integration | the write is refused and nothing is recorded                                                                            |
| AC-11                   | the over-assignment explanation names the refused quantity                                        | component   | the alert states the accepted bound and why it narrowed                                                                 |
| AC-12 cross-context     | assigning to a cancelled Customer Order is rejected                                               | unit        | blocked, the member told the order named is no longer waiting                                                           |
| AC-12                   | an ending naming a cancelled order records no part of itself                                      | integration | no refusal, no conformance, no Allocation and no ending quantity survive                                                |
| AC-12                   | the cancelled-order explanation names the order                                                   | component   | the alert identifies the order that is no longer waiting                                                                |
| AC-13 happy path        | a refusal carries the member's own description                                                    | unit        | the description is recorded with the refusal                                                                            |
| AC-13                   | the description is returned to a reader permitted to read refusals                                | integration | the description appears with its refusal                                                                                |
| AC-13                   | the refusal editor accepts and displays a description                                             | component   | the typed description renders as text, never as markup or a link                                                        |
| AC-14 error             | a description beyond one thousand characters is rejected                                          | unit        | blocked, the member told a description must stay within one thousand characters                                         |
| AC-14                   | the shared schema bounds the description at one thousand characters                               | contract    | rejected before the command runs                                                                                        |
| AC-14                   | the store bounds the description at one thousand characters                                       | integration | the constraint rejects the row                                                                                          |
| AC-14                   | the over-long-description explanation names the bound                                             | component   | the alert states the one-thousand-character limit                                                                       |
| AC-15 happy path        | a not-honoured judgement records with the member's note                                           | unit        | the judgement and note are recorded against the line                                                                    |
| AC-15                   | the judgement and its note are returned when the closed draft is read                             | integration | both appear with the line                                                                                               |
| AC-15                   | the conformance block records a not-honoured judgement with a note                                | component   | the note field appears when not-honoured is chosen and its text submits                                                 |
| AC-15a happy path       | one judgement covers both a Packaging Type and a Value-adding Note                                | unit        | a single not-honoured judgement is recorded; the note names which of the two failed                                     |
| AC-15a                  | the conformance block offers one judgement for both frozen instructions                           | component   | no second judgement control renders for the second instruction                                                          |
| AC-15b error            | a conformance note beyond one thousand characters is rejected                                     | unit        | blocked, the member told the note must stay within one thousand characters                                              |
| AC-15b                  | the shared schema bounds the conformance note at one thousand characters                          | contract    | rejected before the command runs                                                                                        |
| AC-15b                  | the store bounds the conformance note at one thousand characters                                  | integration | the constraint rejects the row                                                                                          |
| AC-15b                  | the over-long-note explanation names the bound                                                    | component   | the alert states the one-thousand-character limit                                                                       |
| AC-16 domain invariant  | honoured beside a packaging or value-adding-note refusal is rejected                              | unit        | blocked, the member told the two statements contradict each other                                                       |
| AC-16                   | an ending contradicting its own refusal records nothing                                           | integration | neither the conformance nor the refusal survives                                                                        |
| AC-16                   | the contradiction explanation names the refusal that contradicts the judgement                    | component   | the alert states why the two cannot both stand                                                                          |
| AC-17 cross-context     | an uninstructed line cannot record honoured or not honoured                                       | unit        | blocked, the member told a line carrying no instruction can only record that the judgement does not apply               |
| AC-17                   | the store refuses a judgement on a line frozen without any instruction                            | integration | the constraint rejects the ending                                                                                       |
| AC-17                   | the conformance block offers only not-applicable on an uninstructed line                          | component   | the honoured and not-honoured choices render `aria-disabled`, with the reason exposed once for the group                |
| AC-17a domain invariant | an instructed line cannot record that the judgement does not apply                                | unit        | blocked, the member told an instructed line must be judged honoured or not honoured                                     |
| AC-17a                  | the store refuses not-applicable on a line frozen carrying an instruction                         | integration | the constraint rejects the ending                                                                                       |
| AC-17a                  | the conformance block withholds not-applicable on an instructed line                              | component   | the radiogroup carries no default and submission is blocked until it is answered                                        |
| AC-18 happy path        | a disposition is recorded with the member who set it and when                                     | unit        | the disposition, the acting member and the time are recorded                                                            |
| AC-18                   | an amendment against a closed draft changes no quantity on the line                               | integration | the disposition is written; the ending quantities, refusal quantities and Allocations are untouched                     |
| AC-18                   | the amend dialog records a disposition                                                            | component   | the chosen disposition submits and the row reflects it                                                                  |
| AC-18a domain invariant | a decided disposition cannot return to undecided                                                  | unit        | blocked, the member told a decision may be corrected but never returned to undecided                                    |
| AC-18a                  | the conditional update refusing a return to undecided affects zero rows                           | integration | the stored disposition is unchanged                                                                                     |
| AC-18a                  | undecided is absent from a decided refusal's disposition list                                     | component   | the option does not render                                                                                              |
| AC-18b happy path       | a corrected description records the member who changed it and when                                | unit        | the corrected description and its attribution are recorded                                                              |
| AC-18b                  | correcting a description touches no quantity, reason or source                                    | integration | only the description and its attribution change                                                                         |
| AC-18b                  | the amend dialog corrects a description                                                           | component   | the corrected text submits and the row reflects it                                                                      |
| AC-19 error             | a disposition outside those offered is rejected and the available ones named                      | unit        | blocked, the member told which dispositions are available                                                               |
| AC-19                   | the shared amendment schema rejects an unknown disposition                                        | contract    | rejected before the command runs                                                                                        |
| AC-19                   | the store refuses an unknown disposition                                                          | integration | the constraint rejects the update                                                                                       |
| AC-19                   | the unknown-disposition explanation lists the available dispositions                              | component   | the alert names them                                                                                                    |
| AC-20 authorization     | amending a refusal without the amending capability is declined                                    | unit        | declined, the member told amending needs a capability they do not hold, disposition unchanged                           |
| AC-20                   | the amendment endpoint is denied without the amending capability                                  | contract    | denied and nothing changes                                                                                              |
| AC-20                   | the read row offers no amend action without the amending capability                               | component   | the row menu renders nothing                                                                                            |
| AC-21 happy path        | the granted shape carries every quantity, reason and description                                  | unit        | ordered, presented, accepted and rejected quantities with each refused quantity beside its reason and description       |
| AC-21                   | one read assembles each line's refusals, conformance and derived quantities                       | integration | the closed draft returns all four figures per line in a single read                                                     |
| AC-21                   | the closed line's condition account renders every refusal                                         | component   | each refused quantity renders beside its reason and description                                                         |
| AC-22 authorization     | the withheld shape leaves one total and no trace of what was withheld                             | unit        | reason, description, disposition and the division into separate refusals are absent — not empty, not counted            |
| AC-22                   | every read whose response can carry a refusal's cause declares its observed Permission            | contract    | the declaration is present on every such read; one missing fails the check                                              |
| AC-22                   | the four projection shapes are exhaustive: cause and identity, cause only, identity only, neither | unit        | each shape returns exactly what its capabilities admit and nothing more                                                 |
| AC-22                   | the withheld read renders no placeholder, count or hint                                           | component   | the account shows the total refused quantity and nothing indicating a withholding                                       |
| AC-23 cross-context     | the frozen Packaging Type is read from the line, not from the later catalogue                     | integration | the line shows what was frozen at ordering after the catalogue is extended                                              |
| AC-23                   | the closed line renders its frozen instruction                                                    | component   | the frozen Packaging Type renders unchanged                                                                             |
| AC-23a cross-context    | a recorded refusal's reason is unchanged by a later catalogue extension                           | integration | the reason reads as the member stated it                                                                                |
| AC-23a                  | no migration updates or deletes a catalogue row                                                   | contract    | the catalogue is extended only; a mutating migration fails the check                                                    |
| AC-23a                  | the closed line renders the reason as recorded                                                    | component   | the reason renders unchanged after an extension                                                                         |
| AC-24 happy path        | a refusal on a directly delivered line carries the customer-reported source                       | unit        | source recorded as reported by the customer, the quantity assigned to nobody                                            |
| AC-24                   | the ending records the customer-reported refusal and no Allocation for it                         | integration | the refusal is recorded against the line and that quantity remains unassigned                                           |
| AC-24                   | the direct-delivery ending states its finality before it can be submitted                         | component   | the finality acknowledgement gates the primary action                                                                   |
| AC-25 domain invariant  | a customer-reported refusal on an own-dock line is rejected                                       | unit        | blocked, the member told own-dock goods carry the inspected source                                                      |
| AC-25                   | the store refuses a source that disagrees with the line's Delivery Mode, in both directions       | integration | the reference rejects the row                                                                                           |
| AC-25                   | the wrong-source explanation names the line's delivery mode                                       | component   | the alert states which source that line carries                                                                         |
| AC-26 authorization     | reading or amending a refusal of another Warehouse is denied without disclosing existence         | contract    | denied identically whether or not the refusal exists                                                                    |
| AC-26                   | the amendment reaches only a refusal of the acting Warehouse                                      | integration | a refusal of another Warehouse is not resolved even where the actor holds a membership and the capability there         |

## Edge cases / error paths

Every error and authorization criterion above holds its own rows and is never folded into a happy
path. These are the boundary and failure cases the spec and its upstream artifacts imply on top of
them.

- A pre-release ending carrying no Condition Split is read (`spec.md` §8, tenth question) → expected:
  the line reads with its received quantity as its accepted quantity, no refusals and no conformance,
  distinguished from a Condition Split that refused nothing by the absent conformance judgement rather
  than by the absence of refusals. **integration** — the absent case is a first-class factory
  (`data-model.md` §Test fixtures), so it is covered deliberately rather than by accident.
- A nothing-received ending is read after closure → expected: the same absent condition account, and
  the line is excluded from the condition-integrity readings. **integration**
- A failure is injected part-way through recording an ending, including one raised by a Condition
  Split rule → expected: nothing is recorded — no quantity, no conformance, no refusal, no Allocation
  and no changed outstanding demand. **integration**
- The last line's ending lands → expected: the draft closes exactly then, and not before. **integration**
- An amendment is aimed at a refusal on a **closed** draft → expected: it succeeds, which is the first
  write this product aims at a closed draft, and it touches nothing else on that draft. **integration**
- An ending payload carries a property the schema does not define → expected: rejected, unknown
  properties are not silently ignored. **contract**
- Every mutating endpoint this feature adds is called against an archived Warehouse → expected:
  denied; every read against one → expected: succeeds. **contract**
- A refusal's fixed part — its quantity, reason, source and line — is aimed at after recording →
  expected: unchanged; only a description or disposition amendment is admitted, and each records its
  acting member and time. **integration**
- A granted observed capability is used to widen a read → expected: it never admits anything the
  required capability did not; an ungranted one never denies at the guard
  ([ADR 0001](./adr/0001-payload-conditional-permission.md)). The guard's shipped cases stay green.
  **unit + contract**
- The locked-line projection is asked for a column it deliberately withholds → expected: absent —
  specifically it does not carry the ordered quantity. **contract**
- A new translation key ships → expected: the locale baseline is regenerated in the existing key
  order, removing no key and changing no value; en/uk parity holds on every string this feature adds.
  **component + contract**
- Two routes are added and none withdrawn → expected: the route-table baseline is regenerated
  deliberately and reviewed in the same change; it is never silenced. **contract**
- The web build is run, not only the test suites → expected: it passes. The suite can stay entirely
  green while the build breaks (`sad.md` §10), so the build stays in the definition of done.

## Test data

- **Seed strategy:** the factories named in [`data-model.md`](./data-model.md) §Test fixtures, kept in
  the server test factories directory and never in migrations — `aRejection`,
  `aCustomerReportedRejection`, `anAmendedRejection`, `aRejectionReason`, `aProseRequiringReason`,
  `aJudgedLine`, `anInstructedLine`, `anUninstructedLine`, `aPreReleaseEnding` and
  `aNothingReceivedEnding`. Each defaults to a consistent pairing — a refusal defaults to its line's
  Warehouse and Delivery Mode — so a cross-Warehouse or wrong-source case must be written
  deliberately rather than arrived at. AC-07 is tested against the prose-requiring **flag**, never
  against a reason's name. No test adds a catalogue reason and then asserts the catalogue's contents.
- **Integration dependency:** an ephemeral real database, spun up per test file and discarded with it.
  Not a mocked store — the constraints, the conditional updates and the one-transaction ending are the
  behaviour under test, and a double cannot fail the way the store does.
- **Cleanup boundary:** per test file. Each file owns its own database instance, so no test depends on
  another's residue and the order the files run in cannot change a result.
- **Concurrency note, and a deviation from `sad.md` §10:** §10 asks for the one-refusal-per-reason
  rule "under a concurrent second insert". The integration tier runs a single-backend in-process
  database — one query at a time — and its configuration states that a spec needing two backends
  racing each other cannot be expressed in it. AC-09 is therefore covered as a **sequential** second
  insert against the uniqueness rule, which proves the constraint exists and rejects the duplicate but
  does **not** prove the race. Recorded here as a known gap rather than quietly satisfied; the same
  limitation already governs every other suite in this tier.
- **Migrations are not covered by tests.** They are verified by hand against the real development
  database — applied **and reverted**, with pre-existing endings present, proving that untouched
  historic endings behave as `spec.md` §8's tenth question assumes.

## NFR validation (load)

<!-- N/A: not "no numeric NFR" — spec.md §6 carries four. There is no suite for them to run in. -->

`spec.md` §6 carries four numeric targets: the authorization stage at p95 ≤ 50 ms per protected
operation, a line ending at p95 ≤ 500 ms, a closed-draft read at p95 ≤ 250 ms and a disposition
amendment at p95 ≤ 300 ms. **No load scenario is written for any of them, and none is run.**
`sad.md` §10 and §11 record why: production timing is forbidden by `sad.md` §8, and this repository
has no performance tier. The four figures are therefore carried as **unverified design budgets** — a
constraint the design was drawn against, not a check that passes — and this plan does not invent a
throughput target or a tool to make them look verified. Should a performance tier ever land, these
four are its first four scenarios, each needing a target rate, a duration, the metric and its
threshold before it means anything.

The non-numeric §6 rows are not budgets and **are** verified, at integration and contract level:
ending atomicity, condition-split integrity, conformance consistency, catalogue integrity,
frozen-record integrity, condition immutability, authority staleness and authorization coverage each
trace to rows in the coverage table above.

## CI placement

- **On every PR:** unit, contract and component — the fast suites, including the repository-wide
  declaration and baseline checks, which are exactly the ones that must fail loudly the first time a
  new route or a new cause-carrying read forgets its declaration.
- **On every PR, and the reason this feature's gate is wider than usual:** the integration tier. Ending
  atomicity, the constraints and the four-shape read are this feature's whole substance; deferring
  them to a schedule would let a broken condition guarantee merge.
- **Pre-release, by hand:** the migration apply-and-revert against the real development database with
  pre-existing endings present, and the web build.
- **Release gates:** the security review `spec.md` §6.1 requires. The UI approval gate is already
  satisfied by [`design-handoff.md`](./design-handoff.md).
