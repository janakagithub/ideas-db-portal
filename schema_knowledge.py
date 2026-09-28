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
    # ---- tables that exist ONLY in the earlier release (dropped in tetrad_v1) ----
    "protein_parameter": (
        "Measurement (Attribute / Value)",
        "Computed / structural metrics for a protein or engineered variant — "
        "attribute/value/unit rows for ESM-1v scores, AlphaFold pLDDT, MD "
        "RMSD, relative abundances and fold-change to wild type. The "
        "computational counterpart of sample_parameter (dropped in tetrad_v1).",
    ),
    "idea_mutant": (
        "Reference entity",
        "Engineered protein variants — the mutation list applied to a parent "
        "protein, its (optional) sequence, how it was designed and a link to "
        "the AI design that proposed it. (Dropped in tetrad_v1.)",
    ),
    "ai_design": (
        "Process",
        "AI-guided design proposals — the method / model, the proposed "
        "mutations and sequence, optimization targets and multi-objective "
        "(Pareto) scores, and whether the candidate was picked for testing. "
        "(Dropped in tetrad_v1.)",
    ),
    "computation": (
        "Process",
        "Computational jobs run on a protein / variant / reaction — structure "
        "prediction, ML scoring or MD simulation — with model name, compute "
        "platform, parameters and the output file. (Dropped in tetrad_v1.)",
    ),
    "idea_procedure": (
        "Process",
        "A concrete execution of a protocol in a lab by a contact person on a "
        "date — the wet/dry-lab procedure record referenced by samples and "
        "measurements. (Dropped in tetrad_v1.)",
    ),
    "idea_protocol": (
        "Process",
        "Reusable protocol definitions (a method description + an attached "
        "file) that procedures instantiate. (Dropped in tetrad_v1.)",
    ),
    "idea_strain": (
        "Sample / Reference entity",
        "Host strains the samples were grown from (e.g. E. coli BL21(DE3)), "
        "with a parent-strain self-reference. (Dropped in tetrad_v1.)",
    ),
    "idea_lab": (
        "Agent",
        "The laboratories participating in the campaign (name + location). "
        "(Dropped in tetrad_v1.)",
    ),
    "idea_people": (
        "Agent",
        "People (contacts) associated with the labs and procedures. "
        "(Dropped in tetrad_v1.)",
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

    # ---- columns REMOVED in tetrad_v1 (present only in the earlier release) ----
    "idea_experiment.procedure_id": "Procedure that produced the experiment (removed in tetrad_v1).",
    "idea_measurement.procedure_id": "Procedure the measurement followed (removed in tetrad_v1).",
    "idea_sample.procedure_id": "Procedure that produced the sample (removed in tetrad_v1).",
    "idea_protein.kb_protein_id": "KBase protein identifier cross-reference (removed in tetrad_v1).",
    "idea_protein.kb_genome_id": "KBase genome identifier cross-reference (removed in tetrad_v1).",
    "idea_reactant.kb_metabolite_id": "KBase/ModelSEED metabolite cross-reference (removed in tetrad_v1).",
    "idea_reaction.kb_reaction_id": "KBase/ModelSEED reaction cross-reference (removed in tetrad_v1).",

    # ---- earlier-only tables ----
    "protein_parameter.id": "Metric row identifier.",
    "protein_parameter.idea_protein_id": "Protein the metric is about.",
    "protein_parameter.idea_mutant_id": "Engineered variant the metric is about, if any.",
    "protein_parameter.label": "What was computed — the attribute name (esm1v_score, pLDDT, RMSD_equilibrium, …).",
    "protein_parameter.value": "The computed value (stored as text).",
    "protein_parameter.unit": "Unit / scale of the value (log_likelihood_ratio, score, angstrom, relative_abundance, fold).",
    "protein_parameter.error": "Uncertainty / error estimate on the value.",
    "protein_parameter.measurement_id": "Measurement event this metric is linked to, if any.",
    "protein_parameter.computation_id": "Computation job that produced this metric, if any.",
    "protein_parameter.idea_reaction_id": "Reaction the metric is scoped to, if any.",
    "protein_parameter.notes": "Free-text note on the metric.",

    "idea_mutant.id": "Variant identifier.",
    "idea_mutant.idea_protein_id": "Parent protein this variant derives from.",
    "idea_mutant.mutations": "Mutation list applied (e.g. V213K).",
    "idea_mutant.aa_sequence": "Variant amino-acid sequence (if recorded).",
    "idea_mutant.dna_sequence": "Variant coding DNA sequence (if recorded).",
    "idea_mutant.design_method": "How the variant was designed (e.g. directed_evolution).",
    "idea_mutant.ai_design_id": "The AI design proposal this variant realizes, if any.",
    "idea_mutant.notes": "Free-text note.",

    "ai_design.id": "AI-design proposal identifier.",
    "ai_design.idea_protein_id": "Parent protein being redesigned.",
    "ai_design.design_method": "Design strategy (generative_model, bayesian_optimization, evolutionary_algorithm).",
    "ai_design.model_name": "Model(s) used (e.g. ESM+NSGA-III, ProteinMPNN).",
    "ai_design.proposed_mutations": "Mutations proposed by the design.",
    "ai_design.proposed_sequence": "Full proposed sequence, if given.",
    "ai_design.optimization_target": "Objective(s) optimized (activity, stability, selectivity).",
    "ai_design.optimization_algorithm": "Multi-objective algorithm used (NSGA-II/III, Bayesian).",
    "ai_design.generation": "Design-campaign generation / round.",
    "ai_design.objective_scores": "Predicted objective scores (JSON).",
    "ai_design.pareto_rank": "Rank on the Pareto front.",
    "ai_design.pareto_optimal": "Whether the candidate is Pareto-optimal (0/1).",
    "ai_design.selected_for_testing": "Whether the candidate was chosen for wet-lab testing (0/1).",
    "ai_design.design_rationale": "Human rationale for the proposal.",
    "ai_design.run_date": "Date the design was produced.",
    "ai_design.notes": "Free-text note.",

    "computation.id": "Computation-job identifier.",
    "computation.idea_protein_id": "Protein the job ran on.",
    "computation.idea_mutant_id": "Variant the job ran on, if any.",
    "computation.idea_reaction_id": "Reaction context, if any.",
    "computation.procedure_id": "Procedure this computation followed.",
    "computation.type": "Job type (structure_prediction, ml_model, MD).",
    "computation.model_name": "Software / model used (AlphaFold2, ESM-1v, OpenMM).",
    "computation.compute_platform": "Where it ran (local, Aurora).",
    "computation.simulation_params": "Job parameters (JSON).",
    "computation.run_date": "Date the job ran.",
    "computation.filename": "Output file produced.",
    "computation.notes": "Free-text note.",

    "idea_procedure.id": "Procedure identifier.",
    "idea_procedure.protocol_id": "Protocol this procedure instantiates.",
    "idea_procedure.lab_id": "Lab that executed it.",
    "idea_procedure.contact_id": "Person responsible.",
    "idea_procedure.timestamp": "When the procedure was carried out.",

    "idea_protocol.id": "Protocol identifier.",
    "idea_protocol.description": "What the protocol does.",
    "idea_protocol.filename": "Attached protocol file, if any.",

    "idea_strain.id": "Strain identifier.",
    "idea_strain.long_name": "Full strain name (e.g. E. coli BL21(DE3)).",
    "idea_strain.short_name": "Short strain label.",
    "idea_strain.parent_strain_id": "Parent strain (self-reference).",

    "idea_lab.id": "Lab identifier.",
    "idea_lab.name": "Laboratory name.",
    "idea_lab.location": "Institution / site (ANL, ORNL).",

    "idea_people.id": "Person identifier.",
    "idea_people.first_name": "Given name.",
    "idea_people.last_name": "Family name.",
    "idea_people.email": "Contact email.",
    "idea_people.lab_id": "Lab the person belongs to.",

    # columns present only in the earlier idea_sample / idea_protein
    "idea_sample.strain_id (earlier)": "Host strain (earlier release linked to idea_strain).",
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

# Additional logical FKs that only apply to the EARLIER release (the tables /
# columns they reference were dropped in tetrad_v1). Kept separate so the
# tetrad_v1-only analysis is unaffected; merged into FKS at load time.
FKS_EARLIER = [
    ("protein_parameter", "idea_protein_id", "idea_protein", "id"),
    ("protein_parameter", "idea_mutant_id", "idea_mutant", "id"),
    ("protein_parameter", "idea_reaction_id", "idea_reaction", "id"),
    ("protein_parameter", "computation_id", "computation", "id"),
    ("protein_parameter", "measurement_id", "idea_measurement", "id"),
    ("idea_mutant", "idea_protein_id", "idea_protein", "id"),
    ("idea_mutant", "ai_design_id", "ai_design", "id"),
    ("ai_design", "idea_protein_id", "idea_protein", "id"),
    ("computation", "idea_protein_id", "idea_protein", "id"),
    ("computation", "idea_mutant_id", "idea_mutant", "id"),
    ("computation", "idea_reaction_id", "idea_reaction", "id"),
    ("computation", "procedure_id", "idea_procedure", "id"),
    ("sample_protein", "idea_mutant_id", "idea_mutant", "id"),
    ("idea_sample", "strain_id", "idea_strain", "id"),
    ("idea_procedure", "protocol_id", "idea_protocol", "id"),
    ("idea_procedure", "lab_id", "idea_lab", "id"),
    ("idea_procedure", "contact_id", "idea_people", "id"),
    ("idea_people", "lab_id", "idea_lab", "id"),
    ("idea_strain", "parent_strain_id", "idea_strain", "id"),
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

# ------------------------------------------------------------ measured parameters
# Plain-language meaning + physical quantity for every measured attribute across
# BOTH releases. Used by the Measurements catalogue. quantity groups params on
# the page; kind distinguishes what sort of number it is.
#   label -> (quantity, kind, plain-language meaning)
PARAM_DESC = {
    # --- tetrad_v1 assay READOUTS (new; the actual outputs of the assay) ---
    "titer": ("Product titer", "assay readout",
              "How much product the reaction made, as a concentration (mg per litre)."),
    "conversion": ("Conversion", "assay readout",
                   "Fraction of substrate turned into product, in percent."),
    "mass-spec intensity": ("Mass-spec intensity", "assay readout",
                            "Raw mass-spectrometry peak intensity (arbitrary units) for an analyte."),
    # --- earlier sample_parameter CONDITIONS (reaction set-up, not outputs) ---
    "ATP_mM": ("Reagent concentration", "condition",
               "ATP cofactor concentration in the reaction (millimolar)."),
    "MgCl2_mM": ("Reagent concentration", "condition",
                 "Magnesium chloride concentration in the reaction (millimolar)."),
    "buffer_concentration_mM": ("Reagent concentration", "condition",
                                "Buffer concentration in the reaction (millimolar)."),
    "buffer": ("Reaction set-up", "condition", "Which buffer system was used."),
    "pH": ("Reaction set-up", "condition", "pH of the reaction mixture."),
    "temperature_C": ("Temperature", "condition",
                      "Incubation temperature (degrees Celsius)."),
    "incubation_time_h": ("Time", "condition", "How long the reaction was incubated (hours)."),
    "shaking_rpm": ("Agitation", "condition", "Shaking speed during incubation (rpm)."),
    "lysate_volume_uL": ("Volume", "condition", "Cell-lysate volume added (microlitres)."),
    "total_volume_uL": ("Volume", "condition", "Total reaction volume (microlitres)."),
    "nylon_type": ("Reaction set-up", "condition", "Nylon substrate type used."),
    "project": ("Provenance", "condition", "Project/campaign label carried on the sample."),
    "well_position": ("Provenance", "condition", "Plate well the sample sat in."),
    # --- earlier protein_parameter METRICS (computed/structural) ---
    "esm1v_score": ("Predicted fitness", "computed metric",
                    "ESM-1v zero-shot log-likelihood ratio — a language-model estimate of how "
                    "tolerated a mutation is (higher = more favourable)."),
    "pLDDT": ("Structure confidence", "computed metric",
              "AlphaFold per-residue confidence score (0–100) for the predicted structure."),
    "RMSD_equilibrium": ("Structure stability", "computed metric",
                         "Root-mean-square deviation at MD equilibrium (ångström) — how much the "
                         "structure drifts; lower = more stable."),
    "N66_L1_abundance": ("Relative abundance", "computed metric",
                         "Relative abundance of the N66 L1 species (proteomics ratio)."),
    "N66_L2_abundance": ("Relative abundance", "computed metric",
                         "Relative abundance of the N66 L2 species (proteomics ratio)."),
    "foldchange_to_WT": ("Fold change", "computed metric",
                         "Activity fold-change of a variant relative to wild type."),
}

# ------------------------------------------------------------ LinkML base classes
# Canonical BRIDGE base class each table specializes ("implements/instantiates").
# The base model is Samples / Measurements-Observations / Processes / Datasets,
# plus the supporting Reference / Association / CrossReference / Agent classes.
BASE_CLASS = {
    "idea_experiment": "Investigation",
    "idea_sample": "Sample",
    "idea_strain": "Sample",
    "idea_protein": "ReferenceEntity",
    "idea_reactant": "ReferenceEntity",
    "idea_mutant": "ReferenceEntity",
    "idea_reaction": "Process",
    "idea_procedure": "Process",
    "idea_protocol": "Process",
    "ai_design": "Process",
    "computation": "Process",
    "idea_stoichiometry": "Association",
    "idea_measurement": "Observation",
    "sample_parameter": "MeasurementValue",
    "protein_parameter": "MeasurementValue",
    "sample_protein": "Association",
    "sample_reactant": "Association",
    "sample_reaction": "Association",
    "idea_dbxref": "CrossReference",
    "idea_lab": "Agent",
    "idea_people": "Agent",
}

# Human-readable description of each base class (rendered on the LinkML page).
BASE_CLASS_DESC = {
    "Sample": "A physical or biological thing that is studied and measured.",
    "Observation": "A measurement EVENT on a sample (an assay run / instrument reading).",
    "MeasurementValue": "One measured number, modeled as attribute + value + unit (EAV).",
    "Process": "An activity that acts on samples/entities (reaction, procedure, computation, design).",
    "ReferenceEntity": "A reusable catalog entity referenced by samples and measurements (protein, reactant, variant).",
    "Association": "A flat join linking a sample to an entity or process.",
    "CrossReference": "A resolvable link out to an authoritative external database (a PID bridge).",
    "Investigation": "The overarching study/campaign that groups samples.",
    "Agent": "A person or organization that performed or is responsible for something.",
}

# UCUM / ontology code for each measured unit (units must carry ontology terms).
UNIT_UCUM = {
    "mg/L": "mg/L", "%": "%", "intensity (a.u.)": "{a.u.}",
    "mM": "mmol/L", "C": "Cel", "h": "h", "rpm": "{rpm}", "uL": "uL",
    "angstrom": "Ao", "fold": "{fold}", "relative_abundance": "{ratio}",
    "score": "{score}", "log_likelihood_ratio": "{LLR}",
}

# CURIE / prefix map for the LinkML `prefixes:` block (bioregistry-style).
LINKML_PREFIXES = {
    "linkml": "https://w3id.org/linkml/",
    "ideas": "https://w3id.org/ideas/",
    "SMP": "https://w3id.org/ideas/sample/",
    "EXP": "https://w3id.org/ideas/experiment/",
    "PROT": "https://w3id.org/ideas/protein/",
    "RXN": "https://w3id.org/ideas/reaction/",
    "RCT": "https://w3id.org/ideas/reactant/",
    "UO": "http://purl.obolibrary.org/obo/UO_",
    "UCUM": "https://ucum.org/",
    "CHEBI": "http://purl.obolibrary.org/obo/CHEBI_",
    "uniprot": "https://bioregistry.io/uniprot:",
    "pdb": "https://bioregistry.io/pdb:",
    "pubchem.compound": "https://bioregistry.io/pubchem.compound:",
}

# BRIDGE modeling rules (from the notes) + how this dataset satisfies each.
# Rendered as a checklist on the LinkML page.
LINKML_RULES = [
    ("Every ingested dataset has a LinkML schema",
     "This schema (ideas.linkml.yaml) is generated for the full merged IDEAS dataset and "
     "is downloadable from this page."),
    ("Specialize a small shared base model (Samples, Measurements/Observations, Processes, Datasets)",
     "Each table declares the BRIDGE base class it instantiates via a class_uri / is_a mapping "
     "— see the class map below."),
    ("Model measurements as attribute / value / unit (EAV)",
     "sample_parameter and protein_parameter are MeasurementValue classes with label (attribute), "
     "value and unit slots — the exact pattern the first hackathon targets."),
    ("Units must carry ontology terms (UCUM / UO)",
     "Every unit slot is annotated with its UCUM code (e.g. mg/L → mg/L, mM → mmol/L, "
     "ångström → Ao); see the unit table."),
    ("Persistent, resolvable identifiers as CURIEs (bioregistry prefixes)",
     "id slots are identifiers with id_prefixes (SMP, EXP, PROT, RXN, RCT) and the prefixes block "
     "maps each to a resolvable w3id / bioregistry base URI."),
    ("Provenance / credit on every record",
     "A ProvenanceMixin (created_at, updated_at, created_by) is mixed into the tetrad_v1 classes; "
     "cross-references (idea_dbxref) resolve entities to external PIDs."),
    ("Register the schema in the shared registry",
     "Target: github.com/ber-data/lakehouse-registry — the generated YAML is registry-ready."),
]

# Things present in the EARLIER release but dropped in tetrad_v1 that matter for
# the science / the hackathon. Rendered in the "What changed" summary.
#   (item, why it is essential)
ESSENTIAL_MISSING = [
    ("protein_parameter table (86 rows)",
     "The computational/structural metrics — ESM-1v fitness, AlphaFold pLDDT, MD RMSD, "
     "relative abundances, fold-change to WT — that link AI predictions to lab results. "
     "Central to the AI↔experiment loop BRIDGE is built around."),
    ("Reaction-condition parameters in sample_parameter",
     "temperature, pH, buffer & buffer_concentration, ATP/MgCl2, incubation time, shaking rpm, "
     "lysate/total volumes — the assay set-up. Without them a measured titer/conversion cannot be "
     "reproduced or compared across samples. The Measurements hackathon needs method+conditions."),
    ("idea_mutant table (21 rows)",
     "The engineered protein variants themselves (mutation lists). sample_protein.idea_mutant_id "
     "still points at them, so in tetrad_v1 those references are unresolvable."),
    ("ai_design table (5 rows)",
     "The AI design proposals (models, proposed mutations, Pareto scores) — the 'AI' half of the "
     "AI-guided design story."),
    ("computation table (5 rows)",
     "The compute jobs (AlphaFold, ESM-1v, MD) that produced the protein metrics — provenance for "
     "the computed values."),
    ("idea_procedure / idea_protocol (6 + 6 rows)",
     "The wet/dry-lab methods and their executions. tetrad_v1 dropped procedure_id from several "
     "tables, severing samples/measurements from their method."),
    ("idea_lab / idea_people / idea_strain (2 + 6 + 2 rows)",
     "Who did the work, where, and in which host strain — provenance/agent and biological-source "
     "context."),
    ("KBase cross-references (kb_protein_id, kb_genome_id, kb_metabolite_id, kb_reaction_id)",
     "Links out to KBase/ModelSEED entities — external identifiers useful for harmonization."),
]

# What the first BRIDGE modeling hackathon is about (from the notes) — rendered
# on the Measurements page as plain-language framing.
HACKATHON = {
    "title": "First BRIDGE modeling hackathon — Measurements / Observations",
    "when": "Weekly on Wednesdays, starting Sep 30 2026 (11:00–13:30 PT / 14:00–16:30 ET).",
    "focus": "Model the Measurements/Observations data type into a reusable LinkML component "
             "in the shared bridge-common-schema.",
    "pattern": [
        "Sample → Observation Unit → Measurement: a sample is observed, and each observation "
        "produces one or more measured values.",
        "Each measurement is an attribute + value + unit triple (the EAV pattern) — and the unit "
        "should carry an ontology term (UCUM / UO / BERVO).",
        "Measurement + unit + method are often grouped together, because the same quantity can "
        "differ only by how it was produced (the instrument / method).",
    ],
    "homework": [
        "Describe the measurement data you are bringing (types, units, methods).",
        "Map your measurements onto the shared base Measurement class.",
        "Bring example data + a LinkML schema (the Oct 1 2026 milestone).",
        "Flag units that need ontology terms and identifiers that need CURIEs.",
    ],
    "how_this_dataset_helps": "This portal already exposes IDEAS measurements in exactly this "
        "shape: idea_measurement = observation events, sample_parameter / protein_parameter = "
        "attribute/value/unit measured values, each unit UCUM-coded — a ready worked example for "
        "the workshop.",
}
