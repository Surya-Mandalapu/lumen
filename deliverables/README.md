# Project handoffs and lunar data release

`team-handoffs/` contains the three Word documents for lunar data/coverage,
backend/hosting, and frontend/usability responsibilities.

`lunar-cap-release/` contains the verified archive receipt and file manifest.
The 80 MB scientific archive is distributed as a GitHub release asset rather
than stored in Git history. Its filename and SHA-256 are recorded in the receipt.
The release tag is `lunar-south-cap-v1-d1ecdd0522df9876`; it is initially a draft
for collaborator review. Look in the repository's GitHub Releases page.

Follow [the installation guide](../docs/lunar-cap-release.md) to verify and
install the archive. The global preview grid and SPICE kernels are prepared
separately using the existing data scripts; the cap archive does not include them.
