"""Read an exported Apache Iceberg warehouse locally, resolving the CURRENT
snapshot per table to its live data files.

The exported metadata (metadata.json / *.avro) embeds the ORIGINAL absolute
s3:// object paths, so duckdb's iceberg_scan() tries the network and 404s.
Instead we resolve everything by BASENAME against the local files:

  latest *.metadata.json  ->  current-snapshot-id
    -> that snapshot's manifest-list (snap-*.avro)
      -> manifest (*-m0.avro) entries, keep status != 2 (2 = DELETED)
        -> data/<basename>.parquet   (parquet carries the real column types)

Public helpers:
  tables(base)                 -> sorted list of table names
  current_meta(base, t)        -> (metadata_dict, path_to_latest_metadata_json)
  live_data_files(base, t, con)-> [local parquet paths] for the current snapshot
  scan(base, t, con)           -> duckdb relation over the current snapshot (typed)
  iceberg_schema(meta)         -> [(id, name, iceberg_type, required)]
"""
import glob
import json
import os

import duckdb

# Iceberg v2 manifest_entry.status: 0=EXISTING, 1=ADDED, 2=DELETED
_DELETED = 2


def connect():
    con = duckdb.connect()
    con.execute("LOAD avro")
    return con


def tables(base):
    return sorted(
        d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d, "metadata"))
    )


def _latest_metadata_json(base, t):
    ms = sorted(glob.glob(os.path.join(base, t, "metadata", "*.metadata.json")))
    if not ms:
        raise FileNotFoundError(f"no metadata.json for {t}")
    return ms[-1]


def current_meta(base, t):
    p = _latest_metadata_json(base, t)
    with open(p) as fh:
        return json.load(fh), p


def iceberg_schema(meta):
    sid = meta.get("current-schema-id", 0)
    schemas = meta.get("schemas") or [meta.get("schema")]
    sch = next((s for s in schemas if s.get("schema-id") == sid), schemas[-1])
    out = []
    for f in sch["fields"]:
        out.append((f["id"], f["name"], f["type"], bool(f.get("required"))))
    return out


def _metadir(base, t):
    return os.path.join(base, t, "metadata")


def _datadir(base, t):
    return os.path.join(base, t, "data")


def live_data_files(base, t, con):
    meta, _ = current_meta(base, t)
    cur = meta.get("current-snapshot-id")
    snaps = meta.get("snapshots", [])
    if cur is None or not snaps:
        return []
    snap = next(s for s in snaps if s["snapshot-id"] == cur)
    snap_avro = os.path.join(_metadir(base, t), snap["manifest-list"].split("/")[-1])
    ml = con.execute(
        f"SELECT manifest_path FROM read_avro('{snap_avro}')"
    ).fetchall()
    files = []
    ddir = _datadir(base, t)
    for (mp,) in ml:
        man = os.path.join(_metadir(base, t), mp.split("/")[-1])
        for status, data_file in con.execute(
            f"SELECT status, data_file FROM read_avro('{man}')"
        ).fetchall():
            if status == _DELETED:
                continue
            files.append(os.path.join(ddir, data_file["file_path"].split("/")[-1]))
    # de-dupe, keep order
    seen = set()
    uniq = []
    for f in files:
        if f not in seen and os.path.exists(f):
            seen.add(f)
            uniq.append(f)
    return uniq


def _flist(files):
    return "['" + "','".join(files) + "']"


def scan(base, t, con):
    files = live_data_files(base, t, con)
    if not files:
        raise ValueError(f"no live data files for {t}")
    return con.sql(f"SELECT * FROM read_parquet({_flist(files)})")


def read_parquet_sql(base, t, con):
    """Return a read_parquet(...) SQL fragment for the current snapshot."""
    return f"read_parquet({_flist(live_data_files(base, t, con))})"


if __name__ == "__main__":
    import sys

    base = sys.argv[1] if len(sys.argv) > 1 else "/home/janakae/claude_projects/Ideas-DB/tetrad_v1"
    con = connect()
    grand = 0
    for t in tables(base):
        meta, mpath = current_meta(base, t)
        rel = scan(base, t, con)
        n = con.execute(f"SELECT count(*) FROM ({rel.sql_query()})").fetchone()[0]
        grand += n
        print(f"\n### {t}  —  {n} rows, {len(rel.columns)} cols")
        print("    (metadata:", os.path.basename(mpath), ")")
        for cid, name, ityp, req in iceberg_schema(meta):
            print(f"    {cid:>3}  {name:<24} {str(ityp):<14} {'required' if req else ''}")
    print(f"\nTOTAL: {grand} rows across {len(tables(base))} tables")
