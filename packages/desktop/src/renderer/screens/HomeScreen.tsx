import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NavAction, PlaybackHistoryItem } from "@bedrock/shared";
import { SourceTile } from "../components/SourceTile";
import { ContinueCard, type ContinueItem } from "../components/ContinueCard";
import { Hero } from "../components/Hero";
import { PairingSheet } from "../components/PairingSheet";
import { TopBar } from "../components/TopBar";
import type { ConnectionInfo, SourceListItem } from "../bedrock-api";
import {
  clampRowFocus,
  moveRowFocus,
  resolveInitialFocusIndex,
  type RowFocus,
} from "../launcher-focus";
import { perfInc } from "../../shared/perf";
import {
  getCachedLauncherBootstrap,
  loadLauncherBootstrap,
} from "../launcher-bootstrap";
import { getCachedPlaybackHistory, refreshPlaybackHistory } from "../playback-history";
import { toContinueItems } from "../continue-items";

/** Stable key → nav map — allocated once, not per keydown. */
const KEY_TO_NAV: Record<string, NavAction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "select",
  " ": "select",
  Escape: "back",
  Backspace: "back",
};

/** Focus rows, top to bottom. */
const ROW_TOP = 0;
const ROW_HERO = 1;
const ROW_CONTINUE = 2;
const ROW_APPS = 3;

interface HomeScreenProps {
  onSelectSource: (id: string) => void;
  onResumePlaybackHistory: (item: PlaybackHistoryItem) => void;
  /** Restore focus after returning from a media source, when possible. */
  initialFocusSourceId?: string | null;
  /** False while the splash is up: Home loads data but ignores input. */
  inputEnabled?: boolean;
}

/**
 * Keyboard / remote nav → focus position only.
 * Listeners are registered once (refs hold latest layout/focus/callbacks)
 * so arrow keys do not tear down and re-add window/IPC listeners.
 */
