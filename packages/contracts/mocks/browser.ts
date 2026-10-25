import { setupWorker } from "msw/browser";
import { activeHandlers } from "./handlers";

export const worker = setupWorker(...activeHandlers(process.env.NEXT_PUBLIC_API_MOCKING));
