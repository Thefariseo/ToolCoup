"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Starts the design kit's own scripts (copied unchanged into public/assets) once React has taken over the page:
// the micro-interaction layer (hero entrance, nav timing) and the page's dealt moments. Each is
// mounted again after a client-side navigation; they skip anything already mounted. Nothing here draws data.
const load = (url) => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url);

export default function KitRuntime() {
  const path = usePathname();
  useEffect(() => {
    let dead = false, moments = null;
    const root = () => document.querySelector("main");
    (async () => {
      try {
        const motion = await load("/assets/motion/motion.js");
        if (dead) return;
        motion.refresh();
        if (document.querySelector("[data-moment]")) {
          window.__momentsManual = true;
          moments = await load("/assets/moments/moments.js");
          if (dead) return;
          await moments.mountAll(document);
          await moments.mountAll(root());
        }
      } catch (e) { console.warn("design kit:", e); }
      if (!dead) document.documentElement.dataset.ready = "1";
    })();
    return () => { dead = true; };
  }, [path]);
  return null;
}
