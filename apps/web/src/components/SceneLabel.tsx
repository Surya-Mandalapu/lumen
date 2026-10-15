import { useEffect, useMemo } from "react";
import * as THREE from "three";

/** Scene-native labels avoid nested ReactDOM roots during canvas teardown. */
export function SceneLabel({
  text,
  color = "#caddca",
  background = "#172820",
  selected = false,
  round = false,
  position,
  width = 2.6,
  onSelect,
}: {
  text: string;
  color?: string;
  background?: string;
  selected?: boolean;
  round?: boolean;
  position: [number, number, number];
  width?: number;
  onSelect?: () => void;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = round ? 128 : 512;
    canvas.height = round ? 128 : 96;
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = selected ? "#b3dfc2" : background;
      if (round) {
        context.beginPath();
        context.arc(64, 64, 58, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = selected ? "#d9f7df" : "#a4d2b3";
        context.lineWidth = 4;
        context.stroke();
      } else {
        context.globalAlpha = 0.8;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.globalAlpha = 1;
      }
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = `${round ? "500 46" : "400 40"}px sans-serif`;
      context.fillStyle = selected ? "#193723" : color;
      context.fillText(
        text,
        canvas.width / 2,
        canvas.height / 2 + 2,
        canvas.width - 18,
      );
    }
    const output = new THREE.CanvasTexture(canvas);
    output.colorSpace = THREE.SRGBColorSpace;
    return output;
  }, [text, color, background, selected, round]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite
      position={position}
      scale={[width, round ? width : (width * 96) / 512, 1]}
      renderOrder={5}
      onClick={
        onSelect
          ? (event) => {
              event.stopPropagation();
              onSelect();
            }
          : undefined
      }
    >
      <spriteMaterial
        map={texture}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </sprite>
  );
}
