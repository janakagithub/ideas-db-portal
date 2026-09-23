# IDEAS-DB — Schema Relationships

_Generated 2026-09-23. 34 relationships (12 declared, 17 strongly inferred, 5 weakly inferred / unknown)._

Status: **DECLARED** = SQL foreign key in `ideas_min_schema.sql`; **STRONGLY_INFERRED** = column-name match with 100% of values resolving to the parent; **WEAKLY_INFERRED** = partial value match; **UNKNOWN** = parent table empty, unverifiable.

## Reference tree (grouped by parent)

### ai_design
- `idea_mutant.ai_design_id` → `ai_design.id` — WEAKLY_INFERRED, match n/a

### computation
- `protein_parameter.computation_id` → `computation.id` — WEAKLY_INFERRED, match 0.0%, 5 orphan(s)

### idea_experiment
- `idea_sample.experiment_id` → `idea_experiment.id` — DECLARED, match 100.0%

### idea_lab
- `idea_people.lab_id` → `idea_lab.id` — STRONGLY_INFERRED, match 100.0%
- `idea_procedure.lab_id` → `idea_lab.id` — STRONGLY_INFERRED, match 100.0%

### idea_measurement
- `protein_parameter.measurement_id` → `idea_measurement.id` — WEAKLY_INFERRED, match 0.0%, 27 orphan(s)

### idea_mutant
- `computation.idea_mutant_id` → `idea_mutant.id` — STRONGLY_INFERRED, match 100.0%
- `protein_parameter.idea_mutant_id` → `idea_mutant.id` — STRONGLY_INFERRED, match 100.0%
- `sample_protein.idea_mutant_id` → `idea_mutant.id` — STRONGLY_INFERRED, match 100.0%

### idea_people
- `idea_procedure.contact_id` → `idea_people.id` — STRONGLY_INFERRED, match 100.0%

### idea_procedure
- `computation.procedure_id` → `idea_procedure.id` — STRONGLY_INFERRED, match 100.0%
- `idea_experiment.procedure_id` → `idea_procedure.id` — STRONGLY_INFERRED, match 100.0%
- `idea_measurement.procedure_id` → `idea_procedure.id` — STRONGLY_INFERRED, match 100.0%
- `idea_sample.procedure_id` → `idea_procedure.id` — WEAKLY_INFERRED, match n/a

### idea_protein
- `ai_design.idea_protein_id` → `idea_protein.id` — STRONGLY_INFERRED, match 100.0%
- `computation.idea_protein_id` → `idea_protein.id` — STRONGLY_INFERRED, match 100.0%
- `idea_mutant.idea_protein_id` → `idea_protein.id` — STRONGLY_INFERRED, match 100.0%
- `protein_parameter.idea_protein_id` → `idea_protein.id` — STRONGLY_INFERRED, match 100.0%
- `sample_protein.idea_protein_id` → `idea_protein.id` — DECLARED, match 100.0%

### idea_protocol
- `idea_procedure.protocol_id` → `idea_protocol.id` — STRONGLY_INFERRED, match 100.0%

### idea_reactant
- `idea_stoichiometry.idea_reactant_id` → `idea_reactant.id` — DECLARED, match 100.0%
- `sample_reactant.idea_reactant_id` → `idea_reactant.id` — DECLARED, match 100.0%

### idea_reaction
- `computation.idea_reaction_id` → `idea_reaction.id` — STRONGLY_INFERRED, match 100.0%
- `idea_stoichiometry.idea_reaction_id` → `idea_reaction.id` — DECLARED, match 100.0%
- `protein_parameter.idea_reaction_id` → `idea_reaction.id` — STRONGLY_INFERRED, match 100.0%
- `sample_reaction.idea_reaction_id` → `idea_reaction.id` — DECLARED, match 100.0%

### idea_sample
- `idea_measurement.sample_id` → `idea_sample.id` — DECLARED, match 100.0%
- `idea_sample.parent_sample_id` → `idea_sample.id` — DECLARED, match n/a
- `sample_parameter.sample_id` → `idea_sample.id` — DECLARED, match 100.0%
- `sample_protein.sample_id` → `idea_sample.id` — DECLARED, match 100.0%
- `sample_reactant.sample_id` → `idea_sample.id` — DECLARED, match 100.0%
- `sample_reaction.sample_id` → `idea_sample.id` — DECLARED, match 100.0%

### idea_strain
- `idea_sample.strain_id` → `idea_strain.id` — STRONGLY_INFERRED, match 100.0%
- `idea_strain.parent_strain_id` → `idea_strain.id` — WEAKLY_INFERRED, match 0.0%, 1 orphan(s)

## Full relationship table

