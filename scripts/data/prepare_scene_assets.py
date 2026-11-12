"""Build compact visual assets from pinned NASA models and the verified LOLA grid."""

import hashlib
import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/web/public/assets"


def main():
    receipt = {}
    for name in ("earth", "sun"):
        source = ROOT / f"data/cache/nasa-{name}.glb"
        raw = source.read_bytes()
        expected = {
            "earth": "05a5aea99db8ab472487a06debc3b5d0b2cae7636a1a6b9ecfa40b7d1722ba23",
            "sun": "a178f5c43c2c9a6ee6c011c315149a7ab5a2594fd5aa9119ee219625a18da1dd",
        }[name]
        if hashlib.sha256(raw).hexdigest() != expected:
            raise ValueError(f"Changed NASA {name} model")
        size = struct.unpack_from("<I", raw, 12)[0]
        doc = json.loads(raw[20 : 20 + size])
        buffer = raw[28 + size :]
        image = next(item for item in doc["images"] if "diff" in item["name"])
        view = doc["bufferViews"][image["bufferView"]]
        pixels = Image.open(
            io.BytesIO(
                buffer[view["byteOffset"] : view["byteOffset"] + view["byteLength"]]
            )
        ).convert("RGB")
        pixels.thumbnail((2048, 1024), Image.Resampling.LANCZOS)
        target = OUT / f"{name}-color.jpg"
        pixels.save(target, quality=91, optimize=True)
        # Preserve NASA's cube-atlas UVs; do not wrap this cross-shaped map on a UV sphere.
        binary = bytearray()
        for view in doc["bufferViews"][:4]:
            while len(binary) % 4:
                binary.append(0)
            old_offset = view.get("byteOffset", 0)
            view["byteOffset"] = len(binary)
            binary.extend(buffer[old_offset : old_offset + view["byteLength"]])
        while len(binary) % 4:
            binary.append(0)
        image_offset = len(binary)
        binary.extend(target.read_bytes())
        doc["bufferViews"] = doc["bufferViews"][:4] + [
            {
                "buffer": 0,
                "byteOffset": image_offset,
                "byteLength": target.stat().st_size,
            }
        ]
        doc["images"] = [{"bufferView": 4, "mimeType": "image/jpeg"}]
        doc["textures"] = [{"source": 0}]
        doc["materials"] = [
            {
                "pbrMetallicRoughness": {
                    "baseColorTexture": {"index": 0},
                    "metallicFactor": 0,
                    "roughnessFactor": 0.9,
                }
            }
        ]
        doc["buffers"] = [{"byteLength": len(binary)}]
        packed = json.dumps(doc, separators=(",", ":")).encode()
        packed += b" " * (-len(packed) % 4)
        binary += b"\x00" * (-len(binary) % 4)
        model = (
            struct.pack("<III", 0x46546C67, 2, 28 + len(packed) + len(binary))
            + struct.pack("<II", len(packed), 0x4E4F534A)
            + packed
            + struct.pack("<II", len(binary), 0x004E4942)
            + binary
        )
        (OUT / f"{name}-visual.glb").write_bytes(model)
        receipt[name] = {
            "source_url": f"https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/{'e/Earth_1_12756' if name == 'earth' else 's/Sun_1_1391000'}.glb",
            "visual_model_sha256": hashlib.sha256(model).hexdigest(),
            "source_sha256": hashlib.sha256(raw).hexdigest(),
            "asset_sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
            "size": pixels.size,
        }
    directory = ROOT / "data/derived/global-preview-v1"
    metadata = json.loads((directory / "metadata.json").read_text())
    raw = (directory / "elevation.npz").read_bytes()
    if hashlib.sha256(raw).hexdigest() != metadata["artifact_sha256"]:
        raise ValueError("Unverified LOLA grid")
    with np.load(io.BytesIO(raw), allow_pickle=False) as archive:
        # 4 pixels/degree, pixel-center registration, average each 4x4 source block.
        grid = archive["elevation_m"].reshape(720, 4, 1440, 4).mean(axis=(1, 3))
    target = OUT / "moon-height.i16"
    np.round(grid).astype("<i2").tofile(target)
    receipt["moon_height"] = {
        "width": 1440,
        "height": 720,
        "units": "metres above 1737400m sphere",
        "source": metadata,
        "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
    }
    receipt["moon_color"] = {"source_url": "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg", "sha256": hashlib.sha256((OUT / "moon-color.jpg").read_bytes()).hexdigest(), "credit": "NASA Goddard Space Flight Center / LRO"}
    (OUT / "scene-assets.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
