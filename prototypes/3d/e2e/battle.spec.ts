import { expect, test } from "@playwright/test";

test("hunter headspace opens as interactive 3D cards and exits cleanly", async ({ page }) => {
  await page.goto("/?debug=1");
  await page.getByRole("button", { name: /刃手.*裂刃/ }).click();
  await expect(page.locator('[data-world-card-id="focus"]')).toBeVisible();
  await expect(page.locator('[data-world-card-id="will-endure"]')).toBeDisabled();
  await page.getByRole("button", { name: "退出头脑卡桌 · Esc" }).click();
  await expect(page.locator('[data-world-card-id="focus"]')).not.toBeVisible();
  await expect(page.getByRole("button", { name: "聚焦当前猎人头脑" })).toBeVisible();
});

test("focus dice, overflow, and fate deviation form a playable UI path", async ({ page }) => {
  await page.goto("/?debug=1");
  await expect(page.getByText("裂颅屠影 · 决战纵切片")).toBeVisible();

  await page.getByRole("button", { name: /刃手.*裂刃/ }).click();
  await page.locator('[data-world-card-id="focus"]').click();
  await page.keyboard.press("Space");
  await expect(page.getByText("专注 · 物理灵感骰")).toBeVisible();
  await page.evaluate(() => window.__HID3D__!.dispatch({ type: "resolveFocus", colors: ["red", "blue"] }));
  await expect(page.getByText("新的灵感没有位置")).toBeVisible();
  await page.getByRole("button", { name: "丢弃新灵感" }).click();

  await page.getByRole("button", { name: "结束全队前摇" }).click();
  await expect(page.getByText("遵守，还是扭曲命运？")).toBeVisible();
  await page.locator("section.monster-controls").getByRole("button", { name: "斥候", exact: true }).click();
  await page.locator("section.monster-controls").getByRole("button", { name: "确认并执行 Boss 行动" }).click();
  await expect(page.getByRole("button", { name: /刃手.*命运 1/ })).toBeVisible();
});

test("attack ordering, lethal interruption, survival event, and victory overlays render", async ({ page }) => {
  await page.goto("/?debug=1");
  await page.evaluate(() => {
    const debug = window.__HID3D__!;
    debug.engine.state.hunters[0].position = { q: 1, r: 0 };
    debug.engine.state.monster.hp = 1;
    debug.refresh();
  });
  await page.getByRole("button", { name: /刃手.*裂刃/ }).click();
  await page.locator(".world-card-face.mind.red").first().dragTo(page.locator('[data-world-card-id="attack"]'));
  await expect(page.locator('[data-world-card-id="attack"] .stored-mind')).toBeVisible();
  await page.locator('[data-world-card-id="attack"]').click();
  await page.keyboard.press("Space");
  await expect(page.getByText("分配结果，重排部位")).toBeVisible();
  await page.evaluate(() => {
    const debug = window.__HID3D__!;
    debug.engine.state.pendingAttack!.results = debug.engine.state.pendingAttack!.results.map(() => "success");
    debug.engine.state.pendingAttack!.assignments = debug.engine.state.pendingAttack!.results.map((_, index) => index);
    debug.refresh();
  });
  await page.getByRole("button", { name: "从左至右锁定结算" }).click();
  await expect(page.getByText("战斗报告")).toBeVisible();

  await page.getByRole("button", { name: "重置首局教学" }).click();
  await page.evaluate(() => {
    const debug = window.__HID3D__!;
    const hunter = debug.engine.state.hunters[0];
    hunter.wounds.head = 0;
    hunter.armor.head = 0;
    debug.engine.state.pendingBody = { hunterId: hunter.id, amount: 1, precision: 2, source: "测试致命攻击", choices: ["head", "torso", "arms", "legs"] };
    debug.refresh();
  });
  await page.locator(".hidden-cards button").filter({ hasText: "选择部位" }).first().click();
  await expect(page.getByText("死亡牌堆")).toBeVisible();
  await page.evaluate(() => {
    const debug = window.__HID3D__!;
    const pending = debug.engine.state.pendingDeath!;
    pending.choices = [...pending.choices].sort((a, b) => a.type === "survive" ? -1 : b.type === "survive" ? 1 : 0);
    debug.refresh();
  });
  await page.locator(".death-cards button").first().click();
  await expect(page.getByText("幸运 +1")).toBeVisible();
});