| Source | Target | Type | Status | Match | Orphans |
|--------|--------|------|--------|-------|---------|
| `ai_design.idea_protein_id` | `idea_protein.id` | many-to-one | STRONGLY_INFERRED | 100.0% | 0 |
| `computation.idea_protein_id` | `idea_protein.id` | many-to-one | STRONGLY_INFERRED | 100.0% | 0 |
| `computation.idea_mutant_id` | `idea_mutant.id` | many-to-one | STRONGLY_INFERRED | 100.0% | 0 |
| `computation.idea_reaction_id` | `idea_reaction.id` | many-to-one | STRONGLY_INFERRED | 100.0% | 0 |
| `computation.procedure_id` | `idea_procedure.id` | many-to-one | STRONGLY_INFERRED | 100.0% | 0 |
| `idea_experiment.procedure_id` | `idea_procedure.id` | many-to-one | STRONGLY_INFERRED | 100.0% | 0 |
| `idea_measurement.sample_id` | `idea_sample.id` | many-to-one | DECLARED | 100.0% | 0 |
| `idea_measurement.procedure_id` | `idea_procedure.id` | many-to-one | STRONGLY_INFERRED | 100.0% | 0 |
| `idea_mutant.idea_protein_id` | `idea_protein.id` | many-to-one | STRONGLY_INFERRED | 100.0% | 0 |
| `idea_mutant.ai_design_id` | `ai_design.id` | many-to-one | WEAKLY_INFERRED | n/a | 0 |
| `idea_people.lab_id` | `idea_lab.id` | many-to-one | STRONGLY_INFERRED | 100.0% | 0 |
| `idea_procedure.protocol_id` | `idea_protocol.id` | many-to-one | STRONGLY_INFERRED | 100.0% | 0 |
| `idea_procedure.lab_id` | `idea_lab.id` | many-to-one | STRONGLY_INFERRED | 100.0% | 0 |
| `idea_procedure.contact_id` | `idea_people.id` | many-to-one | STRONGLY_INFERRED | 100.0% | 0 |
| `idea_sample.experiment_id` | `idea_experiment.id` | many-to-one | DECLARED | 100.0% | 0 |
| `idea_sample.strain_id` | `idea_strain.id` | many-to-one | STRONGLY_INFERRED | 100.0% | 0 |
| `idea_sample.procedure_id` | `idea_procedure.id` | many-to-one | WEAKLY_INFERRED | n/a | 0 |
| `idea_sample.parent_sample_id` | `idea_sample.id` | many-to-one | DECLARED | n/a | 0 |
| `idea_stoichiometry.idea_reaction_id` | `idea_reaction.id` | many-to-one | DECLARED | 100.0% | 0 |
| `idea_stoichiometry.idea_reactant_id` | `idea_reactant.id` | many-to-one | DECLARED | 100.0% | 0 |
| `idea_strain.parent_strain_id` | `idea_strain.id` | many-to-one | WEAKLY_INFERRED | 0.0% | 1 |
| `protein_parameter.idea_protein_id` | `idea_protein.id` | many-to-one | STRONGLY_INFERRED | 100.0% | 0 |
| `protein_parameter.idea_mutant_id` | `idea_mutant.id` | many-to-one | STRONGLY_INFERRED | 100.0% | 0 |
| `protein_parameter.measurement_id` | `idea_measurement.id` | many-to-one | WEAKLY_INFERRED | 0.0% | 27 |
| `protein_parameter.computation_id` | `computation.id` | many-to-one | WEAKLY_INFERRED | 0.0% | 5 |
| `protein_parameter.idea_reaction_id` | `idea_reaction.id` | many-to-one | STRONGLY_INFERRED | 100.0% | 0 |
| `sample_parameter.sample_id` | `idea_sample.id` | many-to-one | DECLARED | 100.0% | 0 |
| `sample_protein.sample_id` | `idea_sample.id` | many-to-one | DECLARED | 100.0% | 0 |
| `sample_protein.idea_protein_id` | `idea_protein.id` | many-to-one | DECLARED | 100.0% | 0 |
| `sample_protein.idea_mutant_id` | `idea_mutant.id` | many-to-one | STRONGLY_INFERRED | 100.0% | 0 |
| `sample_reactant.sample_id` | `idea_sample.id` | many-to-one | DECLARED | 100.0% | 0 |
| `sample_reactant.idea_reactant_id` | `idea_reactant.id` | many-to-one | DECLARED | 100.0% | 0 |
| `sample_reaction.sample_id` | `idea_sample.id` | many-to-one | DECLARED | 100.0% | 0 |
| `sample_reaction.idea_reaction_id` | `idea_reaction.id` | many-to-one | DECLARED | 100.0% | 0 |
