"""Curated, human-readable knowledge for the tetrad_v1 IDEAS Iceberg warehouse.

Kept separate from the mechanical analysis (analyze_iceberg.py) so the domain
descriptions can be edited without touching the pipeline. Everything here is
about the *new* 12-table typed schema delivered as an Apache Iceberg export.
"""

# ------------------------------------------------------------------ tables
# name -> (bridge_class, one-line description)
TABLE_DESC = {
    "idea_experiment": (
        "Investigation / Process",
        "The study (investigation) that produced the samples — here the tetrad "
        "oligoamide-synthesis campaign. One row per experiment.",
    ),
    "idea_sample": (
        "Sample",
        "Every assay sample / replicate. The hub of the schema: each sample "
        "belongs to an experiment and a strain and is the thing that gets "
        "measured, has proteins expressed in it, and has substrates and "
        "reactions attached.",
    ),
    "idea_protein": (
        "Reference entity",
        "The enzymes (and engineered variants) studied — amino-acid and DNA "
        "sequence, source organism, and a link to a predicted/known structure.",
    ),
    "idea_reactant": (
        "Reference entity",
        "The chemical species — substrates, cofactors and synthesized products "
        "— with structure notations (SMILES / InChI / InChIKey), molecular "
        "formula and weight.",
    ),
    "idea_reaction": (
        "Reference entity / Process",
        "The chemical reactions studied, with a human equation and a machine "
        "SMARTS reaction pattern.",
    ),
    "idea_stoichiometry": (
        "Association",
        "Which reactants take part in which reaction and in what role "
        "(substrate / product) and coefficient — the reaction↔reactant "
        "membership table.",
    ),
    "idea_measurement": (
        "Observation / Measurement event",
        "One row per measurement event on a sample (e.g. a mass-spec or LC-MS "
        "run), with the assay type and the source data file. The individual "
        "numbers produced live in sample_parameter.",
    ),
    "sample_parameter": (
        "Measurement (Attribute / Value)",
        "The core measured-value table, stored as attribute/value/unit triples: "
        "each row is one measured number for one sample (optionally scoped to a "
        "reactant and/or reaction) — titer, conversion, mass-spec intensity, …",
    ),
    "sample_protein": (
        "Association",
        "Which protein (and, where relevant, which engineered variant) is "
        "present in each sample — the sample↔protein junction.",
    ),
    "sample_reactant": (
        "Association + Measurement",
        "Which reactants were added to each sample and at what concentration — "
        "the sample↔reactant junction, carrying a typed concentration + unit.",
    ),
    "sample_reaction": (
        "Association",
        "Which reaction(s) each sample is running, flagging the primary one — "
        "the sample↔reaction junction.",
    ),
    "idea_dbxref": (
        "Cross-reference / PID",
        "Links every IDEAS entity out to an authoritative external database "
        "(UniProt, PDB, PubChem, …) via a database name + accession + "
        "resolvable URL. The dataset's persistent-identifier bridge.",
    ),
}

