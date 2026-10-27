"use client";

// The person's dashboard layout (lib/dash-layout), the same on every device (lib/user-prefs)

import { DEFAULT_LAYOUT, type DashLayout, readLayout } from "./dash-layout";
import { usePref } from "./user-prefs";

export const useDashLayout = () => usePref<DashLayout>("dash", readLayout, DEFAULT_LAYOUT);
