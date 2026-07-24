# Domain-expert-first protocol

Apply this protocol only while generating or clarifying feature requirements that define business
logic, invariants, state transitions, domain terminology, actors, or observable outcomes.

Do not dispatch `domain-expert` from glossary maintenance, architecture/design, runtime sequences,
data modeling, API generation, task breakdown, implementation, test planning/authorship, or code
review. Those stages consume the approved feature requirements.

## Mandatory sequence

1. **Identify domain concepts.** List the actors, terms, rules, invariants, states, transitions, and
   observable outcomes touched by the work.
2. **Ask questions first.** Convert every unstated or proposed rule into a concrete question. Do not
   draft an answer or implementation first.
3. **Dispatch `domain-expert`.** Send the context, numbered questions, and relevant artifact paths
   to [`domain-expert`](../../agents/domain-expert.md). The worker must query the `domain-expert`
   knowledge base before relying on repository evidence.
4. **Gate on the result.**
   - `Status: ANSWERED` — proceed strictly within the returned rules and terminology. Record the
     cited source in the resulting artifact and in code/PR notes where the rule is implemented.
   - `Status: ESCALATION_REQUIRED` — stop all work that depends on the missing rule and present the
     worker's `### 🚨 DOMAIN LOGIC ESCALATION REQUIRED` block to the human unchanged. Do not select
     an option, add an assumption, weaken a test, or encode a temporary default.
5. **Re-query on drift.** If a new domain question appears while drafting or clarifying the feature
   requirements, repeat steps 2–4 before continuing that requirements branch.

If isolated worker dispatch is unavailable, execute the same `domain-expert` agent instructions
sequentially in the current context. Lack of a knowledge-base tool produces an escalation; it does
not waive the gate.

## Dispatch template

```markdown
Context/Feature: <feature or task>
Relevant artifacts: <paths>

Domain questions:

1. <question>
2. <question>

Return the domain-expert output contract and do not propose implementation.
```