# ------------------------------------------------------------------ columns
# "table.field" -> description. Audit columns handled generically below.
COL_DESC = {
    "idea_experiment.id": "Experiment identifier (CURIE, e.g. EXP:tetrad-synthesis).",
    "idea_experiment.start_date": "Date the experiment began.",
    "idea_experiment.type": "Kind of experiment / campaign.",
    "idea_experiment.index_num": "Ordinal index of the experiment.",
    "idea_experiment.description": "Free-text description of the experiment.",

    "idea_sample.id": "Sample identifier (CURIE, e.g. SMP:1).",
    "idea_sample.name": "Human-readable sample / well name.",
    "idea_sample.experiment_id": "The experiment this sample belongs to.",
    "idea_sample.strain_id": "The strain the sample was grown from.",
    "idea_sample.replicate": "Replicate number within the experiment.",
    "idea_sample.sample_type": "Sample category (e.g. lysate, purified, control).",
    "idea_sample.parent_sample_id": "Parent sample this was derived from (self-reference).",
    "idea_sample.storage_location": "Where the physical sample is stored.",

    "idea_protein.id": "Protein identifier.",
    "idea_protein.name": "Protein / enzyme name.",
    "idea_protein.aa_sequence": "Amino-acid sequence (one-letter).",
    "idea_protein.dna_sequence": "Coding DNA sequence.",
    "idea_protein.structure_url": "Link to a predicted or experimental 3-D structure.",
    "idea_protein.source_organism": "Organism the protein comes from.",
    "idea_protein.source_type": "Provenance of the sequence (natural / designed / …).",

    "idea_reactant.id": "Reactant (chemical) identifier.",
    "idea_reactant.name": "Chemical name.",
    "idea_reactant.aliases": "Alternative names / synonyms.",
    "idea_reactant.smiles": "SMILES structure notation.",
    "idea_reactant.inchi": "IUPAC InChI structure notation.",
    "idea_reactant.inchi_key": "Hashed InChIKey (structure lookup key).",
    "idea_reactant.molecular_formula": "Molecular formula (Hill system).",
    "idea_reactant.molecular_weight": "Molecular weight (g/mol).",

    "idea_reaction.id": "Reaction identifier.",
    "idea_reaction.name": "Reaction name.",
    "idea_reaction.equation": "Human-readable reaction equation.",
    "idea_reaction.smarts": "SMARTS reaction pattern (machine-readable).",
    "idea_reaction.reaction_type": "Classification of the reaction.",

    "idea_stoichiometry.id": "Stoichiometry row identifier.",
    "idea_stoichiometry.idea_reaction_id": "The reaction this membership belongs to.",
    "idea_stoichiometry.idea_reactant_id": "The reactant taking part.",
    "idea_stoichiometry.coefficient": "Stoichiometric coefficient.",
    "idea_stoichiometry.role": "Role of the reactant (substrate / product / cofactor).",

    "idea_measurement.id": "Measurement-event identifier.",
    "idea_measurement.sample_id": "Sample this measurement was taken on.",
    "idea_measurement.type": "Assay / instrument type (e.g. mass-spec, LC-MS quantitation).",
    "idea_measurement.filename": "Source raw/processed data file for this measurement.",

    "sample_parameter.id": "Measured-value row identifier.",
    "sample_parameter.sample_id": "Sample the value was measured on.",
    "sample_parameter.idea_reactant_id": "Reactant the value is scoped to (e.g. which analyte).",
    "sample_parameter.idea_reaction_id": "Reaction the value is scoped to.",
    "sample_parameter.label": "What was measured — the attribute name (e.g. titer, conversion, mass-spec intensity).",
    "sample_parameter.value": "The measured value (stored as text; value_type gives its type).",
    "sample_parameter.value_type": "Declared type of the value (e.g. real).",
    "sample_parameter.unit": "Unit of the measured value.",

    "sample_protein.id": "Junction row identifier.",
    "sample_protein.sample_id": "The sample.",
    "sample_protein.idea_protein_id": "The protein present in the sample.",
    "sample_protein.idea_mutant_id": "The engineered variant present, if any (no mutant table in this release).",

    "sample_reactant.id": "Junction row identifier.",
    "sample_reactant.sample_id": "The sample.",
    "sample_reactant.idea_reactant_id": "The reactant added.",
    "sample_reactant.concentration": "Concentration of the reactant in the sample.",
    "sample_reactant.concentration_unit": "Unit of the concentration.",

    "sample_reaction.id": "Junction row identifier.",
    "sample_reaction.sample_id": "The sample.",
    "sample_reaction.idea_reaction_id": "The reaction the sample runs.",
    "sample_reaction.is_primary": "Whether this is the sample's primary reaction.",

    "idea_dbxref.id": "Cross-reference row identifier.",
    "idea_dbxref.entity_type": "Which kind of entity this cross-reference is for (protein, reactant, …).",
    "idea_dbxref.entity_id": "The IDEAS entity id being cross-referenced.",
    "idea_dbxref.database_name": "External database name (UniProt, PDB, PubChem, …).",
    "idea_dbxref.accession": "The accession / identifier in that external database.",
    "idea_dbxref.url": "Resolvable URL for the external record.",
}

AUDIT_DESC = {
    "created_at": "Row creation timestamp (provenance).",
    "updated_at": "Row last-updated timestamp (provenance).",
    "created_by": "Who/what created the row — here the ETL steward (provenance).",
}

# Logical foreign keys (no DDL in an Iceberg export, so these are declared by
# the data model + verified by value coverage in analyze_iceberg.py).
#   child_table, child_field, parent_table, parent_field
FKS = [
    ("idea_sample", "experiment_id", "idea_experiment", "id"),
    ("idea_sample", "parent_sample_id", "idea_sample", "id"),
    ("idea_measurement", "sample_id", "idea_sample", "id"),
    ("sample_parameter", "sample_id", "idea_sample", "id"),
    ("sample_parameter", "idea_reactant_id", "idea_reactant", "id"),
    ("sample_parameter", "idea_reaction_id", "idea_reaction", "id"),
    ("sample_protein", "sample_id", "idea_sample", "id"),
    ("sample_protein", "idea_protein_id", "idea_protein", "id"),
    ("sample_reactant", "sample_id", "idea_sample", "id"),
    ("sample_reactant", "idea_reactant_id", "idea_reactant", "id"),
    ("sample_reaction", "sample_id", "idea_sample", "id"),
    ("sample_reaction", "idea_reaction_id", "idea_reaction", "id"),
    ("idea_stoichiometry", "idea_reaction_id", "idea_reaction", "id"),
    ("idea_stoichiometry", "idea_reactant_id", "idea_reactant", "id"),
]

# columns carrying a structured chemical/biological notation -> ONTO_REF key in app.js
ONTOLOGY_COLS = {
    "smiles": "smiles",
    "inchi": "inchi",
    "inchi_key": "inchi_key",
    "molecular_formula": "molecular_formula",
    "smarts": "smarts",
    "structure_url": "structure_url",
}

