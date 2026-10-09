import { useRef, useEffect, type ChangeEvent, type FormEvent } from "react";
import type { WsClient } from "../ws-client";
import type { CommandResult } from "@bedrock/shared";
import { describeFailure } from "@bedrock/shared";
import { Sheet, useSheetClose } from "./Sheet";
import { Icon } from "./Icon";

/** Server rejects text-input longer than 512 UTF-16 units. */
const MAX_TEXT_INPUT = 512;

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/** Split into <= max-unit chunks without breaking surrogate pairs. */
function chunkText(text: string, max: number): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(text.length, i + max);
    if (end < text.length && isHighSurrogate(text.charCodeAt(end - 1))) end--;
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}

interface KeyboardInputProps {
  client: WsClient;
  onClose: () => void;
  onToast: (toast: { message: string; ok: boolean }) => void;
}

/** Bottom sheet that live-sends typed text to the TV (diffs against the previous value). */
export function KeyboardInput({ client, onClose, onToast }: KeyboardInputProps) {
  return (
    <Sheet label="Keyboard" onClose={onClose} avoidKeyboard>
      <KeyboardBody client={client} onToast={onToast} />
    </Sheet>
  );
}

function KeyboardBody({ client, onToast }: Omit<KeyboardInputProps, "onClose">) {
  const close = useSheetClose();
  const inputRef = useRef<HTMLInputElement>(null);
  const prevValue = useRef("");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /** Await a batch of already-sent requests; toast on any failure. */
  const settle = async (sent: Array<Promise<CommandResult>>, label: string) => {
    try {
      const results = await Promise.all(sent);
      const failed = results.find((r) => !r.ok);
      if (failed && !failed.ok) {
        onToast({ message: describeFailure(label, failed.reason), ok: false });
      }
    } catch {
      onToast({ message: describeFailure(label), ok: false });
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const prev = prevValue.current;
    prevValue.current = val;

    // Common-prefix diff, computed synchronously. This handles mid-string edits
    // and autocorrect (which replace characters, not just append/trim).
    // Caveat: the TV caret is at the end of the field, so for an edit made with
    // the phone caret mid-string we delete back to the first difference and
    // retype the rest — the best approximation without caret sync.
    let prefix = 0;
    const max = Math.min(prev.length, val.length);
    while (prefix < max && prev[prefix] === val[prefix]) prefix++;
    // Don't split a surrogate pair (emoji) across the delete/insert boundary.
    if (prefix > 0 && isHighSurrogate(val.charCodeAt(prefix - 1))) prefix--;

    const deletions = Array.from(prev.slice(prefix)).length;
    const inserted = val.slice(prefix);

    // Issue every send synchronously and in order (sendInput writes to the
    // socket at call time; WS preserves order), only then await the results.
    // Awaiting between sends would let overlapping change events interleave.
    const sent: Array<Promise<CommandResult>> = [];
    for (let i = 0; i < deletions; i++) {
      sent.push(client.sendInput({ type: "key-down", key: "Backspace" }, { awaitResult: true }));
      sent.push(client.sendInput({ type: "key-up", key: "Backspace" }, { awaitResult: true }));
    }
    for (const text of chunkText(inserted, MAX_TEXT_INPUT)) {
      sent.push(client.sendInput({ type: "text-input", text }, { awaitResult: true }));
    }
    if (sent.length > 0) void settle(sent, "Typing");
  };

  const sendReturn = (e?: FormEvent) => {
    e?.preventDefault();
    const sent = [
      client.sendInput({ type: "key-down", key: "Enter" }, { awaitResult: true }),
      client.sendInput({ type: "key-up", key: "Enter" }, { awaitResult: true }),
    ];
    if (inputRef.current) {
      inputRef.current.value = "";
      prevValue.current = "";
      inputRef.current.focus();
    }
    void settle(sent, "Return");
  };

  return (
    <form className="kbd" onSubmit={sendReturn}>
      <div className="sheet__bar">
        <h2 className="sheet__title">Keyboard</h2>
        <button type="button" className="text-button text-button--bold" onClick={close}>
          Done
        </button>
      </div>
      <div className="field">
        <Icon name="keyboard" size={20} className="field__icon" />
        <input
          ref={inputRef}
          className="field__input"
          type="text"
          enterKeyHint="send"
          placeholder="Type on your TV"
          aria-label="Type on your TV"
          onChange={handleChange}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
      <div className="kbd__actions">
        <p className="footnote">What you type appears on your TV as you go.</p>
        <button type="submit" className="pill-button" aria-label="Return">
          <Icon name="return" size={18} />
          Return
        </button>
      </div>
    </form>
  );
}
