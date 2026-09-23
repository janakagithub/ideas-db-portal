# IDEAS-DB — Data Dictionary

_Generated 2026-09-23. 21 tables, 715 rows, 145 columns. Source columns are all TEXT; the "intended" ANSI type is recorded per field._

## ai_design

**Purpose:** AI/computational enzyme-design runs. Empty in this release (platform-optional).

**Rows:** 5 · **Fields:** 16 · **Completeness:** 92.5%

**Primary key:** id

**Foreign keys:**
- `idea_protein_id` → `idea_protein.id` (inferred)

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | text | identifier (primary key) | PK |  |  | 0.0% | Row id. |
| `idea_protein_id` | text | identifier (foreign key) | FK | idea_protein.id |  | 0.0% | Target enzyme (→ idea_protein). |
| `design_method` | text | descriptive / free-text |  |  |  | 0.0% | Method. |
| `model_name` | text | descriptive / free-text |  |  |  | 0.0% | Model used. |
| `proposed_mutations` | text | descriptive / free-text |  |  |  | 0.0% | Proposed mutations. |
| `proposed_sequence` | text | descriptive / free-text |  |  |  | 100.0% | Proposed sequence. |
| `optimization_target` | text | descriptive / free-text |  |  |  | 0.0% | Objective. |
| `optimization_algorithm` | text | descriptive / free-text |  |  |  | 0.0% | Algorithm. |
| `generation` | text | measurement / numeric |  |  |  | 0.0% | Design generation. |
| `objective_scores` | text | descriptive / free-text |  |  |  | 0.0% | Objective scores. |
| `pareto_rank` | text | measurement / numeric |  |  |  | 0.0% | Pareto rank. |
| `pareto_optimal` | text | measurement / numeric |  |  |  | 0.0% | On Pareto front? |
| `selected_for_testing` | text | measurement / numeric |  |  |  | 0.0% | Chosen for wet-lab test? |
| `design_rationale` | text | descriptive / free-text |  |  |  | 0.0% | Rationale. |
| `run_date` | text | metadata (audit/provenance) |  |  |  | 0.0% | Run date. |
| `notes` | text | descriptive / free-text |  |  |  | 20.0% | Notes. |

## computation

**Purpose:** Computational predictions/simulations. Empty in this release (platform-optional).

**Rows:** 5 · **Fields:** 12 · **Completeness:** 88.3%

**Primary key:** id

**Foreign keys:**
- `idea_protein_id` → `idea_protein.id` (inferred)
- `idea_mutant_id` → `idea_mutant.id` (inferred)
- `idea_reaction_id` → `idea_reaction.id` (inferred)
- `procedure_id` → `idea_procedure.id` (inferred)

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | text | identifier (primary key) | PK |  |  | 0.0% | Row id. |
| `idea_protein_id` | text | identifier (foreign key) | FK | idea_protein.id |  | 0.0% | Enzyme (→ idea_protein). |
| `idea_mutant_id` | text | identifier (foreign key) | FK | idea_mutant.id |  | 40.0% | Variant (→ idea_mutant). |
| `idea_reaction_id` | text | identifier (foreign key) | FK | idea_reaction.id |  | 40.0% | Reaction (→ idea_reaction). |
| `procedure_id` | text | identifier (foreign key) | FK | idea_procedure.id |  | 0.0% | Procedure (→ idea_procedure). |
| `type` | text | descriptive / free-text |  |  |  | 0.0% | Type. |
| `model_name` | text | descriptive / free-text |  |  |  | 0.0% | Model. |
| `compute_platform` | text | category |  |  |  | 0.0% | Platform. |
| `simulation_params` | text | descriptive / free-text |  |  |  | 0.0% | Parameters. |
| `run_date` | text | metadata (audit/provenance) |  |  |  | 0.0% | Date. |
| `filename` | text | category |  |  |  | 60.0% | Output file. |
| `notes` | text | descriptive / free-text |  |  |  | 0.0% | Notes. |

## idea_dbxref

**Purpose:** Cross-references to external databases — PubChem CIDs for compounds and PDB/UniProt accessions for enzymes.

**Rows:** 13 · **Fields:** 6 · **Completeness:** 94.9%

