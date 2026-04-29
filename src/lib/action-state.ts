export type ActionStatus = "idle" | "success" | "warning" | "error";

export type ActionResult = {
  status: ActionStatus;
  title?: string;
  message?: string;
};

export const idleActionResult: ActionResult = {
  status: "idle",
};

export function successResult(message: string, title = "Success"): ActionResult {
  return {
    status: "success",
    title,
    message,
  };
}

export function warningResult(message: string, title = "Action blocked"): ActionResult {
  return {
    status: "warning",
    title,
    message,
  };
}

export function errorResult(message: string, title = "Something went wrong"): ActionResult {
  return {
    status: "error",
    title,
    message,
  };
}
