"use client";

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

/** Starts as a single line and grows with its content (no scrollbar, no resize handle). */
export default function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = element.scrollHeight + "px";
  }, [props.value]);
  return <textarea {...props} ref={ref} rows={1} style={{ ...props.style, resize: "none", overflow: "hidden" }} />;
}
