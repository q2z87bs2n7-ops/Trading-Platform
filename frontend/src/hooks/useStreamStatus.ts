import { useEffect, useState } from "react";

import {
  getStreamStatus,
  subscribeStreamStatus,
  type StreamStatus,
} from "../lib/stream-status";

export function useStreamStatus(): StreamStatus {
  const [s, setS] = useState<StreamStatus>(getStreamStatus());
  useEffect(() => subscribeStreamStatus(setS), []);
  return s;
}
