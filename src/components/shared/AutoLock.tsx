import React, { useEffect } from "react";

type Props = {
  onLock: () => void;
  timeoutMs?: number;
};

export default function AutoLock({ onLock, timeoutMs = 2 * 60 * 1000 }: Props) {
  useEffect(() => {
    let timer = setTimeout(onLock, timeoutMs);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(onLock, timeoutMs);
    };
    window.addEventListener("mousemove", reset);
    window.addEventListener("keydown", reset);
    window.addEventListener("mousedown", reset);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", reset);
      window.removeEventListener("keydown", reset);
      window.removeEventListener("mousedown", reset);
    };
  }, [onLock, timeoutMs]);
  return null;
}
