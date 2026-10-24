// The Projects page had no way in (cleanup Batch 4): a group with
// projects.view but no Crew tab could only reach /app/projects by typing it.
// Crew More now links it for them. A seat and group made on this worktree's
// local database only, and removed after.

import { execSync } from "node:child_process";

import { expect, signIn, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

test.describe("Projects: reachable without the Crew tab", () => {
  test("A seat with projects.view and no crew.view finds it under More; a crew lead does not get a second copy", async ({ context, page }) => {
    const n = Date.now().toString().slice(-7);
    const group = `e2e-proj-${n}`;
    const email = `e2e.projects.${n}@example.com`;
    sql(`insert into public.crew_groups (id, name, description, perms, builtin, created_by) values ('${group}', 'E2E watcher ${n}', '', '["clock", "receipts", "projects.view"]'::jsonb, false, 'e2e')`);
    sql(`insert into public.crew_people (email, name, group_id) values ('${email}', 'E2E Watcher ${n}', '${group}')`);
    try {
      await signIn(context, email, { crew: true });
      await page.goto("/app/more");
      await page.getByTestId("more-projects").click();
      await expect(page).toHaveURL(/\/app\/projects$/);
      await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();

      // A lead has Crew > Jobs already: no second way in on More.
      sql(`update public.crew_groups set perms = '["clock", "receipts", "projects.view", "crew.view"]'::jsonb where id = '${group}'`);
      await page.goto("/app/more");
      await expect(page.getByText(/Language|Idioma/).first()).toBeVisible();
      await expect(page.getByTestId("more-projects")).toHaveCount(0);
    } finally {
      sql(`delete from public.crew_people where email = '${email}'`);
      sql(`delete from public.crew_groups where id = '${group}'`);
    }
  });
});
