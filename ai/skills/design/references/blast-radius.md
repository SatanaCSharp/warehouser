# ADR blast-radius gate

Create a feature ADR when at least two are true:

- changing the decision later is costly or irreversible;
- it affects multiple modules, applications, or operational owners;
- at least two legitimate options remain after applying `docs/system` constraints.

An inherited system choice is not a new feature decision. Link the system ADR or architecture
document. Below the threshold, record the choice and rationale inline in the feature SAD.
