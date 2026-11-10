import { test } from "node:test";
import assert from "node:assert/strict";
import { Role } from "@/prisma/generated/enums";
import { can } from "@/app/lib/auth/can";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { examplesForTools } from "./chat-examples";
import { toolNamesForActor } from "./tool-permissions";
import { WRITE_TOOL_NAMES } from "./tool-names";

const actor = (role: string) => ({ userId: "u1", personId: "p1", role });

test("every role that may use the chat gets both guide tools, and no other role does", () => {
  for (const role of Object.values(Role)) {
    const names = toolNamesForActor(actor(role));
    const expected = can(role, AppPermissions.AI_CHAT_USE);
    assert.equal(names.includes("searchGuides"), expected, `${role} searchGuides`);
    assert.equal(names.includes("readGuide"), expected, `${role} readGuide`);
  }
  // Volunteers have no write tool, but still read the guides.
  const volunteer = toolNamesForActor(actor(Role.VOLUNTEER));
  assert.ok(volunteer.includes("searchGuides"));
  assert.ok(!volunteer.includes("setTaskStatus"));
});

test("the guide tools only read, so they need no approval secret", () => {
  assert.ok(!WRITE_TOOL_NAMES.includes("searchGuides"));
  assert.ok(!WRITE_TOOL_NAMES.includes("readGuide"));
});

test("the rabies example is offered to anyone with the guide tools", () => {
  const offered = (role: string) =>
    examplesForTools(toolNamesForActor(actor(role))).some(
      (example) => example.prompt === "How do I record a rabies vaccine?",
    );
  assert.equal(offered(Role.VOLUNTEER), true);
  assert.equal(offered(Role.STAFF), true);
  assert.equal(offered(Role.USER), false);
});
