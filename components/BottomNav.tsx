"use client";

import { useEffect, useMemo, useState } from "react";
import { Clapperboard, Film, Home, MonitorPlay, Sparkles } from "lucide-react";
import { getActiveNavKey, navSourceFromHash, navSourceFromSearchParams, normalizeNavPath } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const items = [
  { key: "home", href: "/", label: "Trang chủ", icon: Home },
  { key: "phim-le", href: "/list/phim-le", label: "Phim lẻ", icon: Film },
  { key: "phim-bo", href: "/list/phim-bo", label: "Phim bộ", icon: MonitorPlay },
  { key: "tv-shows", href: "/list/tv-shows", label: "TV Show", icon: Clapperboard },
  { key: "hoat-hinh", href: "/list/hoat-hinh", label: "Hoạt hình", icon: Sparkles }
];

const CONTEXT_KEY = "film.bluesia.net:last-nav-section";

function contextFromPath(pathname: string) {
  const key = getActiveNavKey(pathname);
  return key && !["search", "settings"].includes(key) ? key : "";
}

function readContext() {
  if (typeof window === "undefined") return "";
  try {
    return navSourceFromSearchParams(new URLSearchParams({ from: sessionStorage.getItem(CONTEXT_KEY) || "" }));
  } catch {
    return "";
  }
}

function writeContext(pathname: string, search = "") {
  const key = navSourceFromSearchParams(search) || contextFromPath(pathname);
  if (!key || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CONTEXT_KEY, key);
  } catch {
    // Active state can still follow the current path if storage is unavailable.
  }
}

function devLog(message: string, details: Record<string, unknown>) {
  if (import.meta.env.DEV) console.debug(`[nav] ${message}`, details);
}

function isContextualPath(pathname: string) {
  const path = normalizeNavPath(pathname);
  return path.startsWith("/movie/") || path.startsWith("/watch/");
}

function contextKeyForLocation(pathname: string, search = "", hash = "", fallbackKey = "") {
  const querySource = navSourceFromSearchParams(search);
  if (querySource) return querySource;
  const key = contextFromPath(pathname);
  if (key) return key;
  if (isContextualPath(pathname) && fallbackKey) return fallbackKey;
  const storedKey = readContext();
  if (storedKey) return storedKey;
  return navSourceFromHash(hash);
}

export function BottomNav({
  initialPathname = "/",
  initialSearch = "",
  initialSourceFallback = ""
}: {
  initialPathname?: string;
  initialSearch?: string;
  initialSourceFallback?: string;
}) {
  const currentPathname = typeof window === "undefined" ? initialPathname : window.location.pathname;
  const currentSearch = typeof window === "undefined" ? initialSearch : window.location.search;
  const currentHash = typeof window === "undefined" ? "" : window.location.hash;
  const [pathname, setPathname] = useState(() =>
    currentPathname
  );
  const [search, setSearch] = useState(() =>
    currentSearch
  );
  const [contextKey, setContextKey] = useState(() =>
    contextKeyForLocation(currentPathname, currentSearch, currentHash, initialSourceFallback)
  );
  const activeKey = useMemo(() => {
    const active = getActiveNavKey(pathname, search);
    return active || (isContextualPath(pathname) ? contextKey : "");
  }, [pathname, search, contextKey]);

  useEffect(() => {
    function syncPath(eventName: string) {
      const nextPathname = window.location.pathname;
      const nextSearch = window.location.search;
      writeContext(nextPathname, nextSearch);
      const nextContextKey = contextKeyForLocation(nextPathname, nextSearch, window.location.hash, initialSourceFallback);
      setPathname(nextPathname);
      setSearch(nextSearch);
      setContextKey(nextContextKey);
      devLog("NAV_ROUTE_CHANGE", { event: eventName, pathname: nextPathname, search: nextSearch });
      devLog("NAV_ACTIVE_FROM_PATH", { pathname: nextPathname, search: nextSearch, active: getActiveNavKey(nextPathname, nextSearch) || nextContextKey || null });
    }

    writeContext(window.location.pathname, window.location.search);
    syncPath("mount");

    function handlePageLoad() {
      syncPath("astro:page-load");
    }

    function handlePopState() {
      syncPath("popstate");
    }

    function handleHashChange() {
      syncPath("hashchange");
    }

    function handlePageShow(event: PageTransitionEvent) {
      syncPath(event.persisted ? "pageshow-persisted" : "pageshow");
    }

    window.addEventListener("astro:page-load", handlePageLoad);
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("astro:page-load", handlePageLoad);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return (
    <nav className="bottom-nav fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[720px] bg-smoke px-2 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1">
      <div className="bottom-nav-grid grid grid-cols-5 gap-0.5">
        {items.map((item) => {
          const active = activeKey === item.key;
          const Icon = item.icon;
          return (
            <a
              href={item.href}
              key={item.href}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                writeContext(item.href, "");
                setPathname(item.href);
                setSearch("");
                setContextKey(contextFromPath(item.href));
                devLog("NAV_CLICK_TARGET", { href: item.href, active: item.key });
              }}
              className={cn(
                "bottom-nav-item flex min-h-12 flex-col items-center justify-center rounded-lg px-1 py-1 text-caption font-semibold tracking-caption text-iron-veil transition-colors",
                active && "text-signal-blue"
              )}
            >
              <Icon className="bottom-nav-icon mb-0.5 h-5 w-5" strokeWidth={active ? 2.5 : 2} />
              <span className="bottom-nav-label whitespace-nowrap">{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
