"""Download a pinned NAIF kernel set and record SHA-256; reruns verify existing files."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlretrieve

ROOT = Path(__file__).resolve().parents[2] / "data" / "raw" / "kernels"
BASE = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"
FILES = {
    "naif0012.tls": "lsk/naif0012.tls",
    "de440s.bsp": "spk/planets/de440s.bsp",
    "moon_pa_de440_200625.bpc": "pck/moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf": "fk/satellites/moon_de440_250416.tf",
}

# These digests are pinned to the files retrieved from NASA NAIF for this release.
PINNED = {
    "naif0012.tls": "678e32bdb5a744117a467cd9601cd6b373f0e9bc9bbde1371d5eee39600a039b",
    "de440s.bsp": "c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2",
    "moon_pa_de440_200625.bpc": "60cd55aa401ea2ea97360636f567554bfe4e37bb829f901b4460a455dfaf783f",
    "moon_de440_250416.tf": "a47c71e9c9f33796bdafb2c9d69a7ee447b6016ecad80f71cd6f3e479f9cf768",
}


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for name, remote in FILES.items():
        path = ROOT / name
        if not path.exists():
            temporary = path.with_suffix(path.suffix + ".download")
            urlretrieve(BASE + remote, temporary)
            temporary.replace(path)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if PINNED.get(name) and digest != PINNED[name]:
            raise ValueError(f"Kernel checksum mismatch: {name}")
        manifest.append({"file": name, "url": BASE + remote, "sha256": digest,
                         "bytes": path.stat().st_size})
        print(f"Verified {name}: {digest}")
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
