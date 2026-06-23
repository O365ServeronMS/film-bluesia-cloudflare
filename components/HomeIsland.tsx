import { useState, useEffect } from "react";
import { HeroSlider } from "./HeroSlider";
import { SectionRow } from "./SectionRow";
import { TopBar } from "./TopBar";
import type { HomePayload } from "@/lib/types";

export function HomeIsland({ returnTo }: { returnTo: string }) {
  const [data, setData] = useState<HomePayload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const baseUrl = import.meta.env.PUBLIC_SNAPSHOT_BASE_URL || "https://data.bluesia.net";
        const manifestRes = await fetch(`${baseUrl}/manifest/latest.json`, { cache: "no-store" });
        if (!manifestRes.ok) throw new Error("Manifest fetch failed");
        
        const manifest = await manifestRes.json();
        const hash = manifest.snapshots?.home?.hash;
        if (!hash) throw new Error("No home snapshot in manifest");
        
        const snapshotRes = await fetch(`${baseUrl}/home/${hash}.json`, { cache: "force-cache" });
        if (!snapshotRes.ok) throw new Error("Snapshot fetch failed");
        
        setData(await snapshotRes.json());
      } catch (err) {
        console.warn("[HomeIsland] Snapshot failed, falling back to API", err);
        try {
          const apiRes = await fetch("/api/ophim/home");
          if (!apiRes.ok) throw new Error("API fallback failed");
          setData(await apiRes.json());
        } catch (apiErr) {
          console.error("[HomeIsland] API fallback failed", apiErr);
          setError(true);
        }
      }
    }
    
    loadData();
  }, []);

  if (error) {
    return (
      <>
        <div className="relative">
          <TopBar overlay />
          <div className="flex h-[580px] sm:h-[600px] items-center justify-center bg-obsidian px-4 text-center">
            <p className="text-ash-mist font-semibold text-lg">Không thể tải trang chủ. Vui lòng thử lại sau.</p>
          </div>
        </div>
      </>
    );
  }

  if (!data) {
    // Graceful loading state
    return (
      <>
        <div className="relative">
          <TopBar overlay />
          <div className="h-[580px] sm:h-[600px] bg-obsidian animate-pulse" />
        </div>
        <div className="px-4 py-6">
          <div className="h-6 w-48 rounded bg-smoke animate-pulse mb-4" />
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="aspect-[2/3] rounded-[4.5px] bg-smoke animate-pulse" />
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="relative">
        <TopBar overlay />
        <HeroSlider items={data.hero} />
      </div>
      {data.sections.map((section, index) => (
        <SectionRow
          key={section.href || index}
          title={section.title}
          href={section.href}
          items={section.items}
          returnTo={returnTo}
          spotlight={index === 0}
          itemLimit={section.href === "/list/phim-moi-cap-nhat" ? 24 : 8}
        />
      ))}
    </>
  );
}
