import { useEffect, useRef } from "react";

export function CobeGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let destroy: (() => void) | undefined;
    let alive = true;
    let raf = 0;
    void import("cobe").then((mod) => {
      if (!alive || !canvasRef.current) return;
      const createGlobe = mod.default;
      let phi = 0;
      const globe = createGlobe(canvas, {
        devicePixelRatio: 2,
        width: 240 * 2,
        height: 240 * 2,
        phi: 0,
        theta: 0.3,
        dark: 1,
        diffuse: 1.1,
        mapSamples: 12_000,
        mapBrightness: 4,
        baseColor: [0.55, 0.56, 0.58],
        markerColor: [0.78, 0.8, 0.83],
        glowColor: [0.35, 0.36, 0.38],
        markers: [
          { location: [19.07, 72.87], size: 0.06 },
          { location: [1.35, 103.8], size: 0.05 },
          { location: [41.87, -87.62], size: 0.05 },
        ],
      });
      const tick = () => {
        if (!alive) return;
        if (document.visibilityState === "visible") {
          phi += 0.003;
          globe.update({ phi });
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      destroy = () => {
        cancelAnimationFrame(raf);
        globe.destroy();
      };
    }).catch(() => {});
    return () => {
      alive = false;
      destroy?.();
    };
  }, []);
  return <canvas ref={canvasRef} className="desk-globe size-[240px]" width={240} height={240} aria-hidden />;
}