**Primary key:** id

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | integer | identifier (primary key) | PK |  |  | 0.0% | Row id. |
| `entity_type` | text | category |  |  |  | 0.0% | Which entity type. |
| `entity_id` | text | identifier (external cross-reference) |  |  |  | 0.0% | Which entity. |
| `database_name` | text, | descriptive / free-text |  |  |  | 0.0% | External DB. |
| `accession` | text | descriptive / free-text |  |  |  | 0.0% | External accession. |
| `url` | text | descriptive / free-text |  |  |  | 30.8% | External URL. |

## idea_experiment

**Purpose:** A logical experiment / assay campaign grouping many samples (e.g. the tetrad-synthesis panels, the AS9 engineering campaign, the Figure-4 substrate scope, a specific plate run).

**Rows:** 1 · **Fields:** 6 · **Completeness:** 100.0%

**Primary key:** id

**Foreign keys:**
- `procedure_id` → `idea_procedure.id` (inferred)

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | text | identifier (primary key) | PK |  |  | 0.0% | Experiment identifier. |
| `start_date` | date | metadata (audit/provenance) |  |  |  | 0.0% | When the experiment began (not populated). |
| `type` | text | category |  |  |  | 0.0% | Experiment/assay type (e.g. the '6,6' polymer type). |
| `index_num` | integer | measurement / numeric |  |  |  | 0.0% | Ordinal index (not populated). |
| `description` | text | category |  |  |  | 0.0% | Human description / project tag. |
| `procedure_id` | text | identifier (foreign key) | FK | idea_procedure.id |  | 0.0% | Link to the lab procedure used (→ idea_procedure). |

## idea_lab

**Purpose:** Labs that generated data. Empty in this release (provenance backbone).

**Rows:** 2 · **Fields:** 3 · **Completeness:** 100.0%

**Primary key:** id

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | text | identifier (primary key) | PK |  |  | 0.0% | Row id. |
| `name` | text | category |  |  |  | 0.0% | Lab name. |
| `location` | text | category |  |  |  | 0.0% | Lab location. |

## idea_measurement

**Purpose:** A measurement event on a sample — the instrument readout (mass-spec, LC-MS quantitation, titer assay) that a parameter value came from.

**Rows:** 27 · **Fields:** 6 · **Completeness:** 100.0%

**Primary key:** id

**Foreign keys:**
- `sample_id` → `idea_sample.id` (declared)
- `procedure_id` → `idea_procedure.id` (inferred)

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | integer | identifier (primary key) | PK |  |  | 0.0% | Measurement identifier. |
| `sample_id` | text | identifier (foreign key) | FK | idea_sample.id |  | 0.0% | The sample measured (→ idea_sample). |
| `procedure_id` | text | identifier (foreign key) | FK | idea_procedure.id |  | 0.0% | Measurement procedure (→ idea_procedure). |
| `type` | text | category |  |  |  | 0.0% | Measurement type (mass-spec, titer assay, …). |
| `filename` | text | category |  |  |  | 0.0% | Source data file, if any. |
| `notes` | text | descriptive / free-text |  |  |  | 0.0% | Free-text notes. |

## idea_mutant

**Purpose:** Engineered variants of a parent enzyme (all AS9 here): single point mutants, combinatorial multi-mutants, and the full site-saturation (SSM) panel. The wild-type reference is the one row flagged is_wild_type=true.

**Rows:** 21 · **Fields:** 8 · **Completeness:** 50.0%

**Primary key:** id

**Foreign keys:**
- `idea_protein_id` → `idea_protein.id` (inferred)
- `ai_design_id` → `ai_design.id` (uncertain)

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | text | identifier (primary key) | PK |  |  | 0.0% | Stable internal identifier for the variant. |
| `idea_protein_id` | text | identifier (foreign key) | FK | idea_protein.id |  | 0.0% | The parent enzyme this variant derives from (→ idea_protein). |
| `mutations` | text | descriptive / free-text |  |  | HGVS-like protein variant notation (e.g. A219M) | 0.0% | Mutation(s) in standard notation, e.g. 'A219M' or 'V213L A215Q'; empty for wild-type. |
| `aa_sequence` | text | descriptive / free-text |  |  |  | 100.0% | Variant amino-acid sequence (not yet populated). |
| `dna_sequence` | text | descriptive / free-text |  |  |  | 100.0% | Variant coding DNA sequence (not yet populated). |
| `design_method` | text | category |  |  |  | 0.0% | How the variant was made (site-directed, combinatorial, site-saturation, wild-type). |
| `ai_design_id` | text | identifier (foreign key) | FK | ai_design.id |  | 100.0% | Link to an AI/computational design record, if any (→ ai_design). |
| `notes` | text | descriptive / free-text |  |  |  | 100.0% | Free-text notes. |

