# Agent roster

Worker definitions live in `ai/agents/`. Use a named worker only when the runtime supports isolated
delegation and the owning skill lists it. Otherwise perform the same bounded role sequentially.
Workers read canonical artifacts directly and return evidence; the coordinating skill owns writes
and final integration.
