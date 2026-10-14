# Reference snapshots

`pubchem-periodic.json` and `ciaaw-2024.html` are downloaded source facts, not solver-generated answers. The generated `src/data/periodic.ts` records their SHA-256 hashes and source URLs. Refresh explicitly with `scripts/import_periodic_data.py`; `--offline` regenerates from these committed snapshots without network access.
