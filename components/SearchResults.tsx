"use client";

import { useEffect, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { MovieCard } from "@/components/MovieCard";
import { searchMovies } from "@/lib/catalog";
import { createReturnToPath } from "@/lib/navigation";
import type { ListPayload } from "@/lib/types";

type SearchState =
  | { status: "idle"; query: ""; page: 1 }
  | { status: "loading"; query: string; page: number }
  | { status: "ready"; query: string; page: number; data: ListPayload }
  | { status: "error"; query: string; page: number };

function readLocation() {
  const params = new URLSearchParams(window.location.search);
  const query = (params.get("q") || "").trim();
  const parsedPage = Number(params.get("page") || "1");
  return { query, page: Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.floor(parsedPage) : 1 };
}

function paginationItems(currentPage: number, totalPages: number) {
  const pageSet = new Set([1, totalPages]);
  for (let page = currentPage - 2; page <= currentPage + 2; page++) pageSet.add(page);

  const pages = Array.from(pageSet).filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];
  pages.forEach((page, index) => {
    if (index > 0) {
      const gap = page - pages[index - 1];
      if (gap === 2) items.push(page - 1);
      else if (gap > 2) items.push("ellipsis");
    }
    items.push(page);
  });
  return items;
}

function pageHref(page: number) {
  const params = new URLSearchParams(window.location.search);
  if (page === 1) params.delete("page");
  else params.set("page", String(page));
  const search = params.toString();
  return `/search${search ? `?${search}` : ""}`;
}

export function SearchResults() {
  const [state, setState] = useState<SearchState>({ status: "idle", query: "", page: 1 });

  useEffect(() => {
    let controller: AbortController | undefined;

    function load() {
      controller?.abort();
      const location = readLocation();
      if (!location.query) {
        setState({ status: "idle", query: "", page: 1 });
        document.title = "Tìm kiếm - Bluesia Cinema";
        return;
      }

      const requestController = new AbortController();
      controller = requestController;
      setState({ status: "loading", ...location });

      searchMovies(location.query, location.page)
        .then((data) => {
          if (requestController.signal.aborted) return;
          setState({ status: "ready", ...location, data });
          document.title = `${data.title || "Tìm kiếm"} - Bluesia Cinema`;
        })
        .catch(() => {
          if (requestController.signal.aborted) return;
          setState({ status: "error", ...location });
        });
    }

    load();
    window.addEventListener("popstate", load);
    return () => {
      controller?.abort();
      window.removeEventListener("popstate", load);
    };
  }, []);

  const data = state.status === "ready" ? state.data : undefined;
  const returnTo = typeof window === "undefined" ? "/search" : createReturnToPath(window.location.pathname, window.location.search);
  const totalPages = Number(data?.totalPages || 0);

  function navigate(event: React.MouseEvent<HTMLAnchorElement>, page: number) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.history.pushState({}, "", pageHref(page));
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <section className="px-4 pt-6">
        <h1 className="text-3xl font-black tracking-tight">{data?.title || (state.query ? `Tìm kiếm: ${state.query}` : "Bạn muốn xem gì?")}</h1>
        <p className="mt-1 text-sm text-zinc-400">Nhập tên phim, tên gốc hoặc từ khóa để tìm nhanh.</p>
      </section>

      {state.status === "loading" ? (
        <div className="mx-4 mt-8 rounded-3xl bg-white/5 p-8 text-center text-sm text-zinc-400" role="status">Đang tìm...</div>
      ) : state.status === "error" ? (
        <div className="mx-4 mt-8 rounded-3xl border border-red-400/20 bg-red-400/5 p-8 text-center text-sm text-zinc-300" role="alert">Chưa tải được kết quả. Vui lòng thử lại.</div>
      ) : data && data.items.length > 0 ? (
        <>
          <section className="grid grid-cols-3 gap-3 px-4 pt-5 sm:grid-cols-4">
            {data.items.map((movie) => <MovieCard key={movie.slug} movie={movie} compact returnTo={returnTo} />)}
          </section>
          {totalPages > 1 && (
            <nav className="flex items-center justify-center pb-8 pt-12" aria-label="Phân trang">
              <div className="mx-0 flex items-center gap-0 sm:mx-4 sm:gap-1">
                {paginationItems(state.page, totalPages).map((item, index) => item === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} className="flex h-[32px] w-3 items-center justify-center text-iron-veil sm:h-10 sm:w-10" aria-hidden="true"><MoreHorizontal className="h-4 w-4" /></span>
                ) : (
                  <a
                    key={item}
                    href={pageHref(item)}
                    onClick={(event) => navigate(event, item)}
                    aria-current={item === state.page ? "page" : undefined}
                    className={`grid place-items-center rounded-lg font-semibold tracking-[0.04em] transition sm:tracking-[0.083em] ${item === state.page ? "h-[48px] min-w-[36px] bg-signal-blue px-1.5 text-[18px] text-snow ring-1 ring-inset ring-glacier-beam sm:h-[60px] sm:min-w-[60px] sm:px-3 sm:text-[21px]" : Math.abs(item - state.page) === 1 ? "h-[38px] min-w-[29px] bg-transparent px-1 text-[14px] text-snow hover:bg-white/5 sm:h-[48px] sm:min-w-[48px] sm:px-2 sm:text-[17px]" : "h-[32px] min-w-[24px] bg-transparent px-0.5 text-[12px] text-ash-mist hover:bg-white/5 hover:text-snow sm:h-10 sm:min-w-[40px] sm:px-2 sm:text-[14px]"}`}
                  >{item}</a>
                ))}
              </div>
            </nav>
          )}
        </>
      ) : state.status === "ready" ? (
        <div className="mx-4 mt-8 rounded-3xl border border-dashed border-white/15 bg-white/5 p-8 text-center text-sm text-zinc-400">Không tìm thấy kết quả phù hợp.</div>
      ) : null}
    </>
  );
}
