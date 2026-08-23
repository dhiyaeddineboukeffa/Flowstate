import { getParentTasks, loginUser, getUserPomodoroState } from "./src/lib/actions";

// Mock cookies for testing server action
jest = require('jest-mock');
const nextHeaders = require("next/headers");
nextHeaders.cookies = jest.fn().mockResolvedValue({
  get: () => ({ value: "05d02346-43a8-4dec-9f99-043e222eddf3" }),
  set: () => {}
});

async function run() {
  try {
    const state = await getUserPomodoroState();
    console.log("User State:", state);

    const tasks = await getParentTasks();
    console.log("Tasks:", JSON.stringify(tasks, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