## idea_people

**Purpose:** People/contacts. Empty in this release (provenance backbone).

**Rows:** 6 · **Fields:** 5 · **Completeness:** 96.7%

**Primary key:** id

**Foreign keys:**
- `lab_id` → `idea_lab.id` (inferred)

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | text | identifier (primary key) | PK |  |  | 0.0% | Row id. |
| `first_name` | text | descriptive / free-text |  |  |  | 0.0% | First name. |
| `last_name` | text | descriptive / free-text |  |  |  | 0.0% | Last name. |
| `email` | text | descriptive / free-text |  |  |  | 16.7% | Email. |
| `lab_id` | text | identifier (foreign key) | FK | idea_lab.id |  | 0.0% | Their lab (→ idea_lab). |

## idea_procedure

**Purpose:** A protocol applied by a lab at a time. Empty in this release.

**Rows:** 6 · **Fields:** 5 · **Completeness:** 100.0%

**Primary key:** id

**Foreign keys:**
- `protocol_id` → `idea_protocol.id` (inferred)
- `lab_id` → `idea_lab.id` (inferred)
- `contact_id` → `idea_people.id` (inferred)

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | text | identifier (primary key) | PK |  |  | 0.0% | Row id. |
| `protocol_id` | text | identifier (foreign key) | FK | idea_protocol.id |  | 0.0% | Protocol (→ idea_protocol). |
| `lab_id` | text | identifier (foreign key) | FK | idea_lab.id |  | 0.0% | Lab (→ idea_lab). |
| `contact_id` | text | identifier (foreign key) | FK | idea_people.id |  | 0.0% | Contact person (→ idea_people). |
| `timestamp` | text | metadata (audit/provenance) |  |  |  | 0.0% | When performed. |

## idea_protein

**Purpose:** Wild-type enzymes studied in the paper — the amide-synthesizing enzymes (e.g. AcsA, AsbA, AsbB, DesD, SfaB, DdaG) and the AS-series homolog diversity panel (AS1–AS48). One row per distinct enzyme; engineered variants live in idea_mutant.

**Rows:** 1 · **Fields:** 10 · **Completeness:** 50.0%

**Primary key:** id

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | text | identifier (primary key) | PK |  |  | 0.0% | Stable internal identifier for the enzyme. |
| `kb_protein_id` | text | identifier (external cross-reference) |  |  | KBase protein identifier | 100.0% | UNKNOWN / NOT DOCUMENTED |
| `kb_genome_id` | text | identifier (external cross-reference) |  |  | KBase genome identifier | 100.0% | UNKNOWN / NOT DOCUMENTED |
| `name` | text | category |  |  |  | 0.0% | Enzyme name as used in the paper (e.g. 'AcsA', 'AS9'). |
| `aa_sequence` | text | descriptive / free-text |  |  |  | 100.0% | Protein amino-acid sequence (populated for the six named enzymes from UniProt/PDB; AS-panel pending). |
| `dna_sequence` | text | descriptive / free-text |  |  |  | 100.0% | Coding DNA sequence (not yet populated). |
| `structure_url` | text | descriptive / free-text |  |  | RCSB PDB structure reference | 100.0% | Link to a 3-D structure (RCSB PDB) — populated for enzymes with a solved structure (e.g. DesD 7TGM). |
| `source_organism` | text | category |  |  |  | 0.0% | Organism the enzyme derives from (populated for the named enzymes). |
| `source_type` | text | category |  |  |  | 0.0% | Kind of entity — 'enzyme' here. |
| `notes` | text | category |  |  |  | 0.0% | Free-text notes. |

## idea_protocol

**Purpose:** Written protocols. Empty in this release (provenance backbone).

**Rows:** 6 · **Fields:** 3 · **Completeness:** 72.2%

**Primary key:** id

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | text | identifier (primary key) | PK |  |  | 0.0% | Row id. |
| `description` | text | descriptive / free-text |  |  |  | 0.0% | Protocol description. |
| `filename` | text | category |  |  |  | 83.3% | Protocol file. |

