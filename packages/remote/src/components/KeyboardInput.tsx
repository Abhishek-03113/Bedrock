import { useRef, useEffect, type ChangeEvent, type FormEvent } from "react";
import type { WsClient } from "../ws-client";
import { describeFailure } from "@bedrock/shared";
import { Sheet, useSheetClose } from "./Sheet";
import { Icon } from "./Icon";

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

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const prev = prevValue.current;
    prevValue.current = val;

    try {
      if (val.length < prev.length) {
        const diff = prev.length - val.length;
        for (let i = 0; i < diff; i++) {
          await client.sendInput({ type: "key-down", key: "Backspace" }, { awaitResult: true });
          await client.sendInput({ type: "key-up", key: "Backspace" }, { awaitResult: true });
        }
      } else if (val.length > prev.length) {
        const newChars = val.slice(prev.length);
        await client.sendInput({ type: "text-input", text: newChars }, { awaitResult: true });
      }
    } catch {
      onToast({ message: describeFailure("Typing"), ok: false });
    }
  };

  const sendReturn = async (e?: FormEvent) => {
    e?.preventDefault();
    try {
      await client.sendInput({ type: "key-down", key: "Enter" }, { awaitResult: true });
      await client.sendInput({ type: "key-up", key: "Enter" }, { awaitResult: true });
      if (inputRef.current) {
        inputRef.current.value = "";
        prevValue.current = "";
        inputRef.current.focus();
      }
    } catch {
      onToast({ message: describeFailure("Return"), ok: false });
    }
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
