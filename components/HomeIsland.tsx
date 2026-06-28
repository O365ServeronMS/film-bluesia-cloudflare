import { useState, useEffect } from "react";
import { HeroSlider } from "./HeroSlider";
import { SectionRow } from "./SectionRow";
import { TopBar } from "./TopBar";
import { getHome } from "@/lib/catalog";
import type { HomePayload } from "@/lib/types";

export function HomeIsland({ returnTo }: { returnTo: string }) {
  const [data, setData] = useState<HomePayload | null>(null);
  const [visibleSections, setVisibleSections] = useState<number>(2);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    getHome()
      .then((home) => active && setData(home))
      .catch((err) => {
        console.error("[HomeIsland] Failed to load home-data", err);
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (data && visibleSections <= data.sections.length) {
      const timer = window.setTimeout(() => {
        setVisibleSections((prev) => prev + 1);
      }, 100);
      return () => window.clearTimeout(timer);
    }
  }, [data, visibleSections]);

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
      {data.sections.slice(0, visibleSections).map((section, index) => (
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