## idea_reactant

**Purpose:** Chemical species — both substrates (diacids, diamines, amino acids) and products (the synthesized amide diads/triads/tetrads, N66 congeners, MAXA-family isomers). One row per distinct chemical as named in the source data.

**Rows:** 8 · **Fields:** 10 · **Completeness:** 50.0%

**Primary key:** id

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | text | identifier (primary key) | PK |  |  | 0.0% | Stable internal identifier for the chemical. |
| `kb_metabolite_id` | text | identifier (external cross-reference) |  |  | KBase / ModelSEED compound identifier | 100.0% | UNKNOWN / NOT DOCUMENTED |
| `name` | text | descriptive / free-text |  |  |  | 0.0% | Chemical name as used in the paper. |
| `aliases` | text | descriptive / free-text |  |  |  | 0.0% | Alternate names (not yet populated). |
| `smiles` | text | category |  |  | SMILES (Daylight chemical line notation) | 50.0% | SMILES structure string. |
| `inchi` | text | descriptive / free-text |  |  | InChI (IUPAC International Chemical Identifier) | 100.0% | InChI structure string (not yet populated). |
| `inchi_key` | text | descriptive / free-text |  |  | InChIKey (hashed InChI) | 100.0% | InChIKey (hashed structure id) — populated for the real monomer/substrate chemicals via PubChem. |
| `molecular_formula` | text | descriptive / free-text |  |  | Molecular formula (Hill notation) | 37.5% | Molecular formula — populated for the real monomer/substrate chemicals via PubChem. |
| `molecular_weight` | real | measurement / numeric |  |  |  | 12.5% | Monoisotopic/observed mass (m/z) — populated for measured products. |
| `notes` | text | descriptive / free-text |  |  |  | 100.0% | Free-text notes, incl. whether the row is a synthesized product. |

## idea_reaction

**Purpose:** A synthesis reaction assayed in the paper — a substrate pair condensing into an amide product, grouped by reaction class (diad / triad / tetrad / MAXA / N66 synthesis).

**Rows:** 3 · **Fields:** 7 · **Completeness:** 71.4%

**Primary key:** id

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | text | identifier (primary key) | PK |  |  | 0.0% | Stable internal identifier for the reaction. |
| `kb_reaction_id` | text | identifier (external cross-reference) |  |  | KBase / ModelSEED reaction identifier | 100.0% | UNKNOWN / NOT DOCUMENTED |
| `name` | text | descriptive / free-text |  |  |  | 0.0% | Human label, e.g. 'Diad synthesis: Adipic acid and Hexamethylenediamine'. |
| `equation` | text | descriptive / free-text |  |  |  | 0.0% | The substrate pair / reaction description as given in the source. |
| `smarts` | text | descriptive / free-text |  |  | SMARTS (reaction/substructure pattern) | 100.0% | Reaction SMARTS pattern (not yet populated). |
| `reaction_type` | text | category |  |  |  | 0.0% | Reaction class: Diad / Triad / Tetrad / MAXA / N66 synthesis. |
| `notes` | text | descriptive / free-text |  |  |  | 0.0% | Free-text notes (e.g. inferred-substrate or unresolved-code flags). |

## idea_sample

**Purpose:** One assay instance — a single enzyme × substrate reaction measured in one replicate/well. The enzyme is NOT a column here; it is linked via sample_protein (a sample may carry a wild-type enzyme, an engineered mutant, or nothing at all for a no-enzyme control).

**Rows:** 27 · **Fields:** 9 · **Completeness:** 56.4%

**Primary key:** id

**Foreign keys:**
- `experiment_id` → `idea_experiment.id` (declared)
- `strain_id` → `idea_strain.id` (inferred)
- `procedure_id` → `idea_procedure.id` (uncertain)
- `parent_sample_id` → `idea_sample.id` (declared)

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | text | identifier (primary key) | PK |  |  | 0.0% | Sample identifier. |
| `name` | text | descriptive / free-text |  |  |  | 0.0% | Human label encoding enzyme\|substrate\|replicate for readability. |
| `experiment_id` | text | identifier (foreign key) | FK | idea_experiment.id |  | 0.0% | The experiment this sample belongs to (→ idea_experiment). |
| `strain_id` | text | identifier (foreign key) | FK | idea_strain.id |  | 0.0% | Host strain, if recorded (→ idea_strain). |
| `procedure_id` | text | identifier (foreign key) | FK | idea_procedure.id |  | 100.0% | Lab procedure, if recorded (→ idea_procedure). |
| `replicate` | integer | measurement / numeric |  |  |  | 0.0% | Replicate number (1..N) — each source replicate is its own sample row. |
| `parent_sample_id` | text | identifier (foreign key) | FK | idea_sample.id |  | 100.0% | Parent sample, for derived/split samples (→ idea_sample). |
| `storage_location` | text | descriptive / free-text |  |  |  | 100.0% | Plate position or storage note (e.g. 'row C col 1'). |
| `notes` | text | category |  |  |  | 92.6% | Free-text notes. |