# Plain-language project narrative, distilled from the BRIDGE Data Modeling Team
# weekly meeting notes. Rendered on the "Project" page and reused in the README.
PROJECT = {
    "name": "BRIDGE — Data Modeling Team",
    "mission": "Produce well-modeled parquet / Iceberg files for the project's "
               "targeted data resources, each backed by a shared LinkML schema.",
    "what_is_it": [
        "BRIDGE is a U.S. Dept. of Energy (Biological & Environmental Research) "
        "effort to build a federated, AI-ready data ecosystem for bioscience — "
        "an \"American Science Cloud\" for biology. Its central idea is a "
        "closed loop between automated/robotic experiments and AI models: "
        "because biology has few first-principles models, the project leans "
        "heavily on experiments both to generate data and to keep AI "
        "predictions honest.",
        "Three lead laboratories drive it: Argonne (transforming protein "
        "engineering — this IDEAS dataset is Argonne's contribution), Berkeley "
        "+ PNNL (microbial functions for bio-based manufacturing), and Oak "
        "Ridge (bio-design for critical-material supply), with Livermore and "
        "Los Alamos joining as it grows.",
        "The Data Modeling (DM) Team — whose meeting notes this summary is "
        "drawn from — is the sub-team that makes each lab's data usable "
        "together: give every dataset a schema (in LinkML), register it, "
        "harmonize the schemas toward a shared core, and ETL the data into a "
        "shared lakehouse as parquet / Iceberg tables.",
    ],
    "goals": [
        "Schema development — every dataset that is ingested must have a LinkML schema.",
        "Schema registry — every schema goes into the shared registry (ber-data/lakehouse-registry).",
        "Schema harmonization — converge on a small, shared \"bridge-central-schema\".",
        "Schema workshopping — recurring hackathons that model one data type at a time.",
        "Data in the lakehouse — deliver each resource as query-ready parquet / Iceberg.",
        "Persistent, resolvable identifiers (PIDs) for every entity, using CURIEs / "
        "Bioregistry prefixes and, ideally, a central ID resolver.",
    ],
    "base_classes": [
        ("Samples", "The physical or biological things studied.",
         ["idea_sample", "idea_experiment"]),
        ("Measurements / Observations", "What was measured about a sample — modeled "
         "as attribute/value/unit collections plus measurement events.",
         ["idea_measurement", "sample_parameter", "sample_reactant"]),
        ("Processes", "The reactions / procedures that act on samples.",
         ["idea_reaction", "idea_stoichiometry"]),
        ("Reference entities", "Reusable catalog entities referenced by samples and measurements.",
         ["idea_protein", "idea_reactant"]),
        ("Associations", "Flat join tables linking samples to entities and processes.",
         ["sample_protein", "sample_reactant", "sample_reaction", "idea_stoichiometry"]),
        ("Cross-references / PIDs", "Links out to authoritative external databases.",
         ["idea_dbxref"]),
    ],
    "progress": [
        "The IDEAS (Argonne protein-engineering) dataset shown here has been delivered "
        "as a typed Apache Iceberg warehouse (v2) with full snapshot history — the "
        "\"example data + schema\" deliverable in a real open-table format.",
        "Other resources are moving in parallel: the BASALT schema is finished and "
        "MONet data is loaded into Iceberg; AMP2 is in progress.",
        "LinkML lunch-and-learn training (project setup, the modeling language, "
        "validation & serialization) has been delivered to the team.",
        "The team settled on DuckDB as the practical bridge between LinkML and "
        "parquet/Iceberg, and on a small flat base model — Samples, "
        "Measurements/Observations, Processes, Datasets — that each resource "
        "specializes via LinkML \"implements / instantiates\".",
    ],
    "immediate": [
        "Oct 1, 2026 milestone: every resource provides example data + a schema.",
        "The first modeling hackathon (weekly, starting Sep 30, 2026) is focused on "
        "Measurements / Observations — exactly the part of this dataset highlighted "
        "on the Measurements page.",
        "Build a top-down central model + visualization, and demonstrate AI-assisted "
        "verification of schema transformations.",
        "Firm up the attribute/value pattern for measurements, require units to carry "
        "ontology terms (UO / UCUM), and require provenance (data steward) on records.",
    ],
    "how_ideas_fits": [
        "This IDEAS tetrad dataset is a near-perfect instance of the BRIDGE base "
        "model: idea_sample = Samples; idea_measurement + sample_parameter = "
        "Measurements/Observations (as attribute/value/unit); idea_reaction + "
        "idea_stoichiometry = Processes; idea_protein + idea_reactant = reference "
        "entities; the sample_* tables are the flat Association/join tables; and "
        "idea_dbxref supplies the resolvable cross-reference PIDs.",
        "Identifiers already follow the CURIE convention the team wants "
        "(e.g. SMP:1, EXP:tetrad-synthesis), and every row carries provenance "
        "(created_by / created_at / updated_at).",
    ],
    "source": "BRIDGE Data Modeling Team — weekly meeting notes (Apr–Sep 2026).",
}