export function HomeScreen({
  onSelectSource,
  onResumePlaybackHistory,
  initialFocusSourceId = null,
  inputEnabled = true,
}: HomeScreenProps) {
  perfInc("homeScreen.render");

  const cached = getCachedLauncherBootstrap();
  const [sources, setSources] = useState<SourceListItem[]>(
    () => cached?.sources ?? [],
  );
  const [connection, setConnection] = useState<ConnectionInfo | null>(
    () => cached?.connection ?? null,
  );
  const [history, setHistory] = useState(getCachedPlaybackHistory);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [pos, setPos] = useState<RowFocus>(() => {
    const sourceIds = (cached?.sources ?? []).map((s) => s.id);
    return initialFocusSourceId && sourceIds.includes(initialFocusSourceId)
      ? { row: ROW_APPS, col: resolveInitialFocusIndex(sourceIds, initialFocusSourceId) }
      : { row: ROW_HERO, col: 0 };
  });

  const continueItems = useMemo<ContinueItem[]>(
    () =>
      toContinueItems(
        [...history].sort((a, b) => b.lastPlayedAt - a.lastPlayedAt),
        sources,
      ),
    [history, sources],
  );
  const featured = continueItems[0] ?? null;
  const rowLengths = useMemo(
    () => [1, featured ? 2 : 1, continueItems.length, sources.length],
    [featured, continueItems.length, sources.length],
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef(pos);
  const rowLengthsRef = useRef(rowLengths);
  const sheetOpenRef = useRef(sheetOpen);
  const inputEnabledRef = useRef(inputEnabled);
  const itemsRef = useRef({ sources, continueItems, featured });
  const onSelectSourceRef = useRef(onSelectSource);
  const onResumeRef = useRef(onResumePlaybackHistory);

  posRef.current = pos;
  rowLengthsRef.current = rowLengths;
  sheetOpenRef.current = sheetOpen;
  inputEnabledRef.current = inputEnabled;
  itemsRef.current = { sources, continueItems, featured };
  onSelectSourceRef.current = onSelectSource;
  onResumeRef.current = onResumePlaybackHistory;

  // Load once per mount; session cache avoids IPC on Home remount after source.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { sources: list, connection: info, fromCache } =
          await loadLauncherBootstrap();
        if (cancelled) return;
        setSources(list);
        setConnection(info);
        if (!fromCache) {
          perfInc("ipc.invoke", 2);
        }
        if (initialFocusSourceId) {
          const ids = list.map((s) => s.id);
          if (ids.includes(initialFocusSourceId)) {
            setPos({ row: ROW_APPS, col: resolveInitialFocusIndex(ids, initialFocusSourceId) });
          }
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only bootstrap — preferred focus is applied from initial state / this load.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap
  }, []);

  // Home remains usable while this best-effort source-page request runs.
  useEffect(() => {
    let cancelled = false;
    void refreshPlaybackHistory()
      .then((items) => {
        if (!cancelled) setHistory(items);
      })
      .catch((error) => console.warn("[launcher] playback history unavailable", error));
    return () => {
      cancelled = true;
    };
  }, []);

  // Rows can appear/disappear (history arrives late): keep focus inside the layout.
  useEffect(() => {
    setPos((current) => {
      const next = clampRowFocus(current, rowLengths);
      return next.row === current.row && next.col === current.col ? current : next;
    });
  }, [rowLengths]);

  const openSheet = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const handleSelect = useCallback((id: string) => {
    onSelectSourceRef.current(id);
  }, []);

  const handleResume = useCallback((item: PlaybackHistoryItem) => {
    onResumeRef.current(item);
  }, []);

  const handleFocusRequest = useCallback((row: number, col: number) => {
    if (sheetOpenRef.current) return;
    setPos((current) => (current.row === row && current.col === col ? current : { row, col }));
  }, []);

  const activate = useCallback(() => {
    const { row, col } = posRef.current;
    const { sources: list, continueItems: items, featured: hero } = itemsRef.current;
    if (row === ROW_TOP) return setSheetOpen(true);
    if (row === ROW_HERO) {
      if (!hero) return setSheetOpen(true);
      return col === 0 ? onResumeRef.current(hero) : onSelectSourceRef.current(hero.sourceId);
    }
    if (row === ROW_CONTINUE) {
      const item = items[col];
      if (item) onResumeRef.current(item);
      return;
    }
    const source = list[col];
    if (source) onSelectSourceRef.current(source.id);
  }, []);

  // Stable nav applicator — never depends on focus/sources identity.
  const applyNav = useCallback(
    (action: NavAction) => {
      if (!inputEnabledRef.current) return;
      if (sheetOpenRef.current) {
        if (action === "back" || action === "select" || action === "home") setSheetOpen(false);
        return;
      }
      if (action === "select") return activate();
      if (action === "home" || action === "back") return;

      perfInc("focus.nav");
      setPos((current) => {
        const next = moveRowFocus(current, action, rowLengthsRef.current);
        return next.row === current.row && next.col === current.col ? current : next;
      });
    },
    [activate],
  );

  // Register key + remote listeners once; refs keep handlers current.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = KEY_TO_NAV[event.key];
      if (!action) return;
      // Keys drive the focus engine; stop the browser from also clicking the button / scrolling.
      event.preventDefault();
      if (event.repeat && (action === "select" || action === "back")) return;
      perfInc("keydown.handler");
      applyNav(action);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === " ") event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    perfInc("listener.register");
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      perfInc("listener.cleanup");
    };
  }, [applyNav]);

  useEffect(() => {
    if (!window.bedrock?.onNav) return;
    perfInc("listener.register");
    const unsubscribe = window.bedrock.onNav((action) => applyNav(action));
    return () => {
      unsubscribe();
      perfInc("listener.cleanup");
    };
  }, [applyNav]);

  // DOM focus + scroll only when the position changes; skip if already focused (no layout thrash).
  useEffect(() => {
    if (sheetOpen || !inputEnabled) return;
    const el = document.querySelector<HTMLElement>(
      `[data-row="${pos.row}"][data-col="${pos.col}"]`,
    );
    if (!el) return;
    if (document.activeElement !== el) {
      perfInc("focus.dom");
      el.focus({ preventScroll: true });
    }
    revealFocused(el, scrollRef.current, pos.row);
  }, [pos, sheetOpen, inputEnabled, continueItems.length, sources.length]);

  const focusIn = (row: number) => (pos.row === row ? pos.col : -1);

  return (
    <>
    <main className={`home${sheetOpen ? " home--dimmed" : ""}`} aria-hidden={sheetOpen ? true : undefined}>
      <TopBar
        row={ROW_TOP}
        connection={connection}
        focused={pos.row === ROW_TOP}
        solid={scrolled}
        onPair={openSheet}
        onFocusRequest={handleFocusRequest}
      />

      <div
        className="home__scroll"
        ref={scrollRef}
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > window.innerHeight * 0.06)}
      >
        <Hero
          item={featured}
          row={ROW_HERO}
          focusCol={focusIn(ROW_HERO)}
          onResume={handleResume}
          onOpenSource={handleSelect}
          onPair={openSheet}
          onFocusRequest={handleFocusRequest}
        />

        {loadError ? <p className="home__error">{loadError}</p> : null}

        {continueItems.length > 0 ? (
          <section className="shelf" aria-label="Continue watching" data-shelf={ROW_CONTINUE}>
            <h2 className="shelf__title">Continue Watching</h2>
            <div className="shelf__scroller">
              <div className="shelf__row">
                {continueItems.map((item, col) => (
                  <ContinueCard
                    key={`${item.sourceId}-${item.id}`}
                    item={item}
                    row={ROW_CONTINUE}
                    col={col}
                    focused={pos.row === ROW_CONTINUE && pos.col === col}
                    onSelect={handleResume}
                    onFocusRequest={handleFocusRequest}
                  />
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="shelf" aria-label="Your apps" data-shelf={ROW_APPS}>
          <h2 className="shelf__title">Your Apps</h2>
          <div className="shelf__scroller">
            <div className="shelf__row">
              {sources.map((source, col) => (
                <SourceTile
                  key={source.id}
                  id={source.id}
                  displayName={source.displayName}
                  icon={source.icon}
                  row={ROW_APPS}
                  col={col}
                  focused={pos.row === ROW_APPS && pos.col === col}
                  onSelect={handleSelect}
                  onFocusRequest={handleFocusRequest}
                />
              ))}
            </div>
          </div>
        </section>
        <div className="home__tail" aria-hidden="true" />
      </div>

      <p className="hint" aria-hidden="true">
        Use your phone to navigate <span className="hint__dot" /> Press Home to come back here
      </p>
    </main>
    {sheetOpen ? <PairingSheet connection={connection} onClose={closeSheet} /> : null}
    </>
  );
}

/** Scroll the row horizontally and the page vertically so the focused item is fully in view. */
function revealFocused(el: HTMLElement, page: HTMLDivElement | null, row: number): void {
  const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const behavior: ScrollBehavior = smooth ? "smooth" : "auto";

  const scroller = el.closest<HTMLElement>(".shelf__scroller");
  if (scroller) {
    const margin = parseFloat(getComputedStyle(scroller).scrollPaddingLeft) || 0;
    const s = scroller.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.left < s.left + margin) {
      scroller.scrollTo({ left: scroller.scrollLeft - (s.left + margin - r.left), behavior });
    } else if (r.right > s.right - margin) {
      scroller.scrollTo({ left: scroller.scrollLeft + (r.right - (s.right - margin)), behavior });
    }
  }

  if (!page) return;
  if (row <= ROW_HERO) {
    page.scrollTo({ top: 0, behavior });
    return;
  }
  const section = el.closest<HTMLElement>(".shelf");
  if (!section) return;
  const bottomPad = window.innerHeight * 0.04; // keep the hint bar clear
  const topPad = window.innerHeight * 0.18; // keep the top bar clear
  const rect = section.getBoundingClientRect();
  const overflow = rect.bottom - (window.innerHeight - bottomPad);
  if (overflow > 0) page.scrollTo({ top: page.scrollTop + overflow, behavior });
  else if (rect.top < topPad) page.scrollTo({ top: page.scrollTop - (topPad - rect.top), behavior });
}
