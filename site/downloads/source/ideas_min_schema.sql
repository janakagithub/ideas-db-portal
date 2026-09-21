-- =====================================================================
-- IDEAS tenant — typed schema — tetrad-synthesis dataset (v3, DesD/NIS oligoamide synthesis only) (enriched: compounds+structures, enzyme seqs, BL21→strain; empty tables dropped)
-- IDEAS tenant — minimal typed schema (derived from v9 prototype)
-- Target: BERDL lakehouse, tenant `ideas` (Iceberg). Types shown in ANSI SQL;
-- Iceberg mapping: TEXT->string, INTEGER->int/bigint, REAL->double,
-- BOOLEAN->boolean, DATE->date, DATETIME->timestamp.
-- Design arc: ideas-datalake-development. Reuses v9; applies decision G1.
--
-- Grouping:  [PAPER]    = required to serve the publication's data
--            [INTEGRITY]= relationship/provenance backbone
--            [OPTIONAL] = platform-valuable, not required by this paper
-- Every table carries created_at / updated_at / created_by (audit, from v9).
-- =====================================================================

-- ---------- Entities ----------

-- [PAPER] enzymes / proteins (DdaG, SfaB, AcsA, AsbA, DesD, AS-series, Control)
CREATE TABLE idea_protein (
  id              TEXT PRIMARY KEY,
  name            TEXT,
  aa_sequence     TEXT,
  dna_sequence    TEXT,
  structure_url   TEXT,
  source_organism TEXT,
  source_type     TEXT,
  notes           TEXT,
  created_at DATETIME, updated_at DATETIME, created_by TEXT
);


-- [PAPER] chemicals: substrates AND products/analytes (N66, diad, MAXA, XA, ...)
CREATE TABLE idea_reactant (
  id                TEXT PRIMARY KEY,
  name              TEXT,
  aliases           TEXT,
  smiles            TEXT,
  inchi             TEXT,
  inchi_key         TEXT,
  molecular_formula TEXT,
  molecular_weight  REAL,       -- serves product Mass (m/z) column (M6)
  notes             TEXT,
  created_at DATETIME, updated_at DATETIME, created_by TEXT
);

-- [PAPER] reactions (diad/triad/tetrad amide-bond synthesis)
CREATE TABLE idea_reaction (
  id            TEXT PRIMARY KEY,
  name          TEXT,
  equation      TEXT,
  smarts        TEXT,
  reaction_type TEXT,
  notes         TEXT,
  created_at DATETIME, updated_at DATETIME, created_by TEXT
);

-- [PAPER] reaction stoichiometry (role = substrate | product), MW-typed coefficient
CREATE TABLE idea_stoichiometry (
  id               INTEGER PRIMARY KEY,
  idea_reaction_id TEXT REFERENCES idea_reaction(id),
  idea_reactant_id TEXT REFERENCES idea_reactant(id),
  coefficient      REAL,
  role             TEXT,        -- 'substrate' | 'product'
  notes            TEXT,
  created_at DATETIME, updated_at DATETIME, created_by TEXT
);


-- [PAPER] experiment (EXP ID, PROJECT, TYPE "6,6")
CREATE TABLE idea_experiment (
  id           TEXT PRIMARY KEY,
  start_date   DATE,
  type         TEXT,           -- polymer/assay type, e.g. "6,6"
  index_num    INTEGER,
  description  TEXT,           -- project (e.g. SYN)
  created_at DATETIME, updated_at DATETIME, created_by TEXT
);

-- [PAPER] sample = one assay instance / one replicate (wide replicates -> rows)
CREATE TABLE idea_sample (
  id               TEXT PRIMARY KEY,
  name             TEXT,
  experiment_id    TEXT REFERENCES idea_experiment(id),
  replicate        INTEGER,        -- serves Replicate 1..N (M1/M3/M4)
  sample_type      TEXT,           -- G4: 'lysate' | 'purified'
  parent_sample_id TEXT REFERENCES idea_sample(id),
  storage_location TEXT,           -- G3: holds plate ROW/COL as text
  notes            TEXT,
  created_at DATETIME, updated_at DATETIME, created_by TEXT
);

-- ---------- Measurements ----------

-- [PAPER] measurement event (a file/instrument readout a sample was measured by)
CREATE TABLE idea_measurement (
  id           INTEGER PRIMARY KEY,
  sample_id    TEXT REFERENCES idea_sample(id),
  type         TEXT,            -- e.g. mass-spec, titer assay
  filename     TEXT,
  notes        TEXT,
  created_at DATETIME, updated_at DATETIME, created_by TEXT
);



-- [PAPER] sample-scoped parameters -- G1: analyte/product-scoped via added FKs
CREATE TABLE sample_parameter (
  id               INTEGER PRIMARY KEY,
  sample_id        TEXT REFERENCES idea_sample(id),
  idea_reactant_id TEXT REFERENCES idea_reactant(id),  -- G1 ADD: which analyte/product
  idea_reaction_id TEXT REFERENCES idea_reaction(id),  -- G1 ADD (optional): which reaction
  label            TEXT,        -- e.g. titer, mass-spec intensity, conversion, temperature, time
  value            TEXT,        -- kept flexible (value_type discriminates)
  value_type       TEXT,        -- 'real' | 'int' | 'text' (v9 field)
  unit             TEXT,        -- mg/L, %, intensity, C, h ...
  created_at DATETIME, updated_at DATETIME, created_by TEXT
);

-- [PAPER] which protein/mutant is in a sample
CREATE TABLE sample_protein (
  id              INTEGER PRIMARY KEY,
  sample_id       TEXT REFERENCES idea_sample(id),
  idea_protein_id TEXT REFERENCES idea_protein(id),
  created_at DATETIME, updated_at DATETIME, created_by TEXT
);

-- [PAPER] which substrate(s) at what concentration in a sample (C1)
CREATE TABLE sample_reactant (
  id                 INTEGER PRIMARY KEY,
  sample_id          TEXT REFERENCES idea_sample(id),
  idea_reactant_id   TEXT REFERENCES idea_reactant(id),
  concentration      REAL,
  concentration_unit TEXT,
  created_at DATETIME, updated_at DATETIME, created_by TEXT
);

-- [PAPER] which reaction(s) a sample assays
CREATE TABLE sample_reaction (
  id               INTEGER PRIMARY KEY,
  sample_id        TEXT REFERENCES idea_sample(id),
  idea_reaction_id TEXT REFERENCES idea_reaction(id),
  is_primary       BOOLEAN,
  created_at DATETIME, updated_at DATETIME, created_by TEXT
);


-- [OPTIONAL] external cross-references
CREATE TABLE idea_dbxref (
  id INTEGER PRIMARY KEY, entity_type TEXT, entity_id TEXT,
  database_name TEXT, accession TEXT, url TEXT,
  created_at DATETIME, updated_at DATETIME, created_by TEXT
);