## idea_stoichiometry

**Purpose:** Which chemicals participate in a reaction and in what role — the substrate/product membership of each idea_reaction. Negative coefficient = consumed, positive = produced.

**Rows:** 10 · **Fields:** 6 · **Completeness:** 85.0%

**Primary key:** id

**Foreign keys:**
- `idea_reaction_id` → `idea_reaction.id` (declared)
- `idea_reactant_id` → `idea_reactant.id` (declared)

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | integer | identifier (primary key) | PK |  |  | 0.0% | Row identifier. |
| `idea_reaction_id` | text | identifier (foreign key) | FK | idea_reaction.id |  | 0.0% | The reaction (→ idea_reaction). |
| `idea_reactant_id` | text | identifier (foreign key) | FK | idea_reactant.id |  | 0.0% | The participating chemical (→ idea_reactant). |
| `coefficient` | real | measurement / numeric |  |  |  | 0.0% | Stoichiometric coefficient (−1 substrate, +1 product here). |
| `role` | text | category |  |  |  | 0.0% | 'substrate' or 'product'. |
| `notes` | text | category |  |  |  | 90.0% | Free-text notes. |

## idea_strain

**Purpose:** Microbial host strains — the E. coli BL21(DE3) expression host; the no-enzyme host-lysate control samples link here.

**Rows:** 2 · **Fields:** 4 · **Completeness:** 87.5%

**Primary key:** id

**Foreign keys:**
- `parent_strain_id` → `idea_strain.id` (uncertain)

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | text | identifier (primary key) | PK |  |  | 0.0% | Row identifier. |
| `long_name` | text | category |  |  |  | 0.0% | Full strain name. |
| `short_name` | text | category |  |  |  | 0.0% | Short strain label. |
| `parent_strain_id` | text | identifier (foreign key) | FK | idea_strain.id |  | 50.0% | Parent strain, for derived strains (→ idea_strain). |

## protein_parameter

**Purpose:** Enzyme/variant-scoped numeric results — summary values attached to a protein or mutant (e.g. the averaged N66 titer with its standard deviation).

**Rows:** 86 · **Fields:** 11 · **Completeness:** 80.9%

**Primary key:** id

**Foreign keys:**
- `idea_protein_id` → `idea_protein.id` (inferred)
- `idea_mutant_id` → `idea_mutant.id` (inferred)
- `measurement_id` → `idea_measurement.id` (uncertain)
- `computation_id` → `computation.id` (uncertain)
- `idea_reaction_id` → `idea_reaction.id` (inferred)

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | text | identifier (primary key) | PK |  |  | 0.0% | Row identifier. |
| `idea_protein_id` | text | identifier (foreign key) | FK | idea_protein.id |  | 0.0% | Enzyme scope (→ idea_protein), if protein-level. |
| `idea_mutant_id` | text | identifier (foreign key) | FK | idea_mutant.id |  | 9.3% | Variant scope (→ idea_mutant), if variant-level. |
| `label` | text | category |  |  |  | 0.0% | What is measured, e.g. 'N66 L1 titer (avg)'. |
| `value` | text | measurement / numeric |  |  |  | 0.0% | The numeric value (typed REAL). |
| `unit` | text | category |  |  |  | 0.0% | Unit, e.g. mg/L. |
| `error` | text | measurement / numeric |  |  |  | 36.0% | Uncertainty — here the standard deviation of replicates. |
| `measurement_id` | text | identifier (foreign key) | FK | idea_measurement.id |  | 5.8% | Originating measurement (→ idea_measurement). |
| `computation_id` | text | identifier (foreign key) | FK | computation.id |  | 94.2% | Originating computation, if predicted (→ computation). |
| `idea_reaction_id` | text | identifier (foreign key) | FK | idea_reaction.id |  | 2.3% | Reaction context (→ idea_reaction). |
| `notes` | text | category |  |  |  | 62.8% | Free-text notes. |

