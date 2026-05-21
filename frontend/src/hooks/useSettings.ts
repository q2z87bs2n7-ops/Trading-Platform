import { useEffect, useState } from "react";

import {
  getSettings,
  subscribeSettings,
  type AppSettings,
} from "../lib/settings";

export function useSettings(): AppSettings {
  const [s, setS] = useState<AppSettings>(getSettings());
  useEffect(() => subscribeSettings(setS), []);
  return s;
}
