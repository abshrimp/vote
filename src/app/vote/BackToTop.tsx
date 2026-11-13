"use client";

import { useEffect, useState } from "react";
import styles from "./backToTop.module.css";

export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let wasVisible = false;
    const onScroll = () => {
      const nextVisible = window.scrollY > 320;
      if (nextVisible !== wasVisible) {
        wasVisible = nextVisible;
        setVisible(nextVisible);
      }
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      className={`${styles.backToTop} ${visible ? styles.visible : ""}`}
      aria-label="ページトップに戻る"
      title="ページトップに戻る"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={() => {
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        });
      }}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 19V5m-6 6 6-6 6 6" />
      </svg>
    </button>
  );
}
