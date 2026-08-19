import { describe, it, expect } from "vitest";

describe("main.js (точка входа)", () => {
  it("должен импортироваться без ошибок (все модули разрешаются)", async () => {
    const mod = await import("../main.js");
    expect(mod).toBeDefined();
  });
});
