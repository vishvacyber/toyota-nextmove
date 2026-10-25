import { createContext } from "react";

/** True inside the kiosk shell (attract loop, idle reset, 64px targets); false in the phone app. */
export const KioskContext = createContext(false);