## sample_parameter

**Purpose:** Per-sample measured values — the core measurement table. Each row is one number about one sample and, via the analyte link, one specific product: mass-spec intensity, titer (mg/L), or conversion (%). value is text discriminated by value_type (the EAV pattern).

**Rows:** 351 · **Fields:** 5 · **Completeness:** 92.3%

**Primary key:** id

**Foreign keys:**
- `sample_id` → `idea_sample.id` (declared)

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | integer | identifier (primary key) | PK |  |  | 0.0% | Row identifier. |
| `sample_id` | text | identifier (foreign key) | FK | idea_sample.id |  | 0.0% | The sample this value is about (→ idea_sample). |
| `label` | text | descriptive / free-text |  |  |  | 0.0% | What is measured: 'mass-spec intensity', 'titer', 'conversion', 'N66 L1 titer'. |
| `value` | text | measurement (EAV value) |  |  |  | 0.0% | The value as text (typed via value_type). |
| `unit` | text | category |  |  |  | 38.5% | Unit: intensity (a.u.), mg/L, %. |

## sample_protein

**Purpose:** Links a sample to the enzyme it contains — a wild-type protein OR an engineered mutant. A no-enzyme (negative control) sample simply has no row here.

**Rows:** 27 · **Fields:** 4 · **Completeness:** 98.1%

**Primary key:** id

**Foreign keys:**
- `sample_id` → `idea_sample.id` (declared)
- `idea_protein_id` → `idea_protein.id` (declared)
- `idea_mutant_id` → `idea_mutant.id` (inferred)

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | integer | identifier (primary key) | PK |  |  | 0.0% | Row identifier. |
| `sample_id` | text | identifier (foreign key) | FK | idea_sample.id |  | 0.0% | The sample (→ idea_sample). |
| `idea_protein_id` | text | identifier (foreign key) | FK | idea_protein.id |  | 0.0% | The wild-type enzyme, if the sample carries one (→ idea_protein). |
| `idea_mutant_id` | text | identifier (foreign key) | FK | idea_mutant.id |  | 7.4% | The engineered variant, if the sample carries one (→ idea_mutant). |

## sample_reactant

**Purpose:** Links a sample to its substrate chemical(s), with concentration where recorded.

**Rows:** 54 · **Fields:** 5 · **Completeness:** 100.0%

**Primary key:** id

**Foreign keys:**
- `sample_id` → `idea_sample.id` (declared)
- `idea_reactant_id` → `idea_reactant.id` (declared)

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | integer | identifier (primary key) | PK |  |  | 0.0% | Row identifier. |
| `sample_id` | text | identifier (foreign key) | FK | idea_sample.id |  | 0.0% | The sample (→ idea_sample). |
| `idea_reactant_id` | text | identifier (foreign key) | FK | idea_reactant.id |  | 0.0% | The substrate chemical (→ idea_reactant). |
| `concentration` | real | measurement / numeric |  |  |  | 0.0% | Substrate concentration, if recorded. |
| `concentration_unit` | text | category |  |  |  | 0.0% | Concentration unit. |

## sample_reaction

**Purpose:** Links a sample to the reaction(s) it assays; is_primary marks the main reaction of the sample.

**Rows:** 54 · **Fields:** 4 · **Completeness:** 100.0%

**Primary key:** id

**Foreign keys:**
- `sample_id` → `idea_sample.id` (declared)
- `idea_reaction_id` → `idea_reaction.id` (declared)

| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |
|-------|------|------|-------|---------|----------|-----------|---------|
| `id` | integer | identifier (primary key) | PK |  |  | 0.0% | Row identifier. |
| `sample_id` | text | identifier (foreign key) | FK | idea_sample.id |  | 0.0% | The sample (→ idea_sample). |
| `idea_reaction_id` | text | identifier (foreign key) | FK | idea_reaction.id |  | 0.0% | The reaction assayed (→ idea_reaction). |
| `is_primary` | boolean | measurement / numeric |  |  |  | 0.0% | True if this is the sample's primary reaction. |
