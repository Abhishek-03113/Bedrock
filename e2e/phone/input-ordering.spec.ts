import { test, expect } from "../fixtures/mock-remote-server";

/** Replay the `input` messages the TV would receive onto an empty text field. */
function replayTyped(messages: any[]): string {
  let text = "";
  for (const m of messages) {
    if (m.kind !== "input") continue;
    const c = m.command;
    if (c.type === "text-input") text += c.text;
    else if (c.type === "key-down" && c.key === "Backspace") text = text.slice(0, -1);
  }
  return text;
}

test.describe("Keyboard ordering", () => {
  test("fast typing and edits reconstruct the field value on the TV", async ({ page, mockRemote }) => {
    await page.goto(mockRemote.phoneUrl);
    await page.getByRole("button", { name: "Keyboard" }).tap();
    const field = page.getByLabel("Type on your TV");
    await expect(field).toBeFocused();

    const converged = async () => {
      const value = await field.inputValue();
      await expect.poll(() => replayTyped(mockRemote.messages)).toBe(value);
      return value;
    };

    // No delay between keystrokes.
    await page.keyboard.type("hello world");
    expect(await converged()).toBe("hello world");

    // Rapid backspaces interleaved with typing.
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("ld!");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("?");
    expect(await converged()).toBe("hello world?");

    // Select-all then replace.
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("dune part two");
    expect(await converged()).toBe("dune part two");

    // Mid-string edit: delete the first character (caret at start).
    await page.keyboard.press("Home");
    await page.keyboard.press("Delete");
    expect(await converged()).toBe("une part two");

    // Mid-string insert.
    await page.keyboard.press("Home");
    await page.keyboard.type("Q");
    expect(await converged()).toBe("Qune part two");

    // Every Backspace key-down is immediately followed by its key-up (not split by text).
    const inputs = mockRemote.ofKind("input").map((m) => m.command);
    inputs.forEach((c, i) => {
      if (c.type === "key-down" && c.key === "Backspace") {
        expect(inputs[i + 1]).toEqual({ type: "key-up", key: "Backspace" });
      }
    });
  });
});

test.describe("Clickpad ordering", () => {
  test("a quick drag then tap sends the pending move before the click", async ({ page, mockRemote }) => {
    await page.goto(mockRemote.phoneUrl);
    await expect(page.getByText("Swipe to move")).toBeVisible();

    for (let round = 0; round < 5; round++) {
      const before = mockRemote.ofKind("input").length;
      // One synchronous burst: no animation frame can flush the move before the tap lands.
      await page.evaluate(() => {
        const pad = document.querySelector(".clickpad")!;
        const rect = pad.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const touch = (px: number) =>
          new Touch({ identifier: 1, target: pad, clientX: px, clientY: y, pageX: px, pageY: y });
        const fire = (type: string, px: number, list: Touch[]) =>
          pad.dispatchEvent(
            new TouchEvent(type, {
              bubbles: true,
              cancelable: true,
              touches: type === "touchend" ? [] : list,
              targetTouches: type === "touchend" ? [] : list,
              changedTouches: list,
            }),
          );
        fire("touchstart", x, [touch(x)]);
        fire("touchmove", x + 3, [touch(x + 3)]);
        fire("touchmove", x + 6, [touch(x + 6)]);
        fire("touchend", x + 6, [touch(x + 6)]);
      });
      await expect
        .poll(() => mockRemote.ofKind("input").slice(before).some((m) => m.command.type === "pointer-click"))
        .toBe(true);
      // Give any (incorrectly) late move time to arrive.
      await page.waitForTimeout(150);
      const burst = mockRemote.ofKind("input").slice(before).map((m) => m.command);
      expect(burst.at(-1)).toEqual({ type: "pointer-click", button: "left" });
      const move = burst.find((c) => c.type === "pointer-move");
      expect(move, "the drag's pointer-move must be sent").toBeTruthy();
      expect(burst.indexOf(move)).toBeLessThan(burst.findIndex((c) => c.type === "pointer-click"));
    }
  });
});

test.describe("Reconnect", () => {
  test("a dropped socket reconnects once, with exactly one hello", async ({ page, mockRemote }) => {
    await page.goto(mockRemote.phoneUrl);
    await expect(page.getByRole("button", { name: "Play or pause" })).toBeVisible();
    await expect.poll(() => mockRemote.ofKind("hello").length).toBe(1);

    for (let n = 2; n <= 3; n++) {
      mockRemote.dropClients();
      await expect.poll(() => mockRemote.ofKind("hello").length, { timeout: 10_000 }).toBe(n);
      await expect(page.getByText("Connected", { exact: true })).toBeVisible();
      // Settle: no duplicate hello burst / extra sockets after the reconnect.
      await page.waitForTimeout(2500);
      expect(mockRemote.ofKind("hello")).toHaveLength(n);
    }
  });
});
