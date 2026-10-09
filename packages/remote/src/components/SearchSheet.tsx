import { useEffect, useRef, useState, type FormEvent } from "react";
import { Sheet, useSheetClose } from "./Sheet";
import { Icon } from "./Icon";

interface SearchSheetProps {
  sourceName: string | null;
  onSubmit: (query: string) => void;
  onClose: () => void;
}

export function SearchSheet({ sourceName, onSubmit, onClose }: SearchSheetProps) {
  return (
    <Sheet label="Search" onClose={onClose} avoidKeyboard>
      <SearchBody sourceName={sourceName} onSubmit={onSubmit} />
    </Sheet>
  );
}

function SearchBody({ sourceName, onSubmit }: Omit<SearchSheetProps, "onClose">) {
  const close = useSheetClose();
  const ref = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    onSubmit(q);
    close();
  };

  return (
    <form className="search" onSubmit={submit}>
      <div className="search__row">
        <div className="field field--search">
          <Icon name="magnifyingglass" size={18} className="field__icon" />
          <input
            ref={ref}
            className="field__input"
            type="search"
            enterKeyHint="search"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            placeholder={`Search ${sourceName ?? "your TV"}…`}
            aria-label="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query ? (
            <button type="button" className="field__clear" aria-label="Clear text" onClick={() => setQuery("")}>
              <Icon name="xmark.circle.fill" size={18} />
            </button>
          ) : null}
        </div>
        <button type="button" className="text-button" onClick={close}>
          Cancel
        </button>
      </div>
      <button type="submit" className="primary-button" disabled={!query.trim()}>
        Search
      </button>
    </form>
  );
}
